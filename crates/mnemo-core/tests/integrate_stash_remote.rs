mod support;
use mnemo_core::api::HeadInfo;
use mnemo_core::application::session::ExecuteResult;
use mnemo_core::domain::operation::{OperationKind, PullStrategy};
use mnemo_core::CoreError;
use std::sync::Arc;
use support::{run_git, TestRepo};

/// main e `feat` divergem; `feat` tem `f.txt`.
fn repo_com_feat(divergente: bool) -> TestRepo {
    let repo = TestRepo::new();
    repo.git(&["checkout", "-q", "-b", "feat"]);
    repo.write("f.txt", "f\n");
    repo.commit_all("feat");
    repo.git(&["checkout", "-q", "main"]);
    if divergente {
        repo.write("m.txt", "m\n");
        repo.commit_all("main");
    }
    repo
}

fn conflitante() -> TestRepo {
    let repo = TestRepo::new();
    repo.git(&["checkout", "-q", "-b", "feat"]);
    repo.write("a.txt", "FEAT\ndois\ntres\n");
    repo.commit_all("feat");
    repo.git(&["checkout", "-q", "main"]);
    repo.write("a.txt", "MAIN\ndois\ntres\n");
    repo.commit_all("main");
    repo
}

// ---- #10 -----------------------------------------------------------------------------------

#[test]
fn desfazer_merge_fast_forward() {
    let repo = repo_com_feat(false);
    let before = repo.head();
    repo.exec(OperationKind::Merge { target: "feat".into() });
    assert_ne!(repo.head(), before);
    repo.session().undo().expect("desfaz");
    assert_eq!(repo.head(), before);
    assert!(!repo.exists("f.txt"));
    repo.session().redo().expect("refaz");
    assert_eq!(repo.read("f.txt"), "f\n");
}

#[test]
fn desfazer_merge_com_commit_de_merge() {
    let repo = repo_com_feat(true);
    let before = repo.head();
    repo.exec(OperationKind::Merge { target: "feat".into() });
    assert_eq!(repo.git(&["rev-list", "--parents", "-n1", "HEAD"]).split(' ').count(), 3);
    repo.session().undo().expect("desfaz");
    assert_eq!(repo.head(), before);
    assert!(repo.status().is_empty());
}

#[test]
fn desfazer_rebase_concluido_volta_a_branch_inteira() {
    let repo = repo_com_feat(true);
    repo.git(&["checkout", "-q", "feat"]);
    let before = repo.head();
    repo.exec(OperationKind::Rebase { onto: "main".into() });
    assert_ne!(repo.head(), before);
    assert_eq!(repo.branch(), "feat");
    repo.session().undo().expect("desfaz");
    assert_eq!(repo.head(), before);
    assert_eq!(repo.branch(), "feat");
    assert!(!repo.exists("m.txt"));
}

#[test]
fn desfazer_cherry_pick_e_revert_removem_o_commit_criado() {
    let repo = repo_com_feat(true);
    let before = repo.head();
    let feat = repo.rev("feat");
    repo.exec(OperationKind::CherryPick { commit: feat });
    assert!(repo.exists("f.txt"));
    repo.session().undo().expect("desfaz cherry-pick");
    assert_eq!(repo.head(), before);
    assert!(!repo.exists("f.txt"));

    repo.exec(OperationKind::Revert { commit: before.clone() });
    assert!(!repo.exists("m.txt"));
    repo.session().undo().expect("desfaz revert");
    assert_eq!(repo.head(), before);
    assert!(repo.exists("m.txt"));
}

#[test]
fn desfazer_pull_volta_so_a_branch_local() {
    let repo = TestRepo::new();
    let remote = repo.with_remote();
    let before = repo.head();
    let other = tempfile::tempdir().expect("tempdir");
    run_git(other.path(), &["clone", "-q", &remote.path().to_string_lossy(), "."]);
    run_git(other.path(), &["config", "user.name", "o"]);
    run_git(other.path(), &["config", "user.email", "o@e"]);
    std::fs::write(other.path().join("o.txt"), "o").expect("write");
    run_git(other.path(), &["add", "-A"]);
    run_git(other.path(), &["commit", "-q", "-m", "o"]);
    run_git(other.path(), &["push", "-q"]);
    let remote_head = run_git(other.path(), &["rev-parse", "HEAD"]);

    repo.exec(OperationKind::Pull { strategy: Some(PullStrategy::FfOnly) });
    assert_eq!(repo.head(), remote_head);
    repo.session().undo().expect("desfaz");
    assert_eq!(repo.head(), before);
    assert_eq!(repo.rev("origin/main"), remote_head, "refs remotas ficam como o fetch deixou");
    assert!(!repo.exists("o.txt"));
}

#[test]
fn merge_ja_atualizado_nao_entra_no_historico() {
    let repo = TestRepo::new();
    repo.git(&["branch", "x"]);
    let r = repo.exec(OperationKind::Merge { target: "x".into() });
    assert!(matches!(r, ExecuteResult::Completed { op_id: None, .. }));
    assert!(!repo.session().undo_state().undo.enabled);
}

#[test]
fn merge_em_conflito_nao_e_operacao_e_o_desfazer_diz_em_andamento() {
    let repo = conflitante();
    repo.git(&["branch", "x"]);
    repo.checkout("x"); // operação anterior, desfazível
    repo.checkout("main");

    let r = repo.exec(OperationKind::Merge { target: "feat".into() });
    assert!(matches!(r, ExecuteResult::Conflict { .. }));
    let state = repo.session().undo_state();
    assert!(!state.undo.enabled);
    assert_eq!(state.undo.reason.as_deref(), Some("Merge em andamento: use Abortar"));
    assert!(matches!(repo.session().undo(), Err(CoreError::InProgress { .. })));

    // outras Operações não começam no meio de um merge
    let err = repo.session().execute(OperationKind::Checkout { target: "x".into() }).expect_err("bloqueado");
    assert!(matches!(err, CoreError::InProgress { .. }));

    // abortado: não acrescenta nada
    repo.session().abort_in_progress().expect("aborta");
    let state = repo.session().undo_state();
    assert_eq!(state.undo.label.as_deref(), Some("Desfazer checkout de main"));
    repo.session().undo().expect("desfaz o checkout anterior");
    assert_eq!(repo.branch(), "x");
}

#[test]
fn rebase_em_conflito_abortado_nao_deixa_nada() {
    let repo = conflitante();
    repo.git(&["checkout", "-q", "feat"]);
    let r = repo.exec(OperationKind::Rebase { onto: "main".into() });
    assert!(matches!(r, ExecuteResult::Conflict { ref progress, .. } if progress == "Rebase"));
    assert_eq!(repo.session().undo_state().undo.reason.as_deref(), Some("Rebase em andamento: use Abortar"));
    repo.session().abort_in_progress().expect("aborta");
    assert_eq!(repo.branch(), "feat");
    assert!(!repo.session().undo_state().undo.enabled);
}

#[test]
fn rebase_em_conflito_pode_pular_commit() {
    let repo = conflitante();
    repo.git(&["checkout", "-q", "feat"]);
    let r = repo.exec(OperationKind::Rebase { onto: "main".into() });
    assert!(matches!(r, ExecuteResult::Conflict { .. }));
    let r = repo.session().skip_in_progress().expect("pula commit em conflito");
    assert!(matches!(r, ExecuteResult::Completed { .. }));
    assert_eq!(repo.head(), repo.rev("main"));
}

#[test]
fn merge_com_conflito_resolvido_entra_no_historico_ao_concluir_e_desfaz_inteiro() {
    let repo = conflitante();
    let before = repo.head();
    repo.exec(OperationKind::Merge { target: "feat".into() });
    repo.write("a.txt", "resolvido\ndois\ntres\n");
    repo.git(&["add", "a.txt"]);

    let r = repo.session().continue_in_progress().expect("continua");
    assert!(matches!(r, ExecuteResult::Completed { op_id: Some(_), .. }));
    assert_eq!(repo.read("a.txt"), "resolvido\ndois\ntres\n");
    repo.session().undo().expect("desfaz o merge inteiro");
    assert_eq!(repo.head(), before);
    assert_eq!(repo.read("a.txt"), "MAIN\ndois\ntres\n");
}

#[test]
fn pendencia_de_conflito_sobrevive_a_reabrir_o_core() {
    let repo = conflitante();
    let before = repo.head();
    repo.exec(OperationKind::Merge { target: "feat".into() });
    drop(repo.session());
    let (_core, session) = repo.reopen();
    repo.write("a.txt", "resolvido\n");
    repo.git(&["add", "a.txt"]);
    session.continue_in_progress().expect("continua");
    session.undo().expect("desfaz");
    assert_eq!(repo.head(), before);
}

// ---- #11 Stash ----------------------------------------------------------------------------------

fn stash_list(repo: &TestRepo) -> String {
    repo.git(&["stash", "list", "--format=%H %gs"])
}

#[test]
fn criar_stash_e_desfazer_devolve_o_wip_e_remove_o_stash() {
    let repo = TestRepo::new();
    repo.write("a.txt", "wip\n");
    repo.write("u.txt", "untracked\n");
    repo.exec(OperationKind::StashCreate { message: Some("meu".into()), include_untracked: true, paths: vec![] });
    assert!(repo.status().is_empty());
    assert_eq!(stash_list(&repo).lines().count(), 1);

    repo.session().undo().expect("desfaz");
    assert_eq!(repo.read("a.txt"), "wip\n");
    assert_eq!(repo.read("u.txt"), "untracked\n");
    assert!(stash_list(&repo).is_empty());

    repo.session().redo().expect("refaz");
    assert!(repo.status().is_empty());
    assert_eq!(stash_list(&repo).lines().count(), 1);
}

#[test]
fn pop_e_desfazer_volta_o_wip_de_antes_e_o_stash_volta_a_lista() {
    let repo = TestRepo::new();
    repo.write("a.txt", "no stash\n");
    repo.git(&["stash", "push", "-q", "-m", "guardado"]);
    let listed = stash_list(&repo);
    repo.write("b.txt", "wip anterior\n");

    repo.exec(OperationKind::StashPop { index: 0 });
    assert_eq!(repo.read("a.txt"), "no stash\n");
    assert!(stash_list(&repo).is_empty());

    repo.session().undo().expect("desfaz");
    assert_eq!(repo.read("a.txt"), "um\ndois\ntres\n");
    assert_eq!(repo.read("b.txt"), "wip anterior\n");
    assert_eq!(stash_list(&repo), listed);

    repo.session().redo().expect("refaz");
    assert_eq!(repo.read("a.txt"), "no stash\n");
    assert!(stash_list(&repo).is_empty());
}

#[test]
fn aplicar_e_desfazer_volta_o_wip_de_antes() {
    let repo = TestRepo::new();
    repo.write("a.txt", "no stash\n");
    repo.git(&["stash", "push", "-q"]);
    let listed = stash_list(&repo);

    repo.exec(OperationKind::StashApply { index: 0 });
    assert_eq!(repo.read("a.txt"), "no stash\n");
    assert_eq!(stash_list(&repo), listed, "aplicar mantém o stash");
    repo.session().undo().expect("desfaz");
    assert_eq!(repo.read("a.txt"), "um\ndois\ntres\n");
    assert_eq!(stash_list(&repo), listed);
}

#[test]
fn excluir_stash_e_desfazer_recria_com_o_mesmo_conteudo() {
    let repo = TestRepo::new();
    repo.write("a.txt", "um\n");
    repo.git(&["stash", "push", "-q", "-m", "primeiro"]);
    repo.write("a.txt", "dois\n");
    repo.git(&["stash", "push", "-q", "-m", "segundo"]);
    let listed = stash_list(&repo);

    repo.exec(OperationKind::StashDrop { index: 1 });
    assert_eq!(stash_list(&repo).lines().count(), 1);
    repo.session().undo().expect("desfaz");
    assert_eq!(stash_list(&repo), listed, "mesma ordem e mesmos SHAs");
    repo.session().redo().expect("refaz");
    assert_eq!(stash_list(&repo).lines().count(), 1);
}

#[test]
fn desfazer_stash_nao_sobrescreve_edicao_feita_depois() {
    let repo = TestRepo::new();
    repo.write("a.txt", "wip\n");
    repo.exec(OperationKind::StashCreate { message: None, include_untracked: false, paths: vec![] });
    repo.write("a.txt", "editei depois\n");
    assert!(matches!(repo.session().undo(), Err(CoreError::WipChanged)));
    assert_eq!(repo.read("a.txt"), "editei depois\n");
}

// ---- #12 Fila, index.lock e não desfazíveis -----------------------------------------------------

#[test]
fn duas_operacoes_ao_mesmo_tempo_rodam_em_sequencia() {
    let repo = TestRepo::new();
    for n in ["a1", "a2", "a3", "a4"] {
        repo.git(&["branch", n]);
    }
    let session = repo.session();
    let handles: Vec<_> = ["a1", "a2", "a3", "a4"]
        .into_iter()
        .map(|n| {
            let s = Arc::clone(&session);
            std::thread::spawn(move || s.execute(OperationKind::Checkout { target: n.into() }))
        })
        .collect();
    for h in handles {
        h.join().expect("thread").expect("op");
    }
    // 4 checkouts, cada um com o "antes" certo: dá para desfazer os 4, voltando à main
    for _ in 0..4 {
        session.undo().expect("desfaz");
    }
    assert_eq!(repo.branch(), "main");
    assert!(!session.undo_state().undo.enabled);
}

#[test]
fn index_lock_de_outro_processo_vira_erro_tipado() {
    let repo = TestRepo::new();
    repo.git(&["branch", "x"]);
    std::fs::write(repo.path().join(".git/index.lock"), "").expect("lock");
    let err = repo.session().execute(OperationKind::Checkout { target: "x".into() }).expect_err("bloqueado");
    assert!(matches!(err, CoreError::IndexLocked));
    assert_eq!(err.to_string(), "Outro processo git está usando este repositório");
    std::fs::remove_file(repo.path().join(".git/index.lock")).expect("rm");
    repo.session().execute(OperationKind::Checkout { target: "x".into() }).expect("tentar de novo funciona");
}

#[test]
fn push_fetch_e_excluir_remota_nao_sao_desfazíveis() {
    let repo = TestRepo::new();
    let remote = repo.with_remote();
    repo.git(&["branch", "velha"]);
    repo.git(&["push", "-q", "origin", "velha"]);

    let r = repo.exec(OperationKind::Push {
        remote: Some("origin".into()),
        branch: Some("main".into()),
        set_upstream: false,
    });
    assert!(matches!(r, ExecuteResult::Completed { undoable: false, .. }));
    let state = repo.session().undo_state();
    assert!(!state.undo.enabled);
    assert_eq!(state.undo.reason.as_deref(), Some("Não é possível desfazer push: mexe no remoto"));
    assert!(matches!(repo.session().undo(), Err(CoreError::NotUndoable { .. })));

    repo.exec(OperationKind::Fetch { remote: None });
    assert!(repo.session().undo_state().undo.reason.expect("motivo").contains("mexe no remoto"));

    repo.exec(OperationKind::DeleteRemoteBranch { remote: "origin".into(), branch: "velha".into() });
    assert!(run_git(remote.path(), &["branch", "--list", "velha"]).is_empty());
    assert!(!repo.session().undo_state().undo.enabled);
}

fn upstream(repo: &TestRepo) -> Option<String> {
    match repo.core.open_repository(&repo.path().to_string_lossy()).expect("abre").head {
        HeadInfo::Branch { upstream, .. } => upstream,
        HeadInfo::Detached { .. } => None,
    }
}

#[test]
fn push_com_set_upstream_sem_alvo_publica_a_branch_atual_no_origin() {
    let repo = TestRepo::new();
    let _remote = repo.with_remote();
    assert_eq!(upstream(&repo).as_deref(), Some("origin/main"));
    repo.git(&["checkout", "-q", "-b", "nova"]);
    assert_eq!(upstream(&repo), None);

    repo.exec(OperationKind::Push { remote: None, branch: None, set_upstream: true });
    assert_eq!(upstream(&repo).as_deref(), Some("origin/nova"));
    assert_eq!(repo.rev("origin/nova"), repo.head());

    // excluída do remoto, a branch volta a precisar de upstream
    repo.exec(OperationKind::DeleteRemoteBranch { remote: "origin".into(), branch: "nova".into() });
    assert_eq!(upstream(&repo), None);
}

#[test]
fn lista_branches_remotas_sem_o_head_simbolico() {
    let repo = TestRepo::new();
    let _remote = repo.with_remote();
    repo.git(&["push", "-q", "origin", "main:feat/x"]);
    repo.git(&["remote", "set-head", "origin", "main"]);
    let list: Vec<_> = repo
        .core
        .list_remote_branches(&repo.path().to_string_lossy())
        .expect("lista")
        .into_iter()
        .map(|b| (b.remote, b.name))
        .collect();
    assert_eq!(list, [("origin".to_string(), "feat/x".to_string()), ("origin".into(), "main".into())]);
}

#[test]
fn merge_concluido_fora_entra_no_historico_ao_atualizar_e_desfaz_inteiro() {
    let repo = conflitante();
    let before = repo.head();
    repo.exec(OperationKind::Merge { target: "feat".into() });
    repo.write("a.txt", "resolvido\ndois\ntres\n");
    repo.git(&["add", "a.txt"]);
    repo.git(&["commit", "-q", "--no-edit"]);

    let r = repo.session().refresh_external().expect("atualiza");
    assert!(matches!(r, Some(ExecuteResult::Completed { op_id: Some(_), .. })));
    repo.session().undo().expect("desfaz o merge inteiro");
    assert_eq!(repo.head(), before);
    assert_eq!(repo.read("a.txt"), "MAIN\ndois\ntres\n");
}

#[test]
fn merge_concluido_fora_entra_no_historico_ao_reabrir_o_core() {
    let repo = conflitante();
    let before = repo.head();
    repo.exec(OperationKind::Merge { target: "feat".into() });
    drop(repo.session());
    repo.write("a.txt", "resolvido\n");
    repo.git(&["add", "a.txt"]);
    repo.git(&["commit", "-q", "--no-edit"]);
    let (_core, session) = repo.reopen();
    session.undo().expect("desfaz o merge adotado");
    assert_eq!(repo.head(), before);
}

#[test]
fn continuar_depois_de_concluir_fora_adota_o_merge() {
    let repo = conflitante();
    repo.exec(OperationKind::Merge { target: "feat".into() });
    repo.write("a.txt", "resolvido\n");
    repo.git(&["add", "a.txt"]);
    repo.git(&["commit", "-q", "--no-edit"]);
    let r = repo.session().continue_in_progress().expect("adota");
    assert!(matches!(r, ExecuteResult::Completed { op_id: Some(_), .. }));
}

#[test]
fn merge_concluido_fora_com_commit_por_cima_e_mudanca_externa() {
    let repo = conflitante();
    repo.git(&["branch", "x"]);
    repo.checkout("x");
    repo.checkout("main");
    repo.exec(OperationKind::Merge { target: "feat".into() });
    repo.write("a.txt", "resolvido\n");
    repo.git(&["add", "a.txt"]);
    repo.git(&["commit", "-q", "--no-edit"]);
    repo.write("b.txt", "b\n");
    repo.commit_all("depois");

    assert!(repo.session().refresh_external().expect("atualiza").is_none());
    let state = repo.session().undo_state();
    assert_eq!(state.undo.reason.as_deref(), Some("O repositório mudou fora do Mnemo"));
}

#[test]
fn merge_abortado_fora_some_sem_entrar_no_historico() {
    let repo = conflitante();
    repo.exec(OperationKind::Merge { target: "feat".into() });
    repo.git(&["merge", "--abort"]);
    assert!(repo.session().refresh_external().expect("atualiza").is_none());
    assert!(matches!(repo.session().continue_in_progress(), Err(CoreError::NothingInProgress { .. })));
}
