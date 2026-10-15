mod support;

use mnemo_core::application::ports::{GitCmd, GitOutput, GitPort, NoEvents};
use mnemo_core::domain::operation::OperationKind;
use mnemo_core::infrastructure::process_git::ProcessGit;
use mnemo_core::{Mnemo, Result};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use support::{run_git, TestRepo};
use tempfile::TempDir;

#[test]
fn fetch_updates_and_prunes_all_remotes() {
    let repo = TestRepo::new();
    let origin = repo.with_remote();
    let upstream = TempDir::new().expect("diretório temporário");
    run_git(upstream.path(), &["clone", "-q", "--bare", &origin.path().to_string_lossy(), "."]);
    repo.git(&["remote", "add", "upstream", &upstream.path().to_string_lossy()]);
    let sha = repo.head();
    for remote in [&origin, &upstream] {
        run_git(remote.path(), &["update-ref", "refs/heads/stale", &sha]);
    }
    repo.git(&["fetch", "--all"]);
    for remote in [&origin, &upstream] {
        run_git(remote.path(), &["update-ref", "-d", "refs/heads/stale"]);
        run_git(remote.path(), &["update-ref", "refs/heads/new", &sha]);
    }

    repo.exec(OperationKind::Fetch { remote: None, prune: true });
    let refs = repo
        .core
        .list_remote_branches(repo.path().to_str().expect("caminho UTF-8"))
        .expect("resultado esperado no cenário");
    for remote in ["origin", "upstream"] {
        assert!(refs.iter().any(|r| r.remote == remote && r.name == "new"));
        assert!(!refs.iter().any(|r| r.remote == remote && r.name == "stale"));
    }
    assert!(repo
        .core
        .open_repository(repo.path().to_str().expect("caminho UTF-8"))
        .expect("resultado esperado no cenário")
        .toolbar
        .last_fetch_epoch
        .is_some());
}

#[test]
fn toolbar_lists_remotes_for_publishing_without_upstream() {
    let repo = TestRepo::new();
    let path = repo.path().to_str().expect("caminho UTF-8");
    repo.git(&["remote", "add", "company", "/unused/company"]);
    repo.git(&["remote", "add", "personal", "/unused/personal"]);
    let info = repo.core.open_repository(path).expect("resultado esperado no cenário");
    assert_eq!(info.toolbar.remotes, ["company", "personal"]);
    assert_eq!((info.toolbar.ahead, info.toolbar.behind), (None, None));
    assert!(matches!(info.head, mnemo_core::api::HeadInfo::Branch { upstream: None, .. }));
}

#[test]
fn explicit_fetch_only_updates_the_chosen_remote() {
    let repo = TestRepo::new();
    let origin = repo.with_remote();
    let upstream = TempDir::new().expect("diretório temporário");
    run_git(upstream.path(), &["clone", "-q", "--bare", &origin.path().to_string_lossy(), "."]);
    repo.git(&["remote", "add", "upstream", &upstream.path().to_string_lossy()]);
    let sha = repo.head();
    for remote in [&origin, &upstream] {
        run_git(remote.path(), &["update-ref", "refs/heads/new", &sha]);
    }
    repo.exec(OperationKind::Fetch { remote: Some("upstream".into()), prune: true });
    let refs = repo
        .core
        .list_remote_branches(repo.path().to_str().expect("caminho UTF-8"))
        .expect("resultado esperado no cenário");
    assert!(refs.iter().any(|r| r.remote == "upstream" && r.name == "new"));
    assert!(!refs.iter().any(|r| r.remote == "origin" && r.name == "new"));
}

#[test]
fn fetch_is_available_while_merge_waits_for_conflict_resolution() {
    let repo = TestRepo::new();
    let _remote = repo.with_remote();
    repo.git(&["checkout", "-q", "-b", "other"]);
    repo.write("a.txt", "other\n");
    repo.commit_all("other");
    repo.git(&["checkout", "-q", "main"]);
    repo.write("a.txt", "main\n");
    repo.commit_all("main");
    let result = repo.exec(OperationKind::Merge { target: "other".into() });
    assert!(matches!(result, mnemo_core::application::session::ExecuteResult::Conflict { .. }));
    let status = repo.status();
    let head = repo.head();

    repo.exec(OperationKind::Fetch { remote: None, prune: true });
    assert_eq!(repo.status(), status);
    assert_eq!(repo.head(), head);
    let info =
        repo.core.open_repository(repo.path().to_str().expect("caminho UTF-8")).expect("resultado esperado no cenário");
    assert_eq!(info.toolbar.progress.expect("resultado esperado no cenário").kind, "Merge");
    repo.session().abort_in_progress().expect("resultado esperado no cenário");
    assert_eq!(repo.head(), head);
    assert!(!repo.session().undo_state().undo.enabled);
}

#[test]
fn toolbar_tracks_ahead_behind_and_last_fetch_from_bare_remote() {
    let repo = TestRepo::new();
    let remote = repo.with_remote();
    let path = repo.path().to_str().expect("caminho UTF-8");
    let initial = repo.core.open_repository(path).expect("resultado esperado no cenário");
    assert_eq!((initial.toolbar.ahead, initial.toolbar.behind), (Some(0), Some(0)));
    assert_eq!(initial.toolbar.last_fetch_epoch, None);

    repo.write("local.txt", "local\n");
    repo.commit_all("local");
    let other = TempDir::new().expect("diretório temporário");
    run_git(other.path(), &["clone", "-q", &remote.path().to_string_lossy(), "."]);
    run_git(other.path(), &["config", "user.name", "Test"]);
    run_git(other.path(), &["config", "user.email", "test@example.com"]);
    std::fs::write(other.path().join("remote.txt"), "remote\n").expect("resultado esperado no cenário");
    run_git(other.path(), &["add", "."]);
    run_git(other.path(), &["commit", "-q", "-m", "remote"]);
    run_git(other.path(), &["push", "-q"]);

    // O contador usa a ref remota local e muda somente após buscar.
    let before_fetch = repo.core.open_repository(path).expect("resultado esperado no cenário");
    assert_eq!((before_fetch.toolbar.ahead, before_fetch.toolbar.behind), (Some(1), Some(0)));
    repo.git(&["fetch", "-q", "origin"]);
    let after_fetch = repo.core.open_repository(path).expect("resultado esperado no cenário");
    assert_eq!((after_fetch.toolbar.ahead, after_fetch.toolbar.behind), (Some(1), Some(1)));
    assert!(after_fetch.toolbar.last_fetch_epoch.expect("resultado esperado no cenário") > 0);
}

#[test]
fn pull_mode_is_saved_in_repo_config() {
    let repo = TestRepo::new();
    let path = repo.path().to_str().expect("caminho UTF-8");
    assert_eq!(repo.core.open_repository(path).expect("resultado esperado no cenário").toolbar.pull_mode, "merge");
    repo.core.set_pull_mode(path, "rebase").expect("resultado esperado no cenário");
    assert_eq!(repo.git(&["config", "--local", "--get", "mnemo.pullMode"]), "rebase");
    assert_eq!(repo.core.open_repository(path).expect("resultado esperado no cenário").toolbar.pull_mode, "rebase");
    assert!(repo.core.set_pull_mode(path, "invalid").is_err());
}

#[test]
fn publishing_to_chosen_remote_defines_upstream_without_touching_other_remote() {
    let repo = TestRepo::new();
    let company = repo.with_remote();
    repo.git(&["remote", "rename", "origin", "company"]);
    let personal = TempDir::new().expect("diretório temporário");
    run_git(personal.path(), &["init", "-q", "--bare", "-b", "main"]);
    repo.git(&["remote", "add", "personal", &personal.path().to_string_lossy()]);
    repo.git(&["checkout", "-q", "-b", "feature"]);
    repo.core
        .invoke(
            "execute_operation",
            serde_json::json!({
                "path": repo.path(),
                "kind": { "type": "push", "remote": "personal", "branch": "feature", "setUpstream": true }
            }),
        )
        .expect("resultado esperado no cenário");
    assert_eq!(repo.git(&["rev-parse", "--abbrev-ref", "@{upstream}"]), "personal/feature");
    assert_eq!(run_git(personal.path(), &["rev-parse", "refs/heads/feature"]), repo.head());
    assert!(!run_git(company.path(), &["for-each-ref", "--format=%(refname)", "refs/heads"]).contains("feature"));
}

/// Usa o processo Git real com um config global isolado, sem alterar o ambiente dos outros testes.
struct IsolatedGlobalGit(PathBuf);

impl GitPort for IsolatedGlobalGit {
    fn run(&self, cwd: &Path, cmd: &GitCmd) -> Result<GitOutput> {
        let mut cmd = cmd.clone();
        cmd.env.push(("GIT_CONFIG_GLOBAL".into(), self.0.to_string_lossy().into_owned()));
        cmd.env.push(("GIT_CONFIG_NOSYSTEM".into(), "1".into()));
        ProcessGit::from_path().run(cwd, &cmd)
    }
}

#[test]
fn pull_mode_falls_back_to_global_and_preserves_git_pull_settings() {
    let repo = TestRepo::new();
    let global = repo.data.path().join("global.gitconfig");
    std::fs::write(&global, "[mnemo]\n\tpullMode = rebase\n[pull]\n\trebase = false\n")
        .expect("resultado esperado no cenário");
    let core = Mnemo::with_git(IsolatedGlobalGit(global.clone()), repo.data.path(), Arc::new(NoEvents));
    let path = repo.path().to_str().expect("caminho UTF-8");
    assert_eq!(core.open_repository(path).expect("resultado esperado no cenário").toolbar.pull_mode, "rebase");
    core.set_pull_mode(path, "ffOnly").expect("resultado esperado no cenário");
    assert_eq!(core.open_repository(path).expect("resultado esperado no cenário").toolbar.pull_mode, "ffOnly");
    assert_eq!(repo.git(&["config", "--local", "--get", "mnemo.pullMode"]), "ffOnly");
    assert_eq!(
        run_git(repo.path(), &["config", "--file", &global.to_string_lossy(), "--get", "mnemo.pullMode"]),
        "rebase"
    );
    assert!(!repo.git(&["config", "--local", "--list"]).contains("pull.rebase="));
    repo.git(&["checkout", "-q", "--detach"]);
    let detached = core.open_repository(path).expect("resultado esperado no cenário");
    assert!(matches!(detached.head, mnemo_core::api::HeadInfo::Detached { .. }));
    assert_eq!(detached.toolbar.pull_mode, "ffOnly");
    assert_eq!((detached.toolbar.ahead, detached.toolbar.behind), (None, None));
}
