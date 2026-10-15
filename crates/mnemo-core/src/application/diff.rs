//! Diff de um arquivo, já parseado para a UI (trechos, linhas, números), e stage por trecho/linha.
//! O patch parcial é montado a partir do diff relido aqui; a UI só manda índices.
use crate::application::encoding;
use crate::application::git::{RepoGit, EMPTY_TREE};
use crate::application::ports::GitCmd;
use crate::application::wip;
use crate::domain::error::{CoreError, Result};
use serde::{Deserialize, Serialize};

/// Acima disso o diff não é mostrado (a UI avisa).
const DIFF_SIZE_LIMIT: usize = 16 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum DiffSource {
    /// Commit contra o primeiro pai (raiz: árvore vazia).
    Commit { sha: String, #[serde(default)] old_path: Option<String> },
    /// Index → diretório de trabalho (inclui não rastreado).
    Unstaged,
    /// HEAD → index.
    Staged,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LineKind {
    Context,
    Add,
    Del,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub kind: LineKind,
    pub old: Option<u32>,
    pub new: Option<u32>,
    pub text: String,
    /// A linha não termina em quebra (`\ No newline at end of file`).
    pub no_newline: bool,
    /// Trecho a que pertence; `None` nas linhas entre trechos (arquivo inteiro).
    pub hunk: Option<u32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hunk {
    pub header: String,
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    /// Índice da primeira linha do trecho em `lines`, e quantas são.
    pub start: usize,
    pub len: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub old_path: Option<String>,
    pub binary: bool,
    pub too_large: bool,
    /// Nome para o rótulo; `encoding_id` é o que a UI manda de volta.
    pub encoding: String,
    pub encoding_id: String,
    /// O detector (e não UTF-8 válido ou BOM) escolheu a codificação.
    pub guessed: bool,
    /// Falso quando o texto mostrado foi convertido: os índices de linha não batem com o arquivo e o stage fica desligado.
    pub stageable: bool,
    pub added: u64,
    pub removed: u64,
    pub hunks: Vec<Hunk>,
    pub lines: Vec<DiffLine>,
}

struct RawLine {
    kind: LineKind,
    bytes: Vec<u8>,
    no_newline: bool,
}

struct RawHunk {
    old_start: u32,
    old_lines: u32,
    new_start: u32,
    new_lines: u32,
    lines: Vec<RawLine>,
}

#[derive(Default)]
struct RawDiff {
    old_path: Option<String>,
    /// O lado antigo não existe (arquivo novo / não rastreado).
    new_file: bool,
    binary: bool,
    too_large: bool,
    hunks: Vec<RawHunk>,
}

/// `choice`: `guess`, `binary` ou um id de `encoding::LIST`.
pub fn file_diff(git: &RepoGit, path: &str, source: &DiffSource, full: bool, choice: &str) -> Result<FileDiff> {
    if !choice.is_empty() && choice != encoding::GUESS && choice != encoding::BINARY && !encoding::is_known(choice) {
        return Err(CoreError::invalid(format!("codificação desconhecida: {choice}")));
    }
    let mut raw = load(git, path, source, false)?;
    // `Some` quando o texto precisa ser convertido para UTF-8 antes do diff (UTF-16/32)
    let mut converted: Option<(String, Vec<u8>)> = None;
    let (enc_id, guessed): (String, bool);
    if choice == encoding::BINARY {
        return Ok(FileDiff {
            path: path.to_string(),
            old_path: raw.old_path,
            binary: true,
            too_large: false,
            encoding: encoding::label(encoding::BINARY).into(),
            encoding_id: encoding::BINARY.into(),
            guessed: false,
            stageable: true,
            added: 0,
            removed: 0,
            hunks: Vec::new(),
            lines: Vec::new(),
        });
    }
    let wide_choice = encoding::is_wide(choice);
    let try_wide = wide_choice || ((choice.is_empty() || choice == encoding::GUESS) && raw.binary);
    if try_wide && !raw.too_large {
        let (old, new) = sides(git, path, source)?;
        let id = if wide_choice {
            Some(choice)
        } else {
            [&new, &old].into_iter().flatten().find_map(|b| encoding::wide_bom(b))
        };
        if let Some(id) = id {
            let (old_text, new_text) = (old.as_deref().map(|b| encoding::decode(id, b)), new.as_deref().map(|b| encoding::decode(id, b)));
            raw = convert_diff(git, path, old_text.as_deref().unwrap_or(""), new_text.as_deref().unwrap_or(""))?;
            converted = Some((id.to_string(), new_text.unwrap_or_default().into_bytes()));
        }
    }
    if let Some((id, _)) = &converted {
        (enc_id, guessed) = (id.clone(), false);
    } else if choice.is_empty() || choice == encoding::GUESS {
        let sample: Vec<u8> = raw.hunks.iter().flat_map(|h| &h.lines).flat_map(|l| l.bytes.iter().copied().chain([b'\n'])).collect();
        let (id, by_detector) = encoding::guess(&sample);
        (enc_id, guessed) = (id.to_string(), by_detector);
    } else {
        // codificação escolhida num arquivo que o git trata como binário: relê como texto
        if raw.binary {
            raw = load(git, path, source, true)?;
        }
        (enc_id, guessed) = (choice.to_string(), false);
    }
    let stageable = converted.is_none();
    let text = |bytes: &[u8]| if converted.is_some() { String::from_utf8_lossy(bytes).into_owned() } else { encoding::decode(&enc_id, bytes) };
    let mut lines = Vec::new();
    let mut hunks = Vec::new();
    let (mut added, mut removed) = (0, 0);
    let gap_source = if !full || raw.binary || raw.too_large {
        None
    } else if let Some((_, new)) = &converted {
        Some(new.clone())
    } else {
        new_side(git, path, source)?
    };
    let gap: Vec<&[u8]> = gap_source.as_deref().map(split_lines).unwrap_or_default();
    let (mut old_next, mut new_next) = (1u32, 1u32);
    let push_gap = |lines: &mut Vec<DiffLine>, old_next: &mut u32, new_next: &mut u32, until: u32| {
        while *new_next < until && (*new_next as usize) <= gap.len() {
            let bytes = gap[*new_next as usize - 1];
            lines.push(DiffLine {
                kind: LineKind::Context,
                old: Some(*old_next),
                new: Some(*new_next),
                text: text(bytes),
                no_newline: false,
                hunk: None,
            });
            *old_next += 1;
            *new_next += 1;
        }
    };
    for (h, hunk) in raw.hunks.iter().enumerate() {
        if full {
            push_gap(&mut lines, &mut old_next, &mut new_next, hunk.new_start);
        }
        let start = lines.len();
        let (mut old, mut new) = (hunk.old_start, hunk.new_start);
        for line in &hunk.lines {
            let (o, n) = match line.kind {
                LineKind::Context => (Some(old), Some(new)),
                LineKind::Del => (Some(old), None),
                LineKind::Add => (None, Some(new)),
            };
            if o.is_some() {
                old += 1;
            }
            if n.is_some() {
                new += 1;
            }
            match line.kind {
                LineKind::Add => added += 1,
                LineKind::Del => removed += 1,
                LineKind::Context => {}
            }
            lines.push(DiffLine {
                kind: line.kind,
                old: o,
                new: n,
                text: text(&line.bytes),
                no_newline: line.no_newline,
                hunk: Some(h as u32),
            });
        }
        hunks.push(Hunk {
            header: header(hunk.old_start, hunk.old_lines, hunk.new_start, hunk.new_lines),
            old_start: hunk.old_start,
            old_lines: hunk.old_lines,
            new_start: hunk.new_start,
            new_lines: hunk.new_lines,
            start,
            len: lines.len() - start,
        });
        // contagem 0: o início aponta a linha anterior
        let after = |start: u32, n: u32| if n == 0 { start + 1 } else { start + n };
        (old_next, new_next) = (after(hunk.old_start, hunk.old_lines), after(hunk.new_start, hunk.new_lines));
    }
    if full {
        push_gap(&mut lines, &mut old_next, &mut new_next, u32::MAX);
    }
    Ok(FileDiff {
        path: path.to_string(),
        old_path: raw.old_path,
        binary: raw.binary,
        too_large: raw.too_large,
        encoding: encoding::label(&enc_id).to_string(),
        encoding_id: enc_id,
        guessed,
        stageable,
        added,
        removed,
        hunks,
        lines,
    })
}

/// Prepara (ou tira, com `unstage`) só as linhas escolhidas: `(trecho, linha no trecho)` do diff
/// não preparado (ou preparado). Mexe só no index. Escolher todas as mudanças age no arquivo inteiro.
pub fn stage_lines(git: &RepoGit, path: &str, unstage: bool, selected: &[(usize, usize)]) -> Result<()> {
    let raw = load(git, path, if unstage { &DiffSource::Staged } else { &DiffSource::Unstaged }, false)?;
    let is_change = |h: usize, i: usize| {
        raw.hunks.get(h).and_then(|hunk| hunk.lines.get(i)).is_some_and(|l| l.kind != LineKind::Context)
    };
    let chosen: std::collections::HashSet<(usize, usize)> =
        selected.iter().copied().filter(|&(h, i)| is_change(h, i)).collect();
    if chosen.is_empty() {
        return Err(CoreError::NothingToDo { reason: "nenhuma linha alterada foi escolhida".into() });
    }
    let total = raw.hunks.iter().flat_map(|h| &h.lines).filter(|l| l.kind != LineKind::Context).count();
    if raw.binary || chosen.len() == total {
        return wip::stage(git, &[path.to_string()], !unstage);
    }
    let mut patch = Vec::new();
    // Tirar aplica ao contrário sobre o index (o lado novo do diff preparado).
    if raw.new_file && !unstage {
        patch.extend_from_slice(format!("--- /dev/null\n+++ b/{path}\n").as_bytes());
    } else {
        patch.extend_from_slice(format!("--- a/{path}\n+++ b/{path}\n").as_bytes());
    }
    let mut delta: i64 = 0;
    for (h, hunk) in raw.hunks.iter().enumerate() {
        if !hunk.lines.iter().enumerate().any(|(i, _)| chosen.contains(&(h, i))) {
            continue;
        }
        let mut body = Vec::new();
        let (mut old_count, mut new_count) = (0u32, 0u32);
        for (i, line) in hunk.lines.iter().enumerate() {
            let picked = chosen.contains(&(h, i));
            let mark = match (line.kind, picked, unstage) {
                (LineKind::Context, ..) => b' ',
                (_, true, _) => if line.kind == LineKind::Add { b'+' } else { b'-' },
                // não escolhida: some do lado em que não existe e vira contexto no outro
                (LineKind::Add, false, false) | (LineKind::Del, false, true) => continue,
                (LineKind::Add, false, true) | (LineKind::Del, false, false) => b' ',
            };
            if mark != b'+' {
                old_count += 1;
            }
            if mark != b'-' {
                new_count += 1;
            }
            body.push(mark);
            body.extend_from_slice(&line.bytes);
            body.push(b'\n');
            if line.no_newline {
                body.extend_from_slice(b"\\ No newline at end of file\n");
            }
        }
        let (old_start, new_start) = if unstage {
            (hunk.new_start as i64 - delta, hunk.new_start as i64)
        } else {
            (hunk.old_start as i64, hunk.old_start as i64 + delta)
        };
        delta += new_count as i64 - old_count as i64;
        let fix = |start: i64, count: u32| if count == 0 { (start - 1).max(0) } else { start.max(1) };
        patch.extend_from_slice(
            header(fix(old_start, old_count) as u32, old_count, fix(new_start, new_count) as u32, new_count).as_bytes(),
        );
        patch.push(b'\n');
        patch.extend_from_slice(&body);
    }
    let mut args = vec!["apply", "--cached", "--whitespace=nowarn"];
    if unstage {
        args.push("-R");
    }
    args.push("-");
    git.exec(&GitCmd::new(args).stdin(patch))?;
    Ok(())
}

fn header(old_start: u32, old_lines: u32, new_start: u32, new_lines: u32) -> String {
    format!("@@ -{old_start},{old_lines} +{new_start},{new_lines} @@")
}

fn diff_cmd(extra: &[&str]) -> GitCmd {
    let mut args = vec![
        "-c",
        "core.quotePath=false",
        "diff",
        "--no-color",
        "--no-ext-diff",
        "--no-textconv",
        "--src-prefix=a/",
        "--dst-prefix=b/",
        "-U3",
    ];
    args.extend_from_slice(extra);
    GitCmd::new(args)
}

fn load(git: &RepoGit, path: &str, source: &DiffSource, as_text: bool) -> Result<RawDiff> {
    let text_flag: &[&str] = if as_text { &["--text"] } else { &[] };
    let out = match source {
        DiffSource::Unstaged if !tracked(git, path)? => {
            git.exec(&diff_cmd(&[text_flag, &["--no-index", "--", "/dev/null", path]].concat()).also_ok(1))?
        }
        DiffSource::Unstaged => git.exec(&diff_cmd(&[text_flag, &["--", path]].concat()))?,
        DiffSource::Staged => git.exec(&diff_cmd(&[text_flag, &["--cached", "-M", "--", path]].concat()))?,
        DiffSource::Commit { sha, old_path } => {
            let parent = git
                .exec(&GitCmd::new(["rev-parse", "-q", "--verify", &format!("{sha}^1")]).also_ok(1))?
                .text();
            let base = if parent.is_empty() { EMPTY_TREE.to_string() } else { parent };
            let mut extra = vec!["-M", base.as_str(), sha.as_str(), "--", path];
            extra.splice(0..0, text_flag.iter().copied());
            if let Some(old) = old_path {
                extra.push(old);
            }
            git.exec(&diff_cmd(&extra))?
        }
    };
    if out.stdout.len() > DIFF_SIZE_LIMIT {
        return Ok(RawDiff { too_large: true, ..RawDiff::default() });
    }
    Ok(parse(&out.stdout, path))
}

/// Conteúdo dos dois lados (`None` = o lado não existe), para converter antes do diff.
fn sides(git: &RepoGit, path: &str, source: &DiffSource) -> Result<(Option<Vec<u8>>, Option<Vec<u8>>)> {
    let old_spec = match source {
        DiffSource::Unstaged => format!(":{path}"),
        DiffSource::Staged => format!("HEAD:{path}"),
        DiffSource::Commit { sha, old_path } => format!("{sha}^1:{}", old_path.as_deref().unwrap_or(path)),
    };
    let out = git.exec(&GitCmd::new(["cat-file", "blob", &old_spec]).also_ok(128))?;
    Ok(((out.code == 0).then_some(out.stdout), new_side(git, path, source)?))
}

/// Diff de dois textos já em UTF-8, via arquivos temporários (o git não lê da memória).
fn convert_diff(git: &RepoGit, path: &str, old: &str, new: &str) -> Result<RawDiff> {
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_nanos());
    let dir = std::env::temp_dir().join(format!("mnemo-enc-{}-{nanos}", std::process::id()));
    let io = |e: std::io::Error| CoreError::internal(e.to_string());
    std::fs::create_dir_all(&dir).map_err(io)?;
    let (a, b) = (dir.join("a"), dir.join("b"));
    let result = std::fs::write(&a, old)
        .and_then(|_| std::fs::write(&b, new))
        .map_err(io)
        .and_then(|_| {
            let (a, b) = (a.to_string_lossy(), b.to_string_lossy());
            git.exec(&diff_cmd(&["--no-index", "--", &a, &b]).also_ok(1))
        });
    let _ = std::fs::remove_dir_all(&dir);
    Ok(parse(&result?.stdout, path))
}

fn tracked(git: &RepoGit, path: &str) -> Result<bool> {
    Ok(!git.exec(&GitCmd::new(["ls-files", "-z", "--", path]))?.stdout.is_empty())
}

/// Conteúdo do lado novo, para preencher o que fica entre os trechos.
fn new_side(git: &RepoGit, path: &str, source: &DiffSource) -> Result<Option<Vec<u8>>> {
    let spec = match source {
        DiffSource::Unstaged => return Ok(std::fs::read(git.workdir().join(path)).ok()),
        DiffSource::Staged => format!(":{path}"),
        DiffSource::Commit { sha, .. } => format!("{sha}:{path}"),
    };
    let out = git.exec(&GitCmd::new(["cat-file", "blob", &spec]).also_ok(128))?;
    Ok((out.code == 0).then_some(out.stdout))
}

fn split_lines(bytes: &[u8]) -> Vec<&[u8]> {
    let mut lines: Vec<&[u8]> = bytes.split(|b| *b == b'\n').collect();
    if lines.last().is_some_and(|l| l.is_empty()) {
        lines.pop();
    }
    lines
}

/// Saída de `git diff` de um arquivo. Se vierem várias seções (renomeação não detectada), fica a do `path`.
fn parse(bytes: &[u8], path: &str) -> RawDiff {
    let all: Vec<&[u8]> = split_lines(bytes);
    let starts: Vec<usize> = all.iter().enumerate().filter(|(_, l)| l.starts_with(b"diff ")).map(|(i, _)| i).collect();
    let section = |k: usize| &all[starts[k]..starts.get(k + 1).copied().unwrap_or(all.len())];
    let chosen: &[&[u8]] = match starts.len() {
        0 => &[],
        1 => section(0),
        n => {
            let tail = format!(" b/{path}");
            let rename = format!("rename to {path}");
            (0..n)
                .map(section)
                .find(|s| s[0].ends_with(tail.as_bytes()) || s.contains(&rename.as_bytes()))
                .unwrap_or_else(|| section(0))
        }
    };
    let mut raw = RawDiff::default();
    for line in chosen {
        if let Some(hunk) = raw.hunks.last_mut() {
            match line.first() {
                Some(b' ') | Some(b'+') | Some(b'-') => {
                    let kind = match line[0] {
                        b'+' => LineKind::Add,
                        b'-' => LineKind::Del,
                        _ => LineKind::Context,
                    };
                    hunk.lines.push(RawLine { kind, bytes: line[1..].to_vec(), no_newline: false });
                    continue;
                }
                Some(b'\\') => {
                    if let Some(last) = hunk.lines.last_mut() {
                        last.no_newline = true;
                    }
                    continue;
                }
                // linha vazia de contexto (alguns geradores tiram o espaço)
                None => {
                    hunk.lines.push(RawLine { kind: LineKind::Context, bytes: Vec::new(), no_newline: false });
                    continue;
                }
                _ => {}
            }
        }
        if line.starts_with(b"@@ ") {
            if let Some(h) = parse_hunk_header(line) {
                raw.hunks.push(h);
            }
        } else if let Some(old) = line.strip_prefix(b"rename from ") {
            raw.old_path = Some(String::from_utf8_lossy(old).into_owned());
        } else if line.starts_with(b"new file mode ") || line == b"--- /dev/null" {
            raw.new_file = true;
        } else if line.starts_with(b"Binary files ") || line == b"GIT binary patch" {
            raw.binary = true;
        }
    }
    raw
}

fn parse_hunk_header(line: &[u8]) -> Option<RawHunk> {
    let text = std::str::from_utf8(line).ok()?;
    let mut parts = text.split(' ').skip(1);
    let range = |s: &str| -> Option<(u32, u32)> {
        let s = &s[1..];
        Some(match s.split_once(',') {
            Some((a, b)) => (a.parse().ok()?, b.parse().ok()?),
            None => (s.parse().ok()?, 1),
        })
    };
    let (old_start, old_lines) = range(parts.next()?)?;
    let (new_start, new_lines) = range(parts.next()?)?;
    Some(RawHunk { old_start, old_lines, new_start, new_lines, lines: Vec::new() })
}
