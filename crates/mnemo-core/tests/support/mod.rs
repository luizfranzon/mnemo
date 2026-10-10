#![allow(dead_code)]
//! Harness: repositórios git reais em diretório temporário (sem mock de git).

use mnemo_core::application::ports::NoEvents;
use mnemo_core::application::session::{ExecuteResult, RepoSession};
use mnemo_core::domain::operation::OperationKind;
use mnemo_core::Mnemo;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use tempfile::TempDir;

pub struct TestRepo {
    pub dir: TempDir,
    pub data: TempDir,
    pub core: Mnemo,
}

pub fn run_git(cwd: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .current_dir(cwd)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_EDITOR", "true")
        .output()
        .expect("git precisa estar instalado");
    assert!(out.status.success(), "git {args:?} falhou: {}", String::from_utf8_lossy(&out.stderr));
    String::from_utf8_lossy(&out.stdout).trim_end().to_string()
}

pub fn init_repo(dir: &Path) {
    run_git(dir, &["init", "-q", "-b", "main"]);
    for (k, v) in [
        ("user.name", "Teste"),
        ("user.email", "teste@example.com"),
        ("core.autocrlf", "false"),
        ("commit.gpgsign", "false"),
    ] {
        run_git(dir, &["config", k, v]);
    }
}

impl TestRepo {
    /// Repositório com um commit inicial (`a.txt`).
    pub fn new() -> Self {
        let repo = Self::empty();
        repo.write("a.txt", "um\ndois\ntres\n");
        repo.commit_all("inicial");
        repo
    }

    pub fn empty() -> Self {
        let dir = TempDir::new().expect("tempdir");
        let data = TempDir::new().expect("tempdir");
        init_repo(dir.path());
        let core = Mnemo::new(data.path(), Arc::new(NoEvents));
        Self { dir, data, core }
    }

    pub fn path(&self) -> &Path {
        self.dir.path()
    }

    pub fn git(&self, args: &[&str]) -> String {
        run_git(self.path(), args)
    }

    pub fn write(&self, rel: &str, content: &str) {
        let p = self.path().join(rel);
        std::fs::create_dir_all(p.parent().expect("pai")).expect("mkdir");
        std::fs::write(p, content).expect("write");
    }

    pub fn read(&self, rel: &str) -> String {
        std::fs::read_to_string(self.path().join(rel)).expect("read")
    }

    pub fn exists(&self, rel: &str) -> bool {
        self.path().join(rel).exists()
    }

    pub fn commit_all(&self, msg: &str) -> String {
        self.git(&["add", "-A"]);
        self.git(&["commit", "-q", "-m", msg]);
        self.head()
    }

    pub fn head(&self) -> String {
        self.git(&["rev-parse", "HEAD"])
    }

    pub fn branch(&self) -> String {
        self.git(&["branch", "--show-current"])
    }

    pub fn rev(&self, r: &str) -> String {
        self.git(&["rev-parse", r])
    }

    pub fn status(&self) -> String {
        self.git(&["status", "--porcelain"])
    }

    pub fn session(&self) -> Arc<RepoSession> {
        self.core.session_for(self.path()).expect("sessão")
    }

    /// Uma instância nova do core no mesmo repositório e nos mesmos dados do app.
    pub fn reopen(&self) -> (Mnemo, Arc<RepoSession>) {
        let core = Mnemo::new(self.data.path(), Arc::new(NoEvents));
        let session = core.session_for(self.path()).expect("sessão");
        (core, session)
    }

    pub fn exec(&self, kind: OperationKind) -> ExecuteResult {
        self.session().execute(kind).expect("operação")
    }

    pub fn checkout(&self, target: &str) {
        self.exec(OperationKind::Checkout { target: target.into() });
    }

    /// Cria um repositório bare local e o liga como `origin`.
    pub fn with_remote(&self) -> TempDir {
        let remote = TempDir::new().expect("tempdir");
        run_git(remote.path(), &["init", "-q", "--bare", "-b", "main"]);
        self.git(&["remote", "add", "origin", &remote.path().to_string_lossy()]);
        self.git(&["push", "-q", "-u", "origin", "main"]);
        remote
    }
}

pub fn pathbuf(p: &Path) -> PathBuf {
    p.to_path_buf()
}
