mod support;

use mnemo_core::domain::operation::OperationKind;
use serde_json::json;
use support::TestRepo;

fn stash_files(repo: &TestRepo, index: usize) -> Vec<String> {
    let v = repo.core.invoke("stash_files", json!({ "path": repo.path().to_string_lossy(), "index": index })).expect("stash_files");
    v.as_array().unwrap().iter().map(|f| format!("{}{}", f["status"].as_str().unwrap(), f["path"].as_str().unwrap())).collect()
}

fn partial(paths: &[&str]) -> OperationKind {
    OperationKind::StashCreate { message: None, include_untracked: true, paths: paths.iter().map(|p| p.to_string()).collect() }
}

#[test]
fn stash_parcial_guarda_so_os_arquivos_escolhidos_e_desfaz() {
    let repo = TestRepo::new();
    repo.write("b.txt", "b\n");
    repo.commit_all("b");
    repo.write("a.txt", "mudou a\n");
    repo.write("b.txt", "mudou b\n");
    repo.write("pasta/novo.txt", "novo\n");

    repo.exec(partial(&["a.txt", "pasta"]));
    assert_eq!(repo.read("a.txt"), "um\ndois\ntres\n");
    assert!(!repo.exists("pasta/novo.txt"));
    assert_eq!(repo.read("b.txt"), "mudou b\n", "o que não foi escolhido fica no WIP");
    assert_eq!(stash_files(&repo, 0), ["Ma.txt", "Apasta/novo.txt"]);

    repo.session().undo().expect("desfazer");
    assert_eq!(repo.read("a.txt"), "mudou a\n");
    assert_eq!(repo.read("pasta/novo.txt"), "novo\n");
    assert!(repo.git(&["stash", "list"]).is_empty());
}

#[test]
fn arquivo_em_conflito_fica_de_fora_do_stash_com_o_motivo() {
    let repo = TestRepo::new();
    // conflito sem merge em andamento: o apply de um stash que bate com o HEAD
    repo.write("a.txt", "no stash\n");
    repo.git(&["stash", "push", "-q"]);
    repo.write("a.txt", "no head\n");
    repo.commit_all("head");
    let _ = std::process::Command::new("git").current_dir(repo.path()).args(["stash", "apply", "-q"]).output();
    assert!(repo.status().contains("UU a.txt"), "{}", repo.status());
    repo.write("solto.txt", "solto\n");

    for paths in [&["a.txt"][..], &["a.txt", "solto.txt"], &["solto.txt"]] {
        let err = repo.session().execute(partial(paths)).unwrap_err();
        assert!(matches!(&err, mnemo_core::CoreError::StashConflicted { paths } if paths == &["a.txt"]), "{err:?}");
        assert!(err.to_string().contains("a.txt") && err.to_string().contains("conflito"));
    }
    assert!(repo.exists("solto.txt"), "nada foi guardado");
}

#[test]
fn aplicar_parte_do_stash_traz_so_os_arquivos_escolhidos_e_desfaz() {
    let repo = TestRepo::new();
    repo.write("b.txt", "b\n");
    repo.commit_all("b");
    repo.write("a.txt", "stash a\n");
    repo.write("b.txt", "stash b\n");
    repo.write("pasta/novo.txt", "novo\n");
    repo.git(&["stash", "push", "-q", "-u"]);
    let listed = repo.git(&["stash", "list"]);

    repo.exec(OperationKind::StashApplyPaths { index: 0, paths: vec!["a.txt".into(), "pasta".into()] });
    assert_eq!(repo.read("a.txt"), "stash a\n");
    assert_eq!(repo.read("pasta/novo.txt"), "novo\n");
    assert_eq!(repo.read("b.txt"), "b\n");
    assert_eq!(repo.git(&["stash", "list"]), listed, "o stash continua lá");
    assert!(repo.git(&["diff", "--cached", "--name-only"]).is_empty(), "não prepara nada");

    repo.session().undo().expect("desfazer");
    assert_eq!(repo.read("a.txt"), "um\ndois\ntres\n");
    assert!(!repo.exists("pasta/novo.txt"));
}

#[test]
fn descartar_pasta_e_desfazer() {
    let repo = TestRepo::new();
    repo.write("pasta/x.txt", "x\n");
    repo.commit_all("pasta");
    repo.write("pasta/x.txt", "x mudou\n");
    repo.write("pasta/sub/novo.txt", "novo\n");
    repo.write("a.txt", "fora\n");

    repo.exec(OperationKind::Discard { paths: vec!["pasta".into()] });
    assert_eq!(repo.read("pasta/x.txt"), "x\n");
    assert!(!repo.exists("pasta/sub/novo.txt"));
    assert_eq!(repo.read("a.txt"), "fora\n", "fora da pasta nada muda");

    repo.session().undo().expect("desfazer");
    assert_eq!(repo.read("pasta/x.txt"), "x mudou\n");
    assert_eq!(repo.read("pasta/sub/novo.txt"), "novo\n");
}

#[test]
fn ignorar_acrescenta_ao_gitignore_sem_duplicar() {
    let repo = TestRepo::new();
    repo.write(".gitignore", "target/");
    repo.write("x.log", "l\n");
    let ignore = |pattern: &str| {
        repo.core.invoke("ignore", json!({ "path": repo.path().to_string_lossy(), "pattern": pattern })).expect("ignore");
    };
    ignore("*.log");
    ignore("*.log");
    assert_eq!(repo.read(".gitignore"), "target/\n*.log\n");
    assert!(!repo.status().contains("x.log"));
}
