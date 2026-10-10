use crate::application::git::failure;
use crate::application::ports::{GitCmd, GitOutput, GitPort};
use crate::domain::error::{CoreError, Result};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// Git do sistema como processo filho. Nunca espera um terminal.
pub struct ProcessGit {
    executable: PathBuf,
}

impl ProcessGit {
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self { executable: executable.into() }
    }

    pub fn from_path() -> Self {
        Self::new("git")
    }
}

impl GitPort for ProcessGit {
    fn run(&self, cwd: &Path, cmd: &GitCmd) -> Result<GitOutput> {
        let mut command = Command::new(&self.executable);
        command
            .current_dir(cwd)
            .args(&cmd.args)
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_OPTIONAL_LOCKS", "0")
            .env("GIT_EDITOR", "true")
            .env("GIT_MERGE_AUTOEDIT", "no")
            .env("LC_ALL", "C")
            .env("SSH_ASKPASS_REQUIRE", "never")
            .env("GCM_INTERACTIVE", "never")
            .stdin(if cmd.stdin.is_some() { Stdio::piped() } else { Stdio::null() })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        for (k, v) in &cmd.env {
            command.env(k, v);
        }
        hide_window(&mut command);

        let mut child = command.spawn().map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => CoreError::GitMissing,
            _ => CoreError::from(e),
        })?;

        // stdin numa thread própria: escrever e ler ao mesmo tempo evita deadlock com saídas grandes.
        let writer = child.stdin.take().zip(cmd.stdin.clone()).map(|(mut stdin, data)| {
            std::thread::spawn(move || {
                let _ = stdin.write_all(&data);
            })
        });
        let output = wait(child, cmd.timeout)?;
        if let Some(w) = writer {
            let _ = w.join();
        }

        let out = GitOutput {
            code: output.status.code().unwrap_or(-1),
            stdout: output.stdout,
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        };
        if out.code == 0 || cmd.ok_codes.contains(&out.code) {
            Ok(out)
        } else {
            Err(failure(cmd, &out))
        }
    }
}

#[cfg(windows)]
fn hide_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_window(_command: &mut Command) {}

/// Espera o processo. Sem prazo, `wait_with_output` (sem polling); com prazo, mata ao estourar.
fn wait(mut child: std::process::Child, timeout: Option<std::time::Duration>) -> Result<std::process::Output> {
    let Some(limit) = timeout else { return Ok(child.wait_with_output()?) };
    let drain = |r: Option<Box<dyn std::io::Read + Send>>| {
        std::thread::spawn(move || {
            let mut buf = Vec::new();
            if let Some(mut r) = r {
                let _ = r.read_to_end(&mut buf);
            }
            buf
        })
    };
    let stdout = drain(child.stdout.take().map(|s| Box::new(s) as _));
    let stderr = drain(child.stderr.take().map(|s| Box::new(s) as _));
    let start = std::time::Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait()? {
            break status;
        }
        if start.elapsed() > limit {
            let _ = child.kill();
            let _ = child.wait();
            return Err(CoreError::GitFailed {
                args: "(rede)".into(),
                status: -1,
                stderr: format!("o git não respondeu em {}s (autenticação pendente?)", limit.as_secs()),
            });
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    };
    let join = |h: std::thread::JoinHandle<Vec<u8>>| h.join().unwrap_or_default();
    Ok(std::process::Output { status, stdout: join(stdout), stderr: join(stderr) })
}
