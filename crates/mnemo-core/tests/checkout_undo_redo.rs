mod support;
use mnemo_core::domain::operation::OperationKind;
use mnemo_core::CoreError;
use support::TestRepo;

fn repo_com_duas_branches() -> TestRepo {
    let repo = TestRepo::new();
    repo.git(&["branch", "t34951"]);
    repo.git(&["branch", "outra"]);
    repo
}

#[test]
fn desfazer_checkout_volta_a_branch_e_refazer_vai_de_novo() {
    let repo = repo_com_duas_branches();
    repo.checkout("t34951");
    assert_eq!(repo.branch(), "t34951");

    let s = repo.session();
    s.undo().expect("desfaz");
    assert_eq!(repo.branch(), "main");
    s.redo().expect("refaz");
    assert_eq!(repo.branch(), "t34951");
}

#[test]
fn checkout_de_commit_solto_e_desfeito() {
    let repo = TestRepo::new();
    let first = repo.head();
    repo.write("b.txt", "b");
    repo.commit_all("segundo");
    repo.checkout(&first);
    assert_eq!(repo.branch(), "");
    assert_eq!(repo.head(), first);

    repo.session().undo().expect("desfaz");
    assert_eq!(repo.branch(), "main");
}

#[test]
fn rotulo_diz_o_alvo() {
    let repo = repo_com_duas_branches();
    repo.checkout("t34951");
    let state = repo.session().undo_state();
    assert_eq!(state.undo.label.as_deref(), Some("Desfazer checkout de t34951"));
    assert!(state.undo.enabled);
    assert!(!state.redo.enabled);
}

#[test]
fn sem_nada_para_desfazer_o_botao_fica_desabilitado_com_motivo() {
    let repo = TestRepo::new();
    let state = repo.session().undo_state();
    assert!(!state.undo.enabled);
    assert_eq!(state.undo.reason.as_deref(), Some("Nada para desfazer"));
    assert!(matches!(repo.session().undo(), Err(CoreError::NothingToUndo)));
}

#[test]
fn desfazer_em_sequencia_volta_varios_passos() {
    let repo = repo_com_duas_branches();
    repo.checkout("t34951");
    repo.checkout("outra");
    repo.checkout("main");
    let s = repo.session();
    s.undo().expect("1");
    assert_eq!(repo.branch(), "outra");
    s.undo().expect("2");
    assert_eq!(repo.branch(), "t34951");
    s.undo().expect("3");
    assert_eq!(repo.branch(), "main");
    assert!(!s.undo_state().undo.enabled);
}

#[test]
fn operacao_nova_esvazia_o_refazer() {
    let repo = repo_com_duas_branches();
    repo.checkout("t34951");
    repo.session().undo().expect("desfaz");
    assert!(repo.session().undo_state().redo.enabled);

    repo.checkout("outra");
    let state = repo.session().undo_state();
    assert!(!state.redo.enabled);
    assert!(matches!(repo.session().redo(), Err(CoreError::NothingToRedo)));
}

#[test]
fn checkout_para_a_branch_atual_nao_entra_no_historico() {
    let repo = TestRepo::new();
    let r = repo.session().execute(OperationKind::Checkout { target: "main".into() }).expect("ok");
    assert!(matches!(r, mnemo_core::application::session::ExecuteResult::Completed { op_id: None, .. }));
    assert!(!repo.session().undo_state().undo.enabled);
}

#[test]
fn checkout_que_cria_branch_de_rastreamento_desfaz_removendo_a_branch() {
    let repo = TestRepo::new();
    let _remote = repo.with_remote();
    repo.git(&["branch", "feature"]);
    repo.git(&["push", "-q", "origin", "feature"]);
    repo.git(&["branch", "-D", "feature"]);
    repo.git(&["fetch", "-q", "origin"]);

    repo.checkout("feature");
    assert_eq!(repo.branch(), "feature");
    repo.session().undo().expect("desfaz");
    assert_eq!(repo.branch(), "main");
    assert!(repo.git(&["branch", "--list", "feature"]).is_empty());
}
