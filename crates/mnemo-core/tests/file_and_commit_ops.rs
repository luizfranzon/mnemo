mod support;
use mnemo_core::domain::operation::OperationKind;
use mnemo_core::CoreError;
use support::TestRepo;

#[test]
fn restaurar_versao_do_commit_e_desfazer() {
    let repo = TestRepo::new();
    repo.write("r.txt", "v1\n");
    let v1 = repo.commit_all("v1");
    repo.write("r.txt", "v2\n");
    repo.commit_all("v2");
    repo.write("r.txt", "v3 sem commit\n");

    repo.exec(OperationKind::RestoreFile { commit: v1, path: "r.txt".into() });
    assert_eq!(repo.read("r.txt"), "v1\n");
    repo.session().undo().expect("desfaz");
    assert_eq!(repo.read("r.txt"), "v3 sem commit\n");
    repo.session().redo().expect("refaz");
    assert_eq!(repo.read("r.txt"), "v1\n");
}

#[test]
fn excluir_arquivo_rastreado_e_nao_rastreado() {
    let repo = TestRepo::new();
    repo.write("t.txt", "t\n");
    repo.commit_all("t");
    repo.write("novo.txt", "n\n");

    repo.exec(OperationKind::DeleteFile { path: "t.txt".into() });
    assert!(!repo.exists("t.txt"));
    repo.exec(OperationKind::DeleteFile { path: "novo.txt".into() });
    assert!(!repo.exists("novo.txt"));

    repo.session().undo().expect("desfaz");
    assert_eq!(repo.read("novo.txt"), "n\n");
    repo.session().undo().expect("desfaz");
    assert_eq!(repo.read("t.txt"), "t\n");
}

#[test]
fn caminho_fora_do_repositorio_e_recusado() {
    let repo = TestRepo::new();
    for path in ["../fora.txt", "/etc/passwd", ""] {
        let err = repo.session().execute(OperationKind::DeleteFile { path: path.into() }).unwrap_err();
        assert!(matches!(err, CoreError::InvalidInput { .. }), "{path}: {err:?}");
    }
}

#[test]
fn editar_mensagem_do_head_sem_levar_o_que_esta_preparado() {
    let repo = TestRepo::new();
    repo.write("a2.txt", "a\n");
    repo.commit_all("antiga");
    let tree = repo.rev("HEAD^{tree}");
    repo.write("preparado.txt", "p\n");
    repo.git(&["add", "preparado.txt"]);

    repo.exec(OperationKind::Reword { message: "nova mensagem".into() });
    assert_eq!(repo.git(&["log", "-1", "--format=%s"]).trim(), "nova mensagem");
    assert_eq!(repo.rev("HEAD^{tree}"), tree);
    assert!(repo.status().contains("preparado.txt"));
}
