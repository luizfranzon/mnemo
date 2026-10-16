mod support;
use mnemo_core::domain::operation::{OperationKind, ResetMode};
use support::TestRepo;

/// Compara HEAD, refs e index antes/depois.
fn snapshot(repo: &TestRepo) -> (String, String, String) {
    (
        repo.git(&["symbolic-ref", "-q", "--short", "HEAD"]),
        repo.git(&["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads", "refs/tags"]),
        repo.git(&["ls-files", "-s"]),
    )
}

fn undo_redo_roundtrip(repo: &TestRepo, kind: OperationKind) {
    let before = snapshot(repo);
    repo.exec(kind);
    let after = snapshot(repo);
    assert_ne!(before, after, "a operação precisa mudar algo");
    let s = repo.session();
    s.undo().expect("desfaz");
    assert_eq!(snapshot(repo), before, "desfazer volta ao estado antes");
    s.redo().expect("refaz");
    assert_eq!(snapshot(repo), after, "refazer volta ao estado depois");
}

#[test]
fn commit_desfeito_volta_a_branch_com_as_mudancas_no_stage() {
    let repo = TestRepo::new();
    let first = repo.head();
    repo.write("b.txt", "b");
    repo.git(&["add", "b.txt"]);
    undo_redo_roundtrip(
        &repo,
        OperationKind::Commit {
            message: "novo".into(),
            amend: false,
            allow_empty: false,
            sign: false,
            no_verify: false,
        },
    );

    repo.session().undo().expect("desfaz de novo");
    assert_eq!(repo.head(), first);
    assert_eq!(repo.status(), "A  b.txt", "mudança volta para o stage");
}

#[test]
fn amend_desfeito_recupera_o_commit_original() {
    let repo = TestRepo::new();
    repo.write("b.txt", "b");
    let original = repo.commit_all("original");
    repo.write("b.txt", "b2");
    repo.git(&["add", "b.txt"]);
    undo_redo_roundtrip(
        &repo,
        OperationKind::Commit {
            message: "emendado".into(),
            amend: true,
            allow_empty: false,
            sign: false,
            no_verify: false,
        },
    );

    repo.session().undo().expect("desfaz");
    assert_eq!(repo.head(), original);
}

#[test]
fn commit_inicial_de_repositorio_vazio_e_desfeito() {
    let repo = TestRepo::empty();
    repo.write("a.txt", "a");
    repo.git(&["add", "a.txt"]);
    repo.exec(OperationKind::Commit {
        message: "primeiro".into(),
        amend: false,
        allow_empty: false,
        sign: false,
        no_verify: false,
    });
    assert!(!repo.git(&["rev-parse", "--verify", "-q", "HEAD"]).is_empty());
    repo.session().undo().expect("desfaz");
    assert_eq!(repo.git(&["status", "--porcelain"]), "A  a.txt");
    assert_eq!(repo.git(&["branch", "--show-current"]), "main");
}

#[test]
fn reset_soft_e_mixed_voltam_para_onde_estavam() {
    let repo = TestRepo::new();
    let first = repo.head();
    repo.write("b.txt", "b");
    repo.commit_all("segundo");
    repo.write("c.txt", "c");
    repo.git(&["add", "c.txt"]);

    undo_redo_roundtrip(&repo, OperationKind::Reset { target: first.clone(), mode: ResetMode::Soft });
    repo.session().undo().expect("desfaz");
    undo_redo_roundtrip(&repo, OperationKind::Reset { target: first, mode: ResetMode::Mixed });
}

#[test]
fn criar_renomear_e_excluir_branch_local() {
    let repo = TestRepo::new();
    undo_redo_roundtrip(&repo, OperationKind::BranchCreate { name: "nova".into(), start: None, checkout: false });
    repo.session().undo().expect("limpa");
    repo.session().undo_state();

    repo.git(&["branch", "velha"]);
    undo_redo_roundtrip(&repo, OperationKind::BranchRename { from: "velha".into(), to: "renomeada".into() });
}

#[test]
fn renomear_a_branch_atual_e_desfeito() {
    let repo = TestRepo::new();
    undo_redo_roundtrip(&repo, OperationKind::BranchRename { from: "main".into(), to: "principal".into() });
    repo.session().undo().expect("desfaz");
    assert_eq!(repo.branch(), "main");
}

#[test]
fn excluir_branch_restaura_inclusive_o_sha() {
    let repo = TestRepo::new();
    repo.git(&["checkout", "-q", "-b", "extra"]);
    repo.write("e.txt", "e");
    let sha = repo.commit_all("extra");
    repo.git(&["checkout", "-q", "main"]);

    repo.exec(OperationKind::BranchDelete { name: "extra".into(), force: true });
    assert!(repo.git(&["branch", "--list", "extra"]).is_empty());
    repo.session().undo().expect("desfaz");
    assert_eq!(repo.rev("extra"), sha);
}

#[test]
fn criar_branch_com_checkout_e_desfeito() {
    let repo = TestRepo::new();
    undo_redo_roundtrip(&repo, OperationKind::BranchCreate { name: "feat".into(), start: None, checkout: true });
    repo.session().undo().expect("desfaz");
    assert_eq!(repo.branch(), "main");
    assert!(repo.git(&["branch", "--list", "feat"]).is_empty());
}

#[test]
fn criar_e_excluir_tag_local() {
    let repo = TestRepo::new();
    undo_redo_roundtrip(&repo, OperationKind::TagCreate { name: "v1".into(), target: None, message: None });
    repo.session().undo().expect("limpa");

    repo.git(&["tag", "v2"]);
    undo_redo_roundtrip(&repo, OperationKind::TagDelete { name: "v2".into() });
}

#[test]
fn tag_anotada_e_desfeita() {
    let repo = TestRepo::new();
    undo_redo_roundtrip(
        &repo,
        OperationKind::TagCreate { name: "v3".into(), target: None, message: Some("release".into()) },
    );
}

#[test]
fn commit_sem_verificar_pula_hook_que_falha() {
    let repo = TestRepo::new();
    repo.write("a.txt", "1\n");
    let hook = repo.path().join(".git/hooks/pre-commit");
    std::fs::write(&hook, "#!/bin/sh\nexit 1\n").unwrap();
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755)).unwrap();
    repo.git(&["add", "a.txt"]);
    let r = repo.session().execute(OperationKind::Commit {
        message: "x".into(),
        amend: false,
        allow_empty: false,
        sign: false,
        no_verify: false,
    });
    assert!(r.is_err());
    repo.session()
        .execute(OperationKind::Commit {
            message: "x".into(),
            amend: false,
            allow_empty: false,
            sign: false,
            no_verify: true,
        })
        .unwrap();
}
