//! Revisão de uma branch (ADR 0008): Rodadas presas a um commit, com arquivos revisados e comentários.
//! Nada aqui cria branch nem faz checkout: o diff de cada Rodada é calculado na hora.
use crate::application::detail::{parse_name_status, parse_numstat};
use crate::application::git::RepoGit;
use crate::application::ports::GitCmd;
use crate::application::NETWORK_TIMEOUT;
use crate::domain::error::{CoreError, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

/// Ler, alterar e gravar o JSON não pode se cruzar (dois cliques seguidos no checkbox).
static LOCK: Mutex<()> = Mutex::new(());
static TMP: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Side {
    Old,
    New,
}

/// Diff em que o comentário foi feito: o da Rodada ou o da branch inteira.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Scope {
    Round,
    Branch,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineRange {
    pub side: Side,
    pub start: u32,
    pub end: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: String,
    pub file: String,
    #[serde(default)]
    pub old_path: Option<String>,
    /// `None` = comentário no arquivo inteiro.
    #[serde(default)]
    pub lines: Option<LineRange>,
    /// Cópia das linhas comentadas: o relatório não depende de o arquivo continuar igual.
    #[serde(default)]
    pub snippet: Vec<String>,
    pub body: String,
    pub scope: Scope,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Round {
    pub number: u32,
    pub base: String,
    pub merge_base: String,
    /// Commit da Rodada concluída anterior; `None` na primeira (o diff parte do merge-base).
    pub from: Option<String>,
    pub tip: String,
    pub started_ms: u64,
    pub concluded_ms: Option<u64>,
    pub reviewed: Vec<String>,
    pub comments: Vec<Comment>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Review {
    pub branch: String,
    pub rounds: Vec<Round>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewFile {
    pub path: String,
    pub old_path: Option<String>,
    pub status: String,
    pub added: Option<u64>,
    pub removed: Option<u64>,
    /// O arquivo voltou a ficar igual à Base desde a Rodada anterior: não há diff para revisar.
    pub reverted: bool,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchStatus {
    /// Ponta atual da branch; `None` quando ela não existe mais (nem local nem remota).
    pub tip: Option<String>,
    /// Commits que chegaram depois do commit da Rodada.
    pub ahead: u64,
    /// A branch foi reescrita (rebase, force push): o commit da Rodada não está mais nela.
    pub rewritten: bool,
    /// A ponta já está na Base.
    pub merged: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewState {
    pub review: Review,
    pub files: Vec<ReviewFile>,
    pub status: BranchStatus,
}

/// Commit revisado no grafo. Reescrita a branch, o marcador da última Rodada vai para a ponta atual.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Marker {
    pub sha: String,
    pub round: u32,
    pub comments: usize,
    pub concluded_ms: u64,
    pub rewritten: bool,
    /// Commit que a Rodada revisou (difere de `sha` quando a branch foi reescrita).
    pub reviewed: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewSummary {
    pub branch: String,
    pub round: u32,
    pub open: bool,
    pub reviewed: usize,
    pub files: usize,
    pub status: BranchStatus,
    pub markers: Vec<Marker>,
}

fn unavailable(reason: impl Into<String>) -> CoreError {
    CoreError::Unavailable { reason: reason.into() }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

fn lock() -> Result<std::sync::MutexGuard<'static, ()>> {
    LOCK.lock().map_err(|_| CoreError::internal("lock das Revisões envenenado"))
}

/// `<git-common-dir>/mnemo/reviews`: vale para todos os worktrees e nunca é commitado.
fn dir(git: &RepoGit) -> Result<PathBuf> {
    let common = PathBuf::from(git.text(["rev-parse", "--git-common-dir"])?);
    let common = if common.is_absolute() { common } else { git.workdir().join(common) };
    Ok(common.join("mnemo").join("reviews"))
}

/// Nome da branch como nome de arquivo: `/` e o que o Windows recusa viram `%XX`.
fn file_name(branch: &str) -> String {
    let mut out = String::new();
    for b in branch.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out + ".json"
}

fn round_ref(branch: &str, number: u32) -> String {
    format!("refs/mnemo/review/{branch}/round-{number}")
}

fn load(git: &RepoGit, branch: &str) -> Result<Option<Review>> {
    match std::fs::read(dir(git)?.join(file_name(branch))) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|e| CoreError::Store { message: format!("Revisão de {branch} ilegível: {e}") }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

fn save(git: &RepoGit, review: &Review) -> Result<()> {
    let dir = dir(git)?;
    std::fs::create_dir_all(&dir)?;
    let target = dir.join(file_name(&review.branch));
    let tmp = target.with_extension(format!("json.{}.{}.tmp", std::process::id(), TMP.fetch_add(1, Ordering::Relaxed)));
    let bytes = serde_json::to_vec_pretty(review).map_err(|e| CoreError::internal(e.to_string()))?;
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, &target)?;
    Ok(())
}

/// Nome de branch vindo da UI: precisa ser um nome válido para o git (e nunca uma opção).
fn check_branch(git: &RepoGit, name: &str) -> Result<()> {
    let out = git.exec(&GitCmd::new(["check-ref-format", &format!("refs/heads/{name}")]).also_ok(1))?;
    if name.is_empty() || name.starts_with('-') || out.code != 0 {
        return Err(CoreError::invalid(format!("nome de branch inválido: {name}")));
    }
    Ok(())
}

fn sha_of(git: &RepoGit, rev: &str) -> Option<String> {
    let out =
        git.exec(&GitCmd::new(["rev-parse", "--verify", "--quiet", &format!("{rev}^{{commit}}")]).also_ok(1)).ok()?;
    (out.code == 0).then(|| out.text())
}

fn is_ancestor(git: &RepoGit, ancestor: &str, of: &str) -> Result<bool> {
    Ok(git.exec(&GitCmd::new(["merge-base", "--is-ancestor", ancestor, of]).also_ok(1))?.code == 0)
}

/// Remoto da branch: o do upstream da local, se tiver o mesmo nome; senão origin ou o primeiro que a tenha.
fn remote_of(git: &RepoGit, name: &str) -> Result<Option<String>> {
    let mut remotes = git.remotes()?;
    if let Some(up) = git.upstream(name)? {
        if let Some(r) = remotes.iter().find(|r| up == format!("{r}/{name}")) {
            return Ok(Some(r.clone()));
        }
    }
    remotes.sort_by_key(|r| r != "origin");
    Ok(remotes.into_iter().find(|r| sha_of(git, &format!("refs/remotes/{r}/{name}")).is_some()))
}

/// Ponta de uma branch pelo nome sem o remoto: a local, se ela contém a remota; senão a remota, que é o que vai ser mergeado.
pub fn tip_of(git: &RepoGit, name: &str) -> Result<Option<String>> {
    let local = sha_of(git, &format!("refs/heads/{name}"));
    let remote = remote_of(git, name)?.and_then(|r| sha_of(git, &format!("refs/remotes/{r}/{name}")));
    Ok(match (local, remote) {
        (Some(l), Some(r)) => Some(if l == r || is_ancestor(git, &r, &l)? { l } else { r }),
        (l, r) => l.or(r),
    })
}

/// Base registrada da branch; sem registro, a branch padrão do repositório.
pub fn base_of(git: &RepoGit, branch: &str) -> Result<Option<String>> {
    check_branch(git, branch)?;
    let saved = git.exec(&GitCmd::new(["config", "--get", &format!("branch.{branch}.mnemoBase")]).also_ok(1))?.text();
    if !saved.is_empty() {
        return Ok(Some(saved));
    }
    let mut remotes = git.remotes()?;
    remotes.sort_by_key(|r| r != "origin");
    for r in &remotes {
        let head =
            git.exec(&GitCmd::new(["symbolic-ref", "-q", "--short", &format!("refs/remotes/{r}/HEAD")]).also_ok(1))?;
        if let Some(name) = head.text().strip_prefix(&format!("{r}/")).filter(|n| *n != branch) {
            return Ok(Some(name.to_string()));
        }
    }
    for name in ["main", "master", "develop", "trunk"] {
        if name != branch && tip_of(git, name)?.is_some() {
            return Ok(Some(name.to_string()));
        }
    }
    Ok(None)
}

/// Busca só esta branch no remoto. `Some(motivo)` quando não deu (sem rede, branch sumiu do servidor): a Revisão segue com o que já existe aqui.
pub fn fetch(git: &RepoGit, branch: &str) -> Result<Option<String>> {
    check_branch(git, branch)?;
    let Some(remote) = remote_of(git, branch)? else { return Ok(None) };
    match git
        .exec(&GitCmd::new(["fetch", "--no-tags", &remote, &format!("refs/heads/{branch}")]).timeout(NETWORK_TIMEOUT))
    {
        Ok(_) => Ok(None),
        Err(CoreError::GitFailed { stderr, .. }) => Ok(Some(
            stderr.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("falha ao buscar").trim().to_string(),
        )),
        Err(e) => Err(e),
    }
}

/// Começa a Revisão ou a próxima Rodada. Com uma Rodada aberta, ou sem nada novo desde a última, devolve a que existe.
pub fn start(git: &RepoGit, branch: &str, base: &str) -> Result<ReviewState> {
    check_branch(git, branch)?;
    check_branch(git, base)?;
    if branch == base {
        return Err(unavailable("A branch e a Base são a mesma"));
    }
    let tip = tip_of(git, branch)?.ok_or_else(|| unavailable(format!("{branch} não existe")))?;
    let base_tip = tip_of(git, base)?.ok_or_else(|| unavailable(format!("A Base {base} não existe")))?;
    git.run(["config", "--local", &format!("branch.{branch}.mnemoBase"), base])?;
    let _guard = lock()?;
    let mut review = load(git, branch)?.unwrap_or_else(|| Review { branch: branch.into(), rounds: Vec::new() });
    let next = match review.rounds.last() {
        Some(r) if r.concluded_ms.is_none() => false,
        Some(r) => r.tip != tip,
        None => true,
    };
    if next {
        let out = git.exec(&GitCmd::new(["merge-base", &base_tip, &tip]).also_ok(1))?;
        if out.code != 0 {
            return Err(unavailable(format!("{branch} e {base} não têm histórico em comum")));
        }
        let merge_base = out.text();
        if review.rounds.is_empty() && merge_base == tip {
            return Err(unavailable(format!("{branch} não tem nada que {base} ainda não tenha")));
        }
        let number = review.rounds.len() as u32 + 1;
        // presa já ao começar: um force push no meio da Rodada não deixa o git coletar o commit revisado
        git.run(["update-ref", &round_ref(branch, number), &tip])?;
        review.rounds.push(Round {
            number,
            base: base.into(),
            merge_base,
            from: review.rounds.last().map(|r| r.tip.clone()),
            tip,
            started_ms: now_ms(),
            concluded_ms: None,
            reviewed: Vec::new(),
            comments: Vec::new(),
        });
        save(git, &review)?;
    }
    state(git, review)
}

pub fn open(git: &RepoGit, branch: &str) -> Result<ReviewState> {
    check_branch(git, branch)?;
    let review = load(git, branch)?.ok_or_else(|| unavailable(format!("Não há Revisão de {branch}")))?;
    state(git, review)
}

fn state(git: &RepoGit, review: Review) -> Result<ReviewState> {
    let round = review.rounds.last().ok_or_else(|| CoreError::internal("Revisão sem Rodada"))?;
    let files = files(git, &review, round)?;
    let status = status(git, &review.branch, round)?;
    Ok(ReviewState { review, files, status })
}

fn status(git: &RepoGit, branch: &str, round: &Round) -> Result<BranchStatus> {
    let Some(tip) = tip_of(git, branch)? else { return Ok(BranchStatus::default()) };
    let (ahead, rewritten) = if tip == round.tip {
        (0, false)
    } else if is_ancestor(git, &round.tip, &tip)? {
        (git.text(["rev-list", "--count", &format!("{}..{tip}", round.tip)])?.parse().unwrap_or(0), false)
    } else {
        (0, true)
    };
    let merged = match tip_of(git, &round.base)? {
        Some(base) => is_ancestor(git, &tip, &base)?,
        None => false,
    };
    Ok(BranchStatus { tip: Some(tip), ahead, rewritten, merged })
}

/// Arquivos que mudaram de `from` para `to`, com +/−.
fn changes(git: &RepoGit, from: &str, to: &str) -> Result<Vec<ReviewFile>> {
    let diff = |flag: &str| git.exec(&GitCmd::new(["diff-tree", "-r", "-M", "-z", flag, from, to]));
    let mut files: Vec<ReviewFile> = parse_name_status(&diff("--name-status")?.stdout)
        .into_iter()
        .map(|f| ReviewFile {
            path: f.path,
            old_path: f.old_path,
            status: f.status,
            added: None,
            removed: None,
            reverted: false,
        })
        .collect();
    let stats = parse_numstat(&diff("--numstat")?.stdout);
    for file in &mut files {
        if let Some((a, r)) = stats.get(&file.path) {
            (file.added, file.removed) = (*a, *r);
        }
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}

/// Primeira Rodada: o diff líquido da branch. Nas seguintes, só o que mudou desde a anterior e continua no diff líquido:
/// o que veio de um merge da Base (ou de um rebase) fica de fora.
fn files(git: &RepoGit, review: &Review, round: &Round) -> Result<Vec<ReviewFile>> {
    let net = changes(git, &round.merge_base, &round.tip)?;
    let Some(from) = &round.from else { return Ok(net) };
    let names = |files: &[ReviewFile]| -> HashSet<String> {
        files.iter().flat_map(|f| std::iter::once(f.path.clone()).chain(f.old_path.clone())).collect()
    };
    let in_net = names(&net);
    let before = review.rounds.iter().find(|r| r.number + 1 == round.number);
    let in_before = match before {
        Some(r) => names(&changes(git, &r.merge_base, &r.tip)?),
        None => HashSet::new(),
    };
    let touches = |set: &HashSet<String>, f: &ReviewFile| {
        set.contains(&f.path) || f.old_path.as_ref().is_some_and(|o| set.contains(o))
    };
    Ok(changes(git, from, &round.tip)?
        .into_iter()
        .filter_map(|mut f| {
            if touches(&in_net, &f) {
                Some(f)
            } else if touches(&in_before, &f) {
                f.reverted = true;
                Some(f)
            } else {
                None
            }
        })
        .collect())
}

/// Altera a Rodada aberta e grava.
fn edit(git: &RepoGit, branch: &str, change: impl FnOnce(&mut Round) -> Result<()>) -> Result<Review> {
    check_branch(git, branch)?;
    let _guard = lock()?;
    let mut review = load(git, branch)?.ok_or_else(|| unavailable(format!("Não há Revisão de {branch}")))?;
    let round = review
        .rounds
        .last_mut()
        .filter(|r| r.concluded_ms.is_none())
        .ok_or_else(|| unavailable("Esta rodada já foi concluída"))?;
    change(round)?;
    save(git, &review)?;
    Ok(review)
}

pub fn mark(git: &RepoGit, branch: &str, file: &str, reviewed: bool) -> Result<Review> {
    edit(git, branch, |round| {
        round.reviewed.retain(|f| f != file);
        if reviewed {
            round.reviewed.push(file.to_string());
        }
        Ok(())
    })
}

/// Cria ou atualiza (mesmo `id`) um comentário da Rodada aberta.
pub fn comment(git: &RepoGit, branch: &str, mut comment: Comment) -> Result<Review> {
    let id_ok = !comment.id.is_empty()
        && comment.id.len() <= 64
        && comment.id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    if !id_ok || comment.file.is_empty() {
        return Err(CoreError::invalid("comentário sem id ou arquivo"));
    }
    comment.body = comment.body.trim().to_string();
    if comment.body.is_empty() {
        return Err(unavailable("O comentário está vazio"));
    }
    if comment.lines.as_ref().is_some_and(|l| l.start == 0 || l.end < l.start) {
        return Err(CoreError::invalid("intervalo de linhas inválido"));
    }
    edit(git, branch, |round| {
        match round.comments.iter_mut().find(|c| c.id == comment.id) {
            Some(existing) => *existing = comment,
            None => round.comments.push(comment),
        }
        Ok(())
    })
}

pub fn uncomment(git: &RepoGit, branch: &str, id: &str) -> Result<Review> {
    edit(git, branch, |round| {
        round.comments.retain(|c| c.id != id);
        Ok(())
    })
}

/// Conclui a Rodada: o commit dela vira Commit revisado (a ref oculta da Rodada o segura contra rebase e force push).
pub fn conclude(git: &RepoGit, branch: &str) -> Result<Review> {
    edit(git, branch, |round| {
        round.concluded_ms = Some(now_ms());
        Ok(())
    })
}

/// Encerra a Revisão: some o JSON e as refs ocultas (os commits voltam a poder ser coletados pelo git).
pub fn end(git: &RepoGit, branch: &str) -> Result<()> {
    check_branch(git, branch)?;
    let _guard = lock()?;
    let Some(review) = load(git, branch)? else { return Ok(()) };
    let stdin: String = review.rounds.iter().map(|r| format!("delete {}\0\0", round_ref(branch, r.number))).collect();
    if !stdin.is_empty() {
        git.exec(&GitCmd::new(["update-ref", "--stdin", "-z"]).stdin(stdin.into_bytes()))?;
    }
    match std::fs::remove_file(dir(git)?.join(file_name(branch))) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
        _ => Ok(()),
    }
}

/// Revisões do repositório, com o progresso da Rodada atual e os Commits revisados para o grafo. Arquivo ilegível fica de fora.
pub fn list(git: &RepoGit) -> Result<Vec<ReviewSummary>> {
    let entries = match std::fs::read_dir(dir(git)?) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e.into()),
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        if entry.path().extension().is_none_or(|e| e != "json") {
            continue;
        }
        let Some(review) = std::fs::read(entry.path()).ok().and_then(|b| serde_json::from_slice::<Review>(&b).ok())
        else {
            continue;
        };
        let Some(round) = review.rounds.last() else { continue };
        let files = files(git, &review, round)?;
        let status = status(git, &review.branch, round)?;
        let mut markers = Vec::new();
        for r in review.rounds.iter().filter(|r| r.concluded_ms.is_some()) {
            let kept = match &status.tip {
                Some(tip) => *tip == r.tip || is_ancestor(git, &r.tip, tip)?,
                None => false,
            };
            if kept {
                markers.push(marker(r, r.tip.clone(), false));
            }
        }
        if let (Some(last), Some(tip)) = (review.rounds.iter().rev().find(|r| r.concluded_ms.is_some()), &status.tip) {
            if !markers.iter().any(|m| m.round == last.number) {
                markers.push(marker(last, tip.clone(), true));
            }
        }
        let reviewed = files.iter().filter(|f| round.reviewed.contains(&f.path)).count();
        out.push(ReviewSummary {
            branch: review.branch.clone(),
            round: round.number,
            open: round.concluded_ms.is_none(),
            reviewed,
            files: files.len(),
            status,
            markers,
        });
    }
    out.sort_by(|a, b| a.branch.cmp(&b.branch));
    Ok(out)
}

fn marker(round: &Round, sha: String, rewritten: bool) -> Marker {
    Marker {
        sha,
        round: round.number,
        comments: round.comments.len(),
        concluded_ms: round.concluded_ms.unwrap_or(0),
        rewritten,
        reviewed: round.tip.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::file_name;

    #[test]
    fn nome_de_arquivo_escapa_barra_e_caracteres_fora_do_seguro() {
        assert_eq!(file_name("feature/x"), "feature%2Fx.json");
        assert_eq!(file_name("t12.x_a-b"), "t12.x_a-b.json");
        assert_eq!(file_name("a%b"), "a%25b.json");
    }
}
