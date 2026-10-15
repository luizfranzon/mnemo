mod support;

use mnemo_core::domain::operation::OperationKind;
use support::{run_git, TestRepo};

#[test]
fn prefs_de_repositorio_comecam_desligadas_e_gravam_no_git_config_local() {
    let repo = TestRepo::new();
    let path = repo.path().to_str().expect("caminho UTF-8");
    let prefs = repo.core.repo_prefs(path).expect("lê prefs");
    assert!(!prefs.push_after_commit && !prefs.skip_hooks && !prefs.sign_commits);

    repo.core.set_repo_pref(path, "pushAfterCommit", true).expect("grava");
    repo.core.set_repo_pref(path, "skipHooks", true).expect("grava");
    let prefs = repo.core.set_repo_pref(path, "signCommits", true).expect("grava");
    assert!(prefs.push_after_commit && prefs.skip_hooks && prefs.sign_commits);
    assert_eq!(repo.git(&["config", "--local", "--get", "mnemo.pushAfterCommit"]), "true");
    assert_eq!(repo.git(&["config", "--local", "--get", "mnemo.skipHooks"]), "true");
    assert_eq!(repo.git(&["config", "--local", "--get", "commit.gpgsign"]), "true");

    let prefs = repo.core.set_repo_pref(path, "skipHooks", false).expect("grava");
    assert!(!prefs.skip_hooks);
}

#[test]
fn set_repo_pref_recusa_chave_desconhecida_sem_tocar_no_config() {
    let repo = TestRepo::new();
    let path = repo.path().to_str().expect("caminho UTF-8");
    assert!(repo.core.set_repo_pref(path, "core.bare", true).is_err());
    assert_eq!(repo.git(&["config", "--local", "--get", "core.bare"]), "false");
}

#[test]
fn valor_invalido_no_config_vale_como_desligado() {
    let repo = TestRepo::new();
    let path = repo.path().to_str().expect("caminho UTF-8");
    repo.git(&["config", "--local", "mnemo.skipHooks", "talvez"]);
    assert!(!repo.core.repo_prefs(path).expect("lê prefs").skip_hooks);
}

#[test]
fn commit_sem_assinar_vence_o_commit_gpgsign_do_config() {
    let repo = TestRepo::new();
    repo.git(&["config", "--local", "commit.gpgsign", "true"]);
    repo.git(&["config", "--local", "gpg.program", "false"]); // assinar falharia
    repo.write("a.txt", "a\n");
    repo.git(&["add", "a.txt"]);
    repo.exec(OperationKind::Commit { message: "sem assinatura".into(), amend: false, allow_empty: false, sign: false, no_verify: false });
    assert_eq!(repo.git(&["log", "-1", "--format=%s"]), "sem assinatura");
}

#[test]
fn fetch_sem_prune_mantem_branch_remota_apagada_e_com_prune_remove() {
    let repo = TestRepo::new();
    let origin = repo.with_remote();
    let sha = repo.head();
    run_git(origin.path(), &["update-ref", "refs/heads/stale", &sha]);
    repo.git(&["fetch", "origin"]);
    run_git(origin.path(), &["update-ref", "-d", "refs/heads/stale"]);
    let path = repo.path().to_str().expect("caminho UTF-8");
    let has_stale = || repo.core.list_remote_branches(path).expect("lista").iter().any(|r| r.name == "stale");

    repo.exec(OperationKind::Fetch { remote: None, prune: false });
    assert!(has_stale());
    repo.exec(OperationKind::Fetch { remote: None, prune: true });
    assert!(!has_stale());
}
