mod support;

use support::{run_git, TestRepo};
use tempfile::TempDir;

#[test]
fn toolbar_tracks_ahead_behind_and_last_fetch_from_bare_remote() {
    let repo = TestRepo::new();
    let remote = repo.with_remote();
    let path = repo.path().to_str().unwrap();
    let initial = repo.core.open_repository(path).unwrap();
    assert_eq!((initial.toolbar.ahead, initial.toolbar.behind), (Some(0), Some(0)));
    assert_eq!(initial.toolbar.last_fetch_epoch, None);

    repo.write("local.txt", "local\n");
    repo.commit_all("local");
    let other = TempDir::new().unwrap();
    run_git(other.path(), &["clone", "-q", &remote.path().to_string_lossy(), "."]);
    run_git(other.path(), &["config", "user.name", "Test"]);
    run_git(other.path(), &["config", "user.email", "test@example.com"]);
    std::fs::write(other.path().join("remote.txt"), "remote\n").unwrap();
    run_git(other.path(), &["add", "."]);
    run_git(other.path(), &["commit", "-q", "-m", "remote"]);
    run_git(other.path(), &["push", "-q"]);

    // O contador usa a ref remota local e muda somente após buscar.
    let before_fetch = repo.core.open_repository(path).unwrap();
    assert_eq!((before_fetch.toolbar.ahead, before_fetch.toolbar.behind), (Some(1), Some(0)));
    repo.git(&["fetch", "-q", "origin"]);
    let after_fetch = repo.core.open_repository(path).unwrap();
    assert_eq!((after_fetch.toolbar.ahead, after_fetch.toolbar.behind), (Some(1), Some(1)));
    assert!(after_fetch.toolbar.last_fetch_epoch.unwrap() > 0);
}

#[test]
fn pull_mode_is_saved_in_repo_config() {
    let repo = TestRepo::new();
    let path = repo.path().to_str().unwrap();
    assert_eq!(repo.core.open_repository(path).unwrap().toolbar.pull_mode, "merge");
    repo.core.set_pull_mode(path, "rebase").unwrap();
    assert_eq!(repo.git(&["config", "--local", "--get", "mnemo.pullMode"]), "rebase");
    assert_eq!(repo.core.open_repository(path).unwrap().toolbar.pull_mode, "rebase");
    assert!(repo.core.set_pull_mode(path, "invalid").is_err());
}
