mod support;

use mnemo_core::application::session::ExecuteResult;
use mnemo_core::domain::operation::OperationKind;
use serde_json::{json, Value};
use support::TestRepo;

fn call(repo: &TestRepo, cmd: &str, extra: Value) -> mnemo_core::domain::error::Result<Value> {
    let mut args = json!({ "path": repo.path().to_string_lossy() });
    args.as_object_mut().unwrap().extend(extra.as_object().unwrap().clone());
    repo.core.invoke(cmd, args)
}

fn ten(edits: &[(usize, &str)]) -> String {
    (1..=10).map(|n| format!("{}\n", edits.iter().find(|(i, _)| *i == n).map_or(n.to_string(), |(_, t)| t.to_string()))).collect()
}

/// `main` e `feature` mudam a linha 2 de `a.txt` de jeitos diferentes; o merge para em conflito.
fn conflicted(main: &str, feature: &str) -> TestRepo {
    let repo = TestRepo::new();
    repo.write("a.txt", &ten(&[]));
    repo.commit_all("base");
    repo.git(&["checkout", "-q", "-b", "feature"]);
    repo.write("a.txt", &feature);
    repo.commit_all("feature");
    repo.git(&["checkout", "-q", "main"]);
    repo.write("a.txt", &main);
    repo.commit_all("main");
    let r = repo.exec(OperationKind::Merge { target: "feature".into() });
    assert!(matches!(r, ExecuteResult::Conflict { .. }));
    repo
}

#[test]
fn lista_arquivo_em_conflito_com_o_tipo() {
    let repo = conflicted(&ten(&[(2, "main")]), &ten(&[(2, "feat")]));
    let list = call(&repo, "conflict_list", json!({})).unwrap();
    assert_eq!(list[0]["path"], "a.txt");
    assert_eq!(list[0]["kind"], "both");
    assert_eq!(list[0]["binary"], false);
}

#[test]
fn devolve_trechos_com_atual_entrando_e_base() {
    let repo = conflicted(&ten(&[(2, "main")]), &ten(&[(2, "feat"), (9, "feat9")]));
    let doc = call(&repo, "conflict_file", json!({ "file": "a.txt" })).unwrap();
    let segs = doc["segments"].as_array().unwrap();
    let c = segs.iter().find(|s| s["kind"] == "conflict").unwrap();
    assert_eq!(c["ours"], json!(["main"]));
    assert_eq!(c["theirs"], json!(["feat"]));
    assert_eq!(c["base"], json!(["2"]));
    assert_eq!(c["auto"], false);
    // a mudança da linha 9 não conflita: o git já aplicou
    assert!(segs.iter().any(|s| s["kind"] == "text" && s["lines"].as_array().unwrap().contains(&json!("feat9"))));
    assert_eq!(doc["finalNewline"], true);
}

#[test]
fn marca_como_automatico_conflito_que_so_difere_em_espaco() {
    let repo = conflicted(&ten(&[(2, "a  b")]), &ten(&[(2, "a b")]));
    let doc = call(&repo, "conflict_file", json!({ "file": "a.txt" })).unwrap();
    let c = doc["segments"].as_array().unwrap().iter().find(|s| s["kind"] == "conflict").unwrap().clone();
    assert_eq!(c["auto"], true);
}

#[test]
fn zdiff3_move_linhas_comuns_para_fora_do_conflito() {
    // as duas lados mantêm "x" depois da linha alterada: não faz parte do conflito
    let repo = conflicted(&ten(&[(2, "main\nx")]), &ten(&[(2, "feat\nx")]));
    let doc = call(&repo, "conflict_file", json!({ "file": "a.txt" })).unwrap();
    let c = doc["segments"].as_array().unwrap().iter().find(|s| s["kind"] == "conflict").unwrap().clone();
    assert_eq!(c["ours"], json!(["main"]));
}

#[test]
fn salvar_grava_o_resultado_e_marca_como_resolvido() {
    let repo = conflicted(&ten(&[(2, "main")]), &ten(&[(2, "feat")]));
    call(&repo, "conflict_save", json!({ "file": "a.txt", "content": ten(&[(2, "main feat")]) })).unwrap();
    assert_eq!(repo.read("a.txt"), ten(&[(2, "main feat")]));
    assert!(call(&repo, "conflict_list", json!({})).unwrap().as_array().unwrap().is_empty());
    let r = repo.session().continue_in_progress(None).unwrap();
    assert!(matches!(r, ExecuteResult::Completed { .. }), "{r:?}");
    assert_eq!(repo.git(&["show", "HEAD:a.txt"]), ten(&[(2, "main feat")]).trim_end());
}

#[test]
fn usar_lado_pega_a_versao_inteira_do_lado() {
    let repo = conflicted(&ten(&[(2, "main")]), &ten(&[(2, "feat")]));
    call(&repo, "conflict_take", json!({ "file": "a.txt", "choice": "theirs" })).unwrap();
    assert_eq!(repo.read("a.txt"), ten(&[(2, "feat")]));
    assert!(call(&repo, "conflict_list", json!({})).unwrap().as_array().unwrap().is_empty());
}

fn deleted_by_us() -> TestRepo {
    let repo = TestRepo::new();
    repo.git(&["checkout", "-q", "-b", "feature"]);
    repo.write("a.txt", "mudou\n");
    repo.commit_all("modifica");
    repo.git(&["checkout", "-q", "main"]);
    repo.git(&["rm", "-q", "a.txt"]);
    repo.commit_all("apaga");
    repo.exec(OperationKind::Merge { target: "feature".into() });
    repo
}

#[test]
fn apagado_de_um_lado_e_modificado_do_outro_oferece_manter_base_ou_apagar() {
    let repo = deleted_by_us();
    let list = call(&repo, "conflict_list", json!({})).unwrap();
    assert_eq!(list[0]["kind"], "deletedByUs");
    // lado que apagou não tem versão para manter
    assert!(call(&repo, "conflict_take", json!({ "file": "a.txt", "choice": "ours" })).is_err());
    call(&repo, "conflict_take", json!({ "file": "a.txt", "choice": "base" })).unwrap();
    assert_eq!(repo.read("a.txt"), "um\ndois\ntres\n");
    let repo = deleted_by_us();
    call(&repo, "conflict_take", json!({ "file": "a.txt", "choice": "delete" })).unwrap();
    assert!(!repo.exists("a.txt"));
    assert!(call(&repo, "conflict_list", json!({})).unwrap().as_array().unwrap().is_empty());
}

#[test]
fn reabrir_arquivo_resolvido_volta_a_ser_conflito() {
    let repo = conflicted(&ten(&[(2, "main")]), &ten(&[(2, "feat")]));
    call(&repo, "conflict_take", json!({ "file": "a.txt", "choice": "ours" })).unwrap();
    call(&repo, "conflict_reopen", json!({ "files": ["a.txt"] })).unwrap();
    assert_eq!(call(&repo, "conflict_list", json!({})).unwrap().as_array().unwrap().len(), 1);
}

#[test]
fn binario_nao_tem_trechos_e_aceita_so_um_lado() {
    let repo = TestRepo::new();
    std::fs::write(repo.path().join("b.bin"), [0u8, 1, 2]).unwrap();
    repo.commit_all("bin");
    repo.git(&["checkout", "-q", "-b", "feature"]);
    std::fs::write(repo.path().join("b.bin"), [0u8, 9, 9]).unwrap();
    repo.commit_all("feat");
    repo.git(&["checkout", "-q", "main"]);
    std::fs::write(repo.path().join("b.bin"), [0u8, 7, 7]).unwrap();
    repo.commit_all("main");
    repo.exec(OperationKind::Merge { target: "feature".into() });
    let list = call(&repo, "conflict_list", json!({})).unwrap();
    assert_eq!(list[0]["binary"], true);
    assert!(call(&repo, "conflict_file", json!({ "file": "b.bin" })).is_err());
    call(&repo, "conflict_take", json!({ "file": "b.bin", "choice": "ours" })).unwrap();
    assert_eq!(std::fs::read(repo.path().join("b.bin")).unwrap(), vec![0u8, 7, 7]);
}

#[test]
fn rejeita_arquivo_que_nao_esta_em_conflito() {
    let repo = conflicted(&ten(&[(2, "main")]), &ten(&[(2, "feat")]));
    assert!(call(&repo, "conflict_save", json!({ "file": "../x", "content": "x" })).is_err());
}

#[test]
fn ferramenta_externa_sem_configuracao_da_erro_claro() {
    let repo = conflicted(&ten(&[(2, "main")]), &ten(&[(2, "feat")]));
    let e = call(&repo, "conflict_mergetool", json!({ "file": "a.txt" })).unwrap_err();
    assert!(e.to_string().contains("ferramenta de merge"), "{e}");
}

#[test]
fn gravar_com_marcadores_nao_marca_o_arquivo_como_resolvido() {
    let repo = conflicted(&ten(&[(2, "main")]), &ten(&[(2, "feat")]));
    call(&repo, "conflict_save", json!({ "file": "a.txt", "content": "<<<<<<< x\n", "resolve": false })).unwrap();
    assert_eq!(repo.read("a.txt"), "<<<<<<< x\n");
    assert_eq!(call(&repo, "conflict_list", json!({})).unwrap().as_array().unwrap().len(), 1);
}

#[test]
fn devolve_trechos_de_arquivo_com_fim_de_linha_crlf() {
    let crlf = |edit: &str| ten(&[(2, edit)]).replace('\n', "\r\n");
    let repo = conflicted(&crlf("main"), &crlf("feat"));
    let doc = call(&repo, "conflict_file", json!({ "file": "a.txt" })).unwrap();
    let c = doc["segments"].as_array().unwrap().iter().find(|s| s["kind"] == "conflict").unwrap().clone();
    assert_eq!(c["ours"], json!(["main\r"]));
    assert_eq!(c["theirs"], json!(["feat\r"]));
}

#[test]
fn rebase_em_conflito_lista_arquivo_e_continua_depois_de_salvar() {
    let repo = TestRepo::new();
    repo.write("a.txt", &ten(&[]));
    repo.commit_all("base");
    repo.git(&["checkout", "-q", "-b", "feature"]);
    repo.write("a.txt", &ten(&[(2, "feat")]));
    repo.commit_all("feature");
    repo.git(&["checkout", "-q", "main"]);
    repo.write("a.txt", &ten(&[(2, "main")]));
    repo.commit_all("main");
    repo.git(&["checkout", "-q", "feature"]);
    let r = repo.exec(OperationKind::Rebase { onto: "main".into() });
    assert!(matches!(r, ExecuteResult::Conflict { .. }));
    let doc = call(&repo, "conflict_file", json!({ "file": "a.txt" })).unwrap();
    let c = doc["segments"].as_array().unwrap().iter().find(|s| s["kind"] == "conflict").unwrap().clone();
    // no rebase o Atual é a base do rebase (main) e o Entrando é o commit reaplicado
    assert_eq!(c["ours"], json!(["main"]));
    assert_eq!(c["theirs"], json!(["feat"]));
    call(&repo, "conflict_save", json!({ "file": "a.txt", "content": ten(&[(2, "ok")]) })).unwrap();
    let r = repo.session().continue_in_progress(None).unwrap();
    assert!(matches!(r, ExecuteResult::Completed { .. }), "{r:?}");
}

const MARKED: &str = "um\n<<<<<<< Atual\nmain\n=======\nfeat\n>>>>>>> Entrando\n";

#[test]
fn salvar_resolvendo_com_marcadores_e_recusado() {
    let repo = conflicted(&ten(&[(2, "main")]), &ten(&[(2, "feat")]));
    let e = call(&repo, "conflict_save", json!({ "file": "a.txt", "content": MARKED })).unwrap_err();
    assert!(e.to_string().contains("marcadores"), "{e}");
    assert_eq!(call(&repo, "conflict_list", json!({})).unwrap().as_array().unwrap().len(), 1);
}

#[test]
fn marcar_resolvido_arquivo_com_marcadores_falha_e_nao_prepara() {
    let repo = conflicted(&ten(&[(2, "main")]), &ten(&[(2, "feat")]));
    call(&repo, "conflict_save", json!({ "file": "a.txt", "content": MARKED, "resolve": false })).unwrap();
    for paths in [json!(["a.txt"]), json!([])] {
        let e = call(&repo, "stage", json!({ "paths": paths })).unwrap_err();
        assert!(e.to_string().contains("a.txt"), "{e}");
        assert_eq!(call(&repo, "conflict_list", json!({})).unwrap().as_array().unwrap().len(), 1);
    }
}

#[test]
fn marcar_todos_prepara_os_limpos_e_recusa_so_os_com_marcadores() {
    let repo = conflicted(&ten(&[(2, "main")]), &ten(&[(2, "feat")]));
    call(&repo, "conflict_save", json!({ "file": "a.txt", "content": MARKED, "resolve": false })).unwrap();
    repo.write("novo.txt", "x\n");
    assert!(call(&repo, "stage", json!({ "paths": [] })).is_err());
    assert!(repo.git(&["diff", "--cached", "--name-only"]).contains("novo.txt"));
    assert_eq!(call(&repo, "conflict_list", json!({})).unwrap().as_array().unwrap().len(), 1);
}

#[test]
fn devolve_commit_e_branch_dos_dois_lados_no_merge() {
    let repo = conflicted(&ten(&[(2, "main")]), &ten(&[(2, "feat")]));
    let doc = call(&repo, "conflict_file", json!({ "file": "a.txt" })).unwrap();
    assert_eq!(doc["oursLabel"]["name"], "main");
    assert_eq!(doc["theirsLabel"]["name"], "feature");
    assert_eq!(doc["theirsLabel"]["sha"].as_str().unwrap().len(), 7);
}

#[test]
fn merge_em_conflito_grava_mensagem_merge_branch_na_atual() {
    let repo = conflicted(&ten(&[(2, "main")]), &ten(&[(2, "feat")]));
    let msg = std::fs::read_to_string(repo.path().join(".git/MERGE_MSG")).unwrap();
    assert!(msg.starts_with("Merge feature na main"), "{msg}");
}

#[test]
fn continuar_merge_com_mensagem_usa_a_mensagem_no_commit() {
    let repo = conflicted(&ten(&[(2, "main")]), &ten(&[(2, "feat")]));
    call(&repo, "conflict_save", json!({ "file": "a.txt", "content": ten(&[(2, "main feat")]) })).unwrap();
    repo.session().continue_in_progress(Some("Mensagem editada")).unwrap();
    assert_eq!(repo.git(&["log", "-1", "--format=%s"]), "Mensagem editada");
}

#[test]
fn continuar_merge_com_hook_que_falha_devolve_erro() {
    let repo = conflicted(&ten(&[(2, "main")]), &ten(&[(2, "feat")]));
    call(&repo, "conflict_save", json!({ "file": "a.txt", "content": ten(&[(2, "main feat")]) })).unwrap();
    let hook = repo.path().join(".git/hooks/commit-msg");
    std::fs::write(&hook, "#!/bin/sh\necho hook barrou >&2\nexit 1\n").unwrap();
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755)).unwrap();
    let err = repo.session().continue_in_progress(None).unwrap_err();
    assert!(err.to_string().contains("hook barrou"), "{err}");
}
