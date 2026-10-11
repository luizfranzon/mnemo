mod support;
use mnemo_core::application::session::ExecuteResult;
use mnemo_core::domain::operation::{OperationKind, ResetMode};
use mnemo_core::CoreError;
use support::TestRepo;

fn discard(repo: &TestRepo, paths: &[&str]) -> ExecuteResult {
    repo.exec(OperationKind::Discard { paths: paths.iter().map(|p| p.to_string()).collect() })
}

fn pinned_refs(repo: &TestRepo) -> String {
    repo.git(&["for-each-ref", "refs/mnemo"])
}

// ---- #8 Descartar -----------------------------------------------------------------------------

#[test]
fn descartar_e_desfazer_recupera_o_arquivo_rastreado() {
    let repo = TestRepo::new();
    repo.write("a.txt", "editado\n");
    discard(&repo, &["a.txt"]);
    assert_eq!(repo.read("a.txt"), "um\ndois\ntres\n");
    assert!(repo.status().is_empty());

    repo.session().undo().expect("desfaz");
    assert_eq!(repo.read("a.txt"), "editado\n");
    repo.session().redo().expect("refaz");
    assert_eq!(repo.read("a.txt"), "um\ndois\ntres\n");
}

#[test]
fn descartar_untracked_e_desfazer_recria_o_arquivo() {
    let repo = TestRepo::new();
    repo.write("novo/dir/u.txt", "untracked\n");
    discard(&repo, &[]);
    assert!(!repo.exists("novo/dir/u.txt"));

    repo.session().undo().expect("desfaz");
    assert_eq!(repo.read("novo/dir/u.txt"), "untracked\n");
}

#[test]
fn descartar_arquivo_staged_novo_e_desfazer() {
    let repo = TestRepo::new();
    repo.write("s.txt", "staged\n");
    repo.git(&["add", "s.txt"]);
    discard(&repo, &["s.txt"]);
    assert!(!repo.exists("s.txt"));
    repo.session().undo().expect("desfaz");
    assert_eq!(repo.read("s.txt"), "staged\n");
}

#[test]
fn descartar_arquivo_apagado_e_desfazer_apaga_de_novo() {
    let repo = TestRepo::new();
    std::fs::remove_file(repo.path().join("a.txt")).expect("rm");
    discard(&repo, &["a.txt"]);
    assert!(repo.exists("a.txt"));
    repo.session().undo().expect("desfaz");
    assert!(!repo.exists("a.txt"));
}

#[test]
fn descartar_um_arquivo_nao_mexe_nos_outros() {
    let repo = TestRepo::new();
    repo.write("b.txt", "b\n");
    repo.commit_all("b");
    repo.write("a.txt", "A\n");
    repo.write("b.txt", "B\n");
    discard(&repo, &["a.txt"]);
    assert_eq!(repo.read("b.txt"), "B\n");
    assert_eq!(repo.read("a.txt"), "um\ndois\ntres\n");
}

#[test]
fn editar_outra_regiao_e_desfazer_junta_as_duas_versoes() {
    let repo = TestRepo::new();
    repo.write("a.txt", "UM\ndois\ntres\n");
    discard(&repo, &["a.txt"]);
    repo.write("a.txt", "um\ndois\nTRES\n");
    repo.session().undo().expect("junta sem conflito");
    assert_eq!(repo.read("a.txt"), "UM\ndois\nTRES\n");
}

#[test]
fn editar_a_mesma_regiao_devolve_conflito_sem_mudar_nada() {
    let repo = TestRepo::new();
    repo.write("a.txt", "UM\ndois\ntres\n");
    discard(&repo, &["a.txt"]);
    repo.write("a.txt", "Um!\ndois\ntres\n");

    let err = repo.session().undo().expect_err("conflito");
    let op_id = match err {
        CoreError::RestoreConflict { op_id, ref paths } => {
            assert_eq!(paths, &vec!["a.txt".to_string()]);
            op_id
        }
        other => panic!("esperava conflito, veio {other:?}"),
    };
    assert_eq!(repo.read("a.txt"), "Um!\ndois\ntres\n", "nada mudou");
    assert!(repo.session().undo_state().undo.enabled, "continua desfazível");

    let copies = repo.session().restore_discard_as_copies(op_id).expect("cópia ao lado");
    assert_eq!(copies, vec!["a.txt.mnemo-restaurado".to_string()]);
    assert_eq!(repo.read("a.txt.mnemo-restaurado"), "UM\ndois\ntres\n");
    assert_eq!(repo.read("a.txt"), "Um!\ndois\ntres\n");
}

#[test]
fn acima_do_limite_avisa_e_segue_sem_snapshot() {
    use mnemo_core::application::handlers::HandlerSet;
    use mnemo_core::application::ports::NoEvents;
    use mnemo_core::application::session::{RepoSession, SessionDeps};
    use mnemo_core::infrastructure::json_history_store::JsonHistoryStore;
    use mnemo_core::infrastructure::process_git::ProcessGit;
    use std::sync::Arc;

    let repo = TestRepo::new();
    repo.write("grande.bin", &"x".repeat(2048));
    let session = RepoSession::open(
        repo.path().to_path_buf(),
        SessionDeps {
            git: Arc::new(ProcessGit::from_path()),
            store: Arc::new(JsonHistoryStore::new(repo.data.path())),
            events: Arc::new(NoEvents),
            handlers: Arc::new(HandlerSet::default()),
            hooks: vec![],
            snapshot_limit: 1024,
            history_limit: 50,
        },
    )
    .expect("sessão");
    assert!(session.discard_preview(&[]).expect("preview").exceeds_limit);

    let ExecuteResult::Completed { warnings, undoable, .. } =
        session.execute(OperationKind::Discard { paths: vec![] }).expect("descarta")
    else {
        panic!("esperava Completed")
    };
    assert!(!warnings.is_empty());
    assert!(!undoable);
    assert!(!repo.exists("grande.bin"));
    assert!(pinned_refs(&repo).is_empty());
    assert!(!session.undo_state().undo.enabled);
}

#[test]
fn refs_do_snapshot_somem_quando_a_operacao_sai_do_historico() {
    let repo = TestRepo::new();
    repo.write("a.txt", "editado\n");
    discard(&repo, &["a.txt"]);
    assert!(!pinned_refs(&repo).is_empty(), "snapshot preso a refs/mnemo");

    // limite de 50: 50 operações novas expulsam o descarte
    for i in 0..50 {
        repo.exec(OperationKind::TagCreate { name: format!("t{i}"), target: None, message: None });
    }
    assert!(pinned_refs(&repo).is_empty());
}

#[test]
fn refazer_descartado_pela_operacao_nova_libera_o_snapshot() {
    let repo = TestRepo::new();
    repo.write("a.txt", "editado\n");
    discard(&repo, &["a.txt"]);
    repo.session().undo().expect("desfaz");
    repo.exec(OperationKind::TagCreate { name: "t".into(), target: None, message: None });
    assert!(pinned_refs(&repo).is_empty(), "o Refazer descartado soltou o snapshot");
}

#[test]
fn nada_para_descartar_devolve_erro_claro() {
    let repo = TestRepo::new();
    let err = repo.session().execute(OperationKind::Discard { paths: vec![] }).expect_err("nada");
    assert!(matches!(err, CoreError::NothingToDo { .. }));
}

#[test]
fn descarte_anterior_a_mudanca_externa_continua_desfazivel() {
    let repo = TestRepo::new();
    repo.write("a.txt", "editado\n");
    discard(&repo, &["a.txt"]);
    repo.git(&["branch", "x"]);
    repo.git(&["checkout", "-q", "x"]); // mudança externa
    repo.write("zzz.txt", "z");
    repo.commit_all("externo");

    let s = repo.session();
    s.sync_external().expect("sync");
    assert!(s.undo_state().undo.enabled);
    s.undo().expect("desfaz o descarte mesmo assim");
    assert_eq!(repo.read("a.txt"), "editado\n");
}

#[test]
fn mudanca_externa_corta_refs_mas_preserva_descartes() {
    let repo = TestRepo::new();
    repo.git(&["branch", "x"]);
    repo.checkout("x");
    repo.write("a.txt", "editado\n");
    discard(&repo, &["a.txt"]);
    repo.write("ext.txt", "e");
    repo.commit_all("externo"); // mudança externa

    let s = repo.session();
    s.sync_external().expect("sync");
    s.undo().expect("desfaz o descarte (topo)");
    assert!(!s.undo_state().undo.enabled, "o checkout anterior saiu do histórico");
}

// ---- #9 Reset hard ------------------------------------------------------------------------------

fn repo_com_dois_commits() -> (TestRepo, String, String) {
    let repo = TestRepo::new();
    let first = repo.head();
    repo.write("b.txt", "b\n");
    let second = repo.commit_all("segundo");
    (repo, first, second)
}

#[test]
fn desfazer_reset_hard_volta_a_branch_e_o_wip() {
    let (repo, first, second) = repo_com_dois_commits();
    repo.write("a.txt", "wip rastreado\n");
    repo.write("u.txt", "wip untracked\n");

    repo.exec(OperationKind::Reset { target: first.clone(), mode: ResetMode::Hard });
    assert_eq!(repo.head(), first);
    assert_eq!(repo.read("a.txt"), "um\ndois\ntres\n");
    assert!(!repo.exists("b.txt"));

    repo.session().undo().expect("desfaz");
    assert_eq!(repo.head(), second);
    assert_eq!(repo.read("a.txt"), "wip rastreado\n");
    assert_eq!(repo.read("u.txt"), "wip untracked\n");
    assert_eq!(repo.read("b.txt"), "b\n");

    repo.session().redo().expect("refaz");
    assert_eq!(repo.head(), first);
    assert_eq!(repo.read("a.txt"), "um\ndois\ntres\n");
    repo.session().undo().expect("desfaz outra vez");
    assert_eq!(repo.read("a.txt"), "wip rastreado\n");
}

#[test]
fn reset_hard_sem_wip_tambem_e_desfeito_e_refeito() {
    let (repo, first, second) = repo_com_dois_commits();
    repo.exec(OperationKind::Reset { target: first.clone(), mode: ResetMode::Hard });
    assert_eq!(repo.head(), first);
    repo.session().undo().expect("desfaz");
    assert_eq!(repo.head(), second);
    assert_eq!(repo.read("b.txt"), "b\n");
    repo.session().redo().expect("refaz");
    assert_eq!(repo.head(), first);
    assert!(!repo.exists("b.txt"));
}

#[test]
fn reset_hard_com_wip_conflitante_nao_muda_nada_ao_desfazer() {
    let (repo, first, second) = repo_com_dois_commits();
    repo.write("a.txt", "wip\ndois\ntres\n");
    repo.exec(OperationKind::Reset { target: first.clone(), mode: ResetMode::Hard });
    repo.write("a.txt", "outra coisa\ndois\ntres\n");

    let err = repo.session().undo().expect_err("conflito");
    assert!(matches!(err, CoreError::RestoreConflict { .. }));
    assert_eq!(repo.head(), first, "os refs voltaram ao ponto em que estavam");
    assert_eq!(repo.read("a.txt"), "outra coisa\ndois\ntres\n");
    let _ = second;
}

#[test]
fn reset_hard_sem_snapshot_nao_vira_mudanca_externa() {
    use mnemo_core::application::handlers::HandlerSet;
    use mnemo_core::application::ports::NoEvents;
    use mnemo_core::application::session::{RepoSession, SessionDeps};
    use mnemo_core::infrastructure::json_history_store::JsonHistoryStore;
    use mnemo_core::infrastructure::process_git::ProcessGit;
    use std::sync::Arc;

    let (repo, first, _second) = repo_com_dois_commits();
    repo.git(&["branch", "x"]);
    let session = RepoSession::open(
        repo.path().to_path_buf(),
        SessionDeps {
            git: Arc::new(ProcessGit::from_path()),
            store: Arc::new(JsonHistoryStore::new(repo.data.path())),
            events: Arc::new(NoEvents),
            handlers: Arc::new(HandlerSet::default()),
            hooks: vec![],
            snapshot_limit: 16,
            history_limit: 50,
        },
    )
    .expect("sessão");
    session.execute(OperationKind::Checkout { target: "x".into() }).expect("checkout");
    repo.write("grande.bin", &"x".repeat(2048));
    session.execute(OperationKind::Reset { target: first, mode: ResetMode::Hard }).expect("reset sem snapshot");

    // a própria Operação do Mnemo moveu os refs: não é Mudança externa
    let state = session.sync_external().expect("sync");
    assert_ne!(state.undo.reason.as_deref(), Some("O repositório mudou fora do Mnemo"));
    assert!(state.undo.reason.expect("motivo").contains("reset"));
}

#[test]
fn preview_do_reset_hard_conta_commits_e_mudancas() {
    let (repo, first, _second) = repo_com_dois_commits();
    repo.write("a.txt", "wip
");
    repo.write("u.txt", "novo
");
    let p = repo.session().reset_preview(&first).expect("preview");
    assert_eq!((p.commits, p.discard.tracked_changes, p.discard.untracked_files), (1, 1, 1));
}
