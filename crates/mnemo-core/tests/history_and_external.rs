mod support;
use mnemo_core::domain::history::HISTORY_LIMIT;
use mnemo_core::domain::operation::OperationKind;
use mnemo_core::CoreError;
use support::{run_git, TestRepo};

// ---- #5 Histórico persistente ------------------------------------------------------------

#[test]
fn instancia_nova_do_core_mantem_o_historico_e_o_desfazer_funciona() {
    let repo = TestRepo::new();
    repo.git(&["branch", "x"]);
    repo.checkout("x");

    let (_core, session) = repo.reopen();
    assert_eq!(session.undo_state().undo.label.as_deref(), Some("Desfazer checkout de x"));
    session.undo().expect("desfaz depois de reabrir");
    assert_eq!(repo.branch(), "main");
}

#[test]
fn a_operacao_51_expulsa_a_mais_antiga() {
    let repo = TestRepo::new();
    for i in 0..HISTORY_LIMIT + 1 {
        repo.exec(OperationKind::TagCreate { name: format!("t{i}"), target: None, message: None });
    }
    let s = repo.session();
    let mut undone = 0;
    while s.undo().is_ok() {
        undone += 1;
    }
    assert_eq!(undone, HISTORY_LIMIT);
    // a mais antiga (t0) ficou de fora: a tag continua existindo
    assert!(repo.git(&["tag", "--list", "t0"]).contains("t0"));
    assert!(repo.git(&["tag", "--list", "t1"]).is_empty());
}

#[test]
fn worktree_e_submodulo_tem_historicos_independentes() {
    let repo = TestRepo::new();
    repo.git(&["branch", "x"]);
    repo.checkout("x");

    // worktree
    let wt_parent = tempfile::tempdir().expect("tempdir");
    let wt = wt_parent.path().join("wt");
    repo.git(&["worktree", "add", "-q", "-b", "wtb", &wt.to_string_lossy()]);
    let wt_session = repo.core.session_for(&wt).expect("sessão do worktree");
    assert!(!wt_session.undo_state().undo.enabled, "worktree começa sem histórico");
    assert!(repo.session().undo_state().undo.enabled);

    // submódulo
    let sub_src = tempfile::tempdir().expect("tempdir");
    support::init_repo(sub_src.path());
    std::fs::write(sub_src.path().join("s.txt"), "s").expect("write");
    run_git(sub_src.path(), &["add", "-A"]);
    run_git(sub_src.path(), &["commit", "-q", "-m", "s"]);
    run_git(sub_src.path(), &["branch", "sb"]);
    repo.git(&["-c", "protocol.file.allow=always", "submodule", "add", "-q", &sub_src.path().to_string_lossy(), "sub"]);
    repo.git(&["commit", "-q", "-m", "submódulo"]);
    let sub_dir = repo.path().join("sub");
    let sub_session = repo.core.session_for(&sub_dir).expect("sessão do submódulo");
    assert_ne!(sub_session.workdir(), repo.session().workdir());
    sub_session.execute(OperationKind::Checkout { target: "sb".into() }).expect("checkout no submódulo");
    assert_eq!(run_git(&sub_dir, &["branch", "--show-current"]), "sb");

    sub_session.undo().expect("desfaz só no submódulo");
    assert_ne!(run_git(&sub_dir, &["branch", "--show-current"]), "sb");
    assert_eq!(repo.branch(), "x", "o repositório principal não foi tocado");
}

// ---- #6 Mudança externa ---------------------------------------------------------------------

#[test]
fn commit_externo_impede_desfazer_e_explica_o_motivo() {
    let repo = TestRepo::new();
    repo.git(&["branch", "x"]);
    repo.checkout("x");
    repo.write("novo.txt", "n");
    repo.commit_all("pelo terminal");

    let s = repo.session();
    s.sync_external().expect("sync");
    let state = s.undo_state();
    assert!(!state.undo.enabled);
    assert_eq!(state.undo.reason.as_deref(), Some("O repositório mudou fora do Mnemo"));
    assert!(matches!(s.undo(), Err(CoreError::ExternalChange)));
    assert_eq!(repo.branch(), "x");
}

#[test]
fn checkout_externo_tambem_conta_e_a_checagem_roda_no_clique() {
    let repo = TestRepo::new();
    repo.git(&["branch", "x"]);
    repo.git(&["branch", "y"]);
    repo.checkout("x");
    repo.git(&["checkout", "-q", "y"]);
    // sem sync_external: a checagem acontece ao tentar desfazer
    assert!(matches!(repo.session().undo(), Err(CoreError::ExternalChange)));
    assert_eq!(repo.branch(), "y");
}

#[test]
fn refazer_tambem_e_bloqueado_por_mudanca_externa() {
    let repo = TestRepo::new();
    repo.git(&["branch", "x"]);
    repo.checkout("x");
    repo.session().undo().expect("desfaz");
    repo.git(&["checkout", "-q", "-b", "z"]);
    assert!(matches!(repo.session().redo(), Err(CoreError::ExternalChange)));
    assert_eq!(repo.branch(), "z");
}

#[test]
fn operacao_nova_depois_da_mudanca_externa_volta_a_ser_desfazivel() {
    let repo = TestRepo::new();
    repo.git(&["branch", "x"]);
    repo.checkout("x");
    repo.write("n.txt", "n");
    repo.commit_all("externo");

    repo.checkout("main");
    let s = repo.session();
    assert!(s.undo_state().undo.enabled);
    s.undo().expect("desfaz a nova");
    assert_eq!(repo.branch(), "x");
    assert!(!s.undo_state().undo.enabled, "a anterior à mudança externa saiu do histórico");
}

#[test]
fn fetch_por_fora_nao_e_mudanca_externa() {
    let repo = TestRepo::new();
    let remote = repo.with_remote();
    repo.git(&["branch", "x"]);
    repo.checkout("x");
    // outro clone empurra e o fetch atualiza só refs remotas
    let other = tempfile::tempdir().expect("tempdir");
    run_git(other.path(), &["clone", "-q", &remote.path().to_string_lossy(), "."]);
    run_git(other.path(), &["config", "user.name", "o"]);
    run_git(other.path(), &["config", "user.email", "o@e"]);
    std::fs::write(other.path().join("o.txt"), "o").expect("write");
    run_git(other.path(), &["add", "-A"]);
    run_git(other.path(), &["commit", "-q", "-m", "o"]);
    run_git(other.path(), &["push", "-q"]);
    repo.git(&["fetch", "-q"]);

    repo.session().undo().expect("ainda desfaz");
    assert_eq!(repo.branch(), "main");
}
