//! Resolução de conflito: arquivos não mesclados do index e o editor de trechos (Atual × Entrando × base).
use crate::application::git::RepoGit;
use crate::application::ports::GitCmd;
use crate::domain::error::{CoreError, Result};
use serde::Serialize;
use std::collections::BTreeMap;

/// Marcador longo para o texto do arquivo dificilmente colidir com ele.
const MARKER: usize = 13;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictFile {
    pub path: String,
    /// both, bothAdded, deletedByUs, deletedByThem, addedByUs, addedByThem, bothDeleted
    pub kind: &'static str,
    /// Sem editor de linhas: só escolher um lado.
    pub binary: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Segment {
    Text { lines: Vec<String> },
    /// `auto`: Atual e Entrando só diferem em espaço em branco (a UI pré-escolhe o Atual).
    Conflict { ours: Vec<String>, theirs: Vec<String>, base: Vec<String>, auto: bool },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictDoc {
    pub path: String,
    pub segments: Vec<Segment>,
    pub final_newline: bool,
}

/// Blobs dos estágios 1 (base), 2 (atual) e 3 (entrando) de cada arquivo não mesclado.
fn unmerged(git: &RepoGit) -> Result<BTreeMap<String, [Option<String>; 3]>> {
    let out = git.exec(&GitCmd::new(["ls-files", "-u", "-z"]))?;
    let mut map: BTreeMap<String, [Option<String>; 3]> = BTreeMap::new();
    for entry in out.stdout.split(|b| *b == 0).filter(|e| !e.is_empty()) {
        let text = String::from_utf8_lossy(entry);
        let Some((meta, path)) = text.split_once('\t') else { continue };
        let mut f = meta.split(' ');
        let (_mode, sha, stage) = (f.next(), f.next(), f.next());
        if let (Some(sha), Some(stage @ 1..=3)) = (sha, stage.and_then(|s| s.parse::<usize>().ok())) {
            map.entry(path.to_string()).or_default()[stage - 1] = Some(sha.to_string());
        }
    }
    Ok(map)
}

fn blob(git: &RepoGit, sha: &Option<String>) -> Result<Vec<u8>> {
    match sha {
        Some(sha) => Ok(git.exec(&GitCmd::new(["cat-file", "blob", sha]))?.stdout),
        None => Ok(Vec::new()),
    }
}

fn is_text(b: &[u8]) -> bool {
    !b.contains(&0) && std::str::from_utf8(b).is_ok()
}

fn kind_of(s: &[Option<String>; 3]) -> &'static str {
    match (s[0].is_some(), s[1].is_some(), s[2].is_some()) {
        (true, true, true) => "both",
        (false, true, true) => "bothAdded",
        (true, false, true) => "deletedByUs",
        (true, true, false) => "deletedByThem",
        (false, true, false) => "addedByUs",
        (false, false, true) => "addedByThem",
        _ => "bothDeleted",
    }
}

pub fn list(git: &RepoGit) -> Result<Vec<ConflictFile>> {
    unmerged(git)?
        .into_iter()
        .map(|(path, stages)| {
            let binary = !stages.iter().try_fold(true, |ok, s| blob(git, s).map(|b| ok && is_text(&b)))?;
            Ok(ConflictFile { path, kind: kind_of(&stages), binary })
        })
        .collect()
}

fn stages_of(git: &RepoGit, file: &str) -> Result<[Option<String>; 3]> {
    unmerged(git)?.remove(file).ok_or_else(|| CoreError::invalid(format!("{file} não está em conflito")))
}

fn squash(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Mescla de três vias (diff3 com zdiff3: linhas comuns nas bordas saem do conflito) em trechos.
pub fn file(git: &RepoGit, file: &str) -> Result<ConflictDoc> {
    let stages = stages_of(git, file)?;
    let [base, ours, theirs] = [blob(git, &stages[0])?, blob(git, &stages[1])?, blob(git, &stages[2])?];
    if ![&base, &ours, &theirs].into_iter().all(|b| is_text(b)) {
        return Err(CoreError::invalid(format!("{file} é binário: use um dos lados")));
    }
    let dir = git.git_dir()?.join(format!("mnemo-conflict-{}", std::process::id()));
    std::fs::create_dir_all(&dir)?;
    let merged = (|| -> Result<Vec<u8>> {
        for (name, data) in [("ours", &ours), ("base", &base), ("theirs", &theirs)] {
            std::fs::write(dir.join(name), data)?;
        }
        let mut cmd = GitCmd::new([
            "merge-file", "-p", "--diff3", "--zdiff3", &format!("--marker-size={MARKER}"),
            "-L", "ours", "-L", "base", "-L", "theirs",
        ])
        .also_ok(255);
        cmd.args.extend(["ours", "base", "theirs"].map(|n| dir.join(n).to_string_lossy().into_owned()));
        for n in 1..=127 {
            cmd = cmd.also_ok(n);
        }
        Ok(git.exec(&cmd)?.stdout)
    })();
    let _ = std::fs::remove_dir_all(&dir);
    let merged = String::from_utf8_lossy(&merged?).into_owned();
    let final_newline = merged.ends_with('\n');
    Ok(ConflictDoc { path: file.to_string(), segments: parse(&merged), final_newline })
}

fn parse(merged: &str) -> Vec<Segment> {
    let [open, mid, sep, close] = ["<", "|", "=", ">"].map(|c| c.repeat(MARKER));
    let mut body = merged.strip_suffix('\n').unwrap_or(merged);
    if merged.is_empty() {
        body = "";
    }
    let mut segments = Vec::new();
    let mut text: Vec<String> = Vec::new();
    // 0 = fora, 1 = atual, 2 = base, 3 = entrando
    let (mut state, mut ours, mut base, mut theirs) = (0, Vec::new(), Vec::new(), Vec::new());
    let marker = |l: &str, m: &str| l == m || l.strip_prefix(m).is_some_and(|r| r.starts_with(' '));
    for line in body.split('\n') {
        match state {
            0 if marker(line, &open) => {
                if !text.is_empty() {
                    segments.push(Segment::Text { lines: std::mem::take(&mut text) });
                }
                state = 1;
            }
            0 => text.push(line.to_string()),
            1 if marker(line, &mid) => state = 2,
            2 if line == sep => state = 3,
            3 if marker(line, &close) => {
                let auto = squash(&ours.join("\n")) == squash(&theirs.join("\n"));
                segments.push(Segment::Conflict {
                    ours: std::mem::take(&mut ours),
                    theirs: std::mem::take(&mut theirs),
                    base: std::mem::take(&mut base),
                    auto,
                });
                state = 0;
            }
            1 => ours.push(line.to_string()),
            2 => base.push(line.to_string()),
            _ => theirs.push(line.to_string()),
        }
    }
    if !text.is_empty() || segments.is_empty() {
        segments.push(Segment::Text { lines: text });
    }
    segments
}

/// Grava o resultado e marca o arquivo como resolvido.
pub fn save(git: &RepoGit, file: &str, content: &str) -> Result<()> {
    stages_of(git, file)?;
    std::fs::write(git.workdir().join(file), content)?;
    git.run(["add", "--", file])
}

/// `choice`: base, ours (Atual), theirs (Entrando) ou delete. Um lado que apagou o arquivo não tem versão para manter.
pub fn take(git: &RepoGit, file: &str, choice: &str) -> Result<()> {
    let stages = stages_of(git, file)?;
    let stage = match choice {
        "delete" => return git.run(["rm", "-f", "-q", "--", file]),
        "base" => 0,
        "ours" => 1,
        "theirs" => 2,
        other => return Err(CoreError::invalid(format!("escolha inválida: {other}"))),
    };
    if stages[stage].is_none() {
        return Err(CoreError::invalid("esse lado não tem uma versão do arquivo (foi apagado)"));
    }
    std::fs::write(git.workdir().join(file), blob(git, &stages[stage])?)?;
    git.run(["add", "--", file])
}

/// Volta arquivos resolvidos para conflito.
pub fn reopen(git: &RepoGit, files: &[String]) -> Result<()> {
    let mut args = vec!["checkout".to_string(), "-m".into(), "--".into()];
    args.extend(files.iter().cloned());
    git.run(args)
}

/// Abre a ferramenta de merge configurada no git. Não guarda cópia `.orig`.
pub fn mergetool(git: &RepoGit, file: &str) -> Result<()> {
    stages_of(git, file)?;
    if git.exec(&GitCmd::new(["config", "--get", "merge.tool"]).also_ok(1))?.code != 0 {
        return Err(CoreError::invalid("Nenhuma ferramenta de merge configurada (merge.tool)"));
    }
    git.run(["-c", "mergetool.keepBackup=false", "mergetool", "--no-prompt", "--", file])
}
