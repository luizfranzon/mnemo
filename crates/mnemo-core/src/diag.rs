//! Log de diagnóstico: um arquivo `dd-mm-aaaa.txt` por dia em `<dados>/logs`. Único escritor do app.
//! Descartável e à prova de falha: qualquer erro de E/S aqui é engolido, nunca chega a uma Operação.

use chrono::{Duration, Local, NaiveDate};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

const RETENTION_DAYS: i64 = 7;
const DATE_FORMAT: &str = "%d-%m-%Y";

static DIR: OnceLock<PathBuf> = OnceLock::new();
static WRITE: Mutex<()> = Mutex::new(());

/// Liga o log em `<data_dir>/logs`, apaga o que passou da retenção e captura pânicos com stacktrace.
/// Sem chamada a `init`, `line`/`error` não fazem nada (testes do core ficam mudos).
pub fn init(data_dir: impl AsRef<Path>) {
    let dir = data_dir.as_ref().join("logs");
    if DIR.set(dir.clone()).is_err() {
        return;
    }
    cleanup(&dir, Local::now().date_naive());
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        error("panic", &info.to_string());
        previous(info);
    }));
}

/// Linha normal: `[HH:MM:SS] mensagem`.
pub fn line(message: &str) {
    if let Some(dir) = DIR.get() {
        let _ = append(dir, Local::now().naive_local(), &mask_credentials(message));
    }
}

/// Erro inesperado: mensagem com contexto e stacktrace (linhas seguintes indentadas).
pub fn error(context: &str, message: &str) {
    let trace = std::backtrace::Backtrace::force_capture();
    line(&format!("ERRO [{context}] {message}\n{trace}"));
}

/// Erro vindo do main/UI, que já trazem o próprio stacktrace dentro de `message`.
pub fn error_from_js(context: &str, message: &str) {
    line(&format!("ERRO [{context}] {message}"));
}

fn append(dir: &Path, now: chrono::NaiveDateTime, message: &str) -> std::io::Result<()> {
    let _guard = WRITE.lock().unwrap_or_else(|e| e.into_inner());
    fs::create_dir_all(dir)?;
    let mut file = OpenOptions::new().create(true).append(true).open(dir.join(file_name(now.date())))?;
    file.write_all(format_entry(now, message).as_bytes())
}

fn file_name(date: NaiveDate) -> String {
    format!("{}.txt", date.format(DATE_FORMAT))
}

/// Prefixo `[HH:MM:SS]` só na primeira linha; as demais vão indentadas.
fn format_entry(now: chrono::NaiveDateTime, message: &str) -> String {
    let mut out = String::new();
    for (i, l) in message.trim_end().lines().enumerate() {
        if i == 0 {
            out.push_str(&format!("[{}] {l}\n", now.format("%H:%M:%S")));
        } else {
            out.push_str(&format!("    {l}\n"));
        }
    }
    out
}

/// Apaga os `dd-mm-aaaa.txt` de mais de 7 dias (data lida do nome). Outros arquivos ficam.
fn cleanup(dir: &Path, today: NaiveDate) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    let limit = today - Duration::days(RETENTION_DAYS);
    for entry in entries.flatten() {
        let name = entry.file_name();
        let date = name
            .to_str()
            .and_then(|n| n.strip_suffix(".txt"))
            .and_then(|stem| NaiveDate::parse_from_str(stem, DATE_FORMAT).ok());
        if date.is_some_and(|d| d < limit) {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Comando git para o log: credenciais de URL mascaradas e mensagem de `-m` omitida.
pub fn git_command(args: &[String]) -> String {
    let hides_message = args.first().is_some_and(|a| a != "branch");
    let mut out = vec!["git".to_string()];
    let mut after_m = false;
    for a in args {
        out.push(if after_m && hides_message { "<msg>".into() } else { mask_credentials(a) });
        after_m = a == "-m";
    }
    out.join(" ")
}

/// `https://user:token@host/x` → `https://***@host/x`.
pub fn mask_credentials(text: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(i) = rest.find("://") {
        let (head, tail) = rest.split_at(i + 3);
        out.push_str(head);
        let authority_end = tail.find(['/', ' ', '\n', '"', '\'']).unwrap_or(tail.len());
        match tail[..authority_end].rfind('@') {
            Some(at) => {
                out.push_str("***");
                rest = &tail[at..];
            }
            None => rest = tail,
        }
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(day: u32, month: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, month, day).expect("data válida")
    }

    #[test]
    fn masks_url_credentials() {
        assert_eq!(mask_credentials("https://user:tok@github.com/a/b.git"), "https://***@github.com/a/b.git");
        assert_eq!(mask_credentials("https://github.com/a/b.git"), "https://github.com/a/b.git");
        assert_eq!(
            mask_credentials("fatal: unable to access 'https://u:p@h.com/r/': 403"),
            "fatal: unable to access 'https://***@h.com/r/': 403"
        );
        assert_eq!(mask_credentials("a https://x:y@h/1 b https://z@h/2"), "a https://***@h/1 b https://***@h/2");
    }

    #[test]
    fn git_command_masks_credentials_and_commit_message() {
        let args = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(git_command(&args(&["push", "https://u:t@h/r"])), "git push https://***@h/r");
        assert_eq!(git_command(&args(&["commit", "-m", "segredo"])), "git commit -m <msg>");
        assert_eq!(git_command(&args(&["branch", "-m", "a", "b"])), "git branch -m a b");
    }

    #[test]
    fn cleanup_removes_only_files_older_than_seven_days() {
        let tmp = tempfile::tempdir().expect("tmp");
        for name in ["01-10-2026.txt", "03-10-2026.txt", "04-10-2026.txt", "10-10-2026.txt", "notas.txt"] {
            fs::write(tmp.path().join(name), "x").expect("write");
        }
        cleanup(tmp.path(), d(11, 10));
        let mut left: Vec<_> = fs::read_dir(tmp.path()).expect("dir").flatten().map(|e| e.file_name()).collect();
        left.sort();
        // 04-10 está exatamente a 7 dias: fica. 01 e 03 saem.
        assert_eq!(left, ["04-10-2026.txt", "10-10-2026.txt", "notas.txt"]);
    }

    #[test]
    fn multiline_entry_prefixes_only_first_line() {
        let now = d(11, 10).and_hms_opt(9, 5, 7).expect("hora");
        assert_eq!(format_entry(now, "erro\nat a\nat b"), "[09:05:07] erro\n    at a\n    at b\n");
    }

    #[test]
    fn unwritable_dir_never_panics() {
        let tmp = tempfile::tempdir().expect("tmp");
        let file = tmp.path().join("arquivo");
        fs::write(&file, "x").expect("write");
        // `logs` dentro de um arquivo: create_dir_all falha; o chamador só vê um Err engolido.
        assert!(append(&file.join("logs"), Local::now().naive_local(), "x").is_err());
    }
}
