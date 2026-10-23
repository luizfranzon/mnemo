mod support;

use mnemo_core::domain::operation::OperationKind;
use serde_json::{json, Value};
use support::{run_git, TestRepo};

fn call(repo: &TestRepo, cmd: &str, mut args: Value) -> mnemo_core::domain::error::Result<Value> {
    args["path"] = json!(repo.path().to_string_lossy());
    repo.core.invoke(cmd, args)
}

fn ok(repo: &TestRepo, cmd: &str, args: Value) -> Value {
    call(repo, cmd, args).unwrap_or_else(|e| panic!("{cmd}: {e:?}"))
}

fn paths(state: &Value) -> Vec<String> {
    state["files"].as_array().unwrap().iter().map(|f| f["path"].as_str().unwrap().to_string()).collect()
}

/// `main` com a.txt; `feature` sai dele e muda a.txt e b.txt; depois `main` muda c.txt.
fn forked() -> TestRepo {
    let repo = TestRepo::new();
    repo.git(&["switch", "-q", "-c", "feature"]);
    repo.write("a.txt", "um\nDOIS\ntres\n");
    repo.commit_all("a");
    repo.write("b.txt", "b1\n");
    repo.commit_all("b");
    repo.write("b.txt", "b2\n");
    repo.commit_all("b de novo");
    repo.git(&["switch", "-q", "main"]);
    repo.write("c.txt", "c\n");
    repo.commit_all("c na main");
    repo
}

#[test]
fn primeira_rodada_mostra_so_o_que_a_branch_introduz_em_relacao_a_base() {
    let repo = forked();
    let state = ok(&repo, "review_start", json!({ "branch": "feature", "base": "main" }));
    assert_eq!(paths(&state), ["a.txt", "b.txt"], "c.txt veio da main e fica de fora");
    let round = &state["review"]["rounds"][0];
    assert_eq!(round["number"], 1);
    assert_eq!(round["tip"], repo.rev("feature"));
    assert_eq!(round["mergeBase"], repo.rev("main~1"));
    assert_eq!(state["files"][1]["status"], "A", "b.txt nasce na branch: os commits intermediários não aparecem");
    assert_eq!(repo.git(&["config", "branch.feature.mnemoBase"]), "main");
}

#[test]
fn base_padrao_e_a_branch_principal_e_depois_a_registrada() {
    let repo = forked();
    repo.git(&["branch", "12.x", "main~1"]);
    assert_eq!(ok(&repo, "review_base", json!({ "branch": "feature" })), "main");
    ok(&repo, "review_start", json!({ "branch": "feature", "base": "12.x" }));
    assert_eq!(ok(&repo, "review_base", json!({ "branch": "feature" })), "12.x");
}

#[test]
fn proxima_rodada_mostra_so_o_que_mudou_desde_o_commit_revisado_sem_o_que_veio_da_base() {
    let repo = forked();
    ok(&repo, "review_start", json!({ "branch": "feature", "base": "main" }));
    ok(&repo, "review_conclude", json!({ "branch": "feature" }));
    repo.git(&["switch", "-q", "feature"]);
    repo.git(&["merge", "-q", "--no-edit", "main"]);
    repo.write("b.txt", "b3\n");
    repo.commit_all("b pela terceira vez");

    let state = ok(&repo, "review_start", json!({ "branch": "feature", "base": "main" }));
    assert_eq!(state["review"]["rounds"].as_array().unwrap().len(), 2);
    assert_eq!(paths(&state), ["b.txt"], "a.txt não mudou e c.txt veio do merge da main");
    let round = &state["review"]["rounds"][1];
    assert_eq!(round["from"], state["review"]["rounds"][0]["tip"]);
}

#[test]
fn rodada_aberta_continua_presa_ao_commit_e_avisa_quantos_chegaram_depois() {
    let repo = forked();
    let first = ok(&repo, "review_start", json!({ "branch": "feature", "base": "main" }));
    repo.git(&["switch", "-q", "feature"]);
    repo.write("d.txt", "d\n");
    repo.commit_all("d");
    let again = ok(&repo, "review_start", json!({ "branch": "feature", "base": "main" }));
    assert_eq!(again["review"]["rounds"].as_array().unwrap().len(), 1, "não abre Rodada nova com uma aberta");
    assert_eq!(paths(&again), paths(&first));
    assert_eq!(again["status"]["ahead"], 1);
    assert_eq!(again["status"]["rewritten"], false);
}

#[test]
fn rebase_sem_mudanca_de_conteudo_gera_rodada_vazia_e_marcador_na_ponta_nova() {
    let repo = forked();
    ok(&repo, "review_start", json!({ "branch": "feature", "base": "main" }));
    ok(&repo, "review_conclude", json!({ "branch": "feature" }));
    let reviewed = repo.rev("feature");
    repo.git(&["switch", "-q", "feature"]);
    repo.git(&["rebase", "-q", "main"]);
    repo.git(&["reflog", "expire", "--expire=now", "--all"]);
    repo.git(&["gc", "-q", "--prune=now"]);
    assert_eq!(repo.git(&["cat-file", "-t", &reviewed]), "commit", "a ref oculta segura o Commit revisado");

    let list = ok(&repo, "review_list", json!({}));
    let markers = list[0]["markers"].as_array().unwrap();
    assert_eq!(markers.len(), 1);
    assert_eq!(markers[0]["sha"], repo.rev("feature"));
    assert_eq!(markers[0]["rewritten"], true);

    let state = ok(&repo, "review_start", json!({ "branch": "feature", "base": "main" }));
    assert!(paths(&state).is_empty(), "o rebase não mudou nada da branch: {:?}", paths(&state));
}

#[test]
fn arquivo_que_volta_ao_estado_da_base_aparece_como_revertido() {
    let repo = forked();
    ok(&repo, "review_start", json!({ "branch": "feature", "base": "main" }));
    ok(&repo, "review_conclude", json!({ "branch": "feature" }));
    repo.git(&["switch", "-q", "feature"]);
    repo.write("a.txt", "um\ndois\ntres\n");
    repo.commit_all("desfaz a");
    let state = ok(&repo, "review_start", json!({ "branch": "feature", "base": "main" }));
    assert_eq!(paths(&state), ["a.txt"]);
    assert_eq!(state["files"][0]["reverted"], true);
}

#[test]
fn marca_comenta_conclui_e_trava_a_rodada_concluida() {
    let repo = forked();
    ok(&repo, "review_start", json!({ "branch": "feature", "base": "main" }));
    ok(&repo, "review_mark", json!({ "branch": "feature", "file": "a.txt", "reviewed": true }));
    let comment = json!({ "id": "c1", "file": "a.txt", "lines": { "side": "new", "start": 2, "end": 2 },
        "snippet": ["DOIS"], "body": "  por que maiúsculo?  ", "scope": "round" });
    let review = ok(&repo, "review_comment", json!({ "branch": "feature", "comment": comment }));
    assert_eq!(review["rounds"][0]["reviewed"], json!(["a.txt"]));
    assert_eq!(review["rounds"][0]["comments"][0]["body"], "por que maiúsculo?");

    let edited = json!({ "id": "c1", "file": "a.txt", "snippet": [], "body": "arquivo todo", "scope": "branch" });
    let review = ok(&repo, "review_comment", json!({ "branch": "feature", "comment": edited }));
    assert_eq!(review["rounds"][0]["comments"].as_array().unwrap().len(), 1, "mesmo id atualiza");
    assert!(review["rounds"][0]["comments"][0]["lines"].is_null());

    let empty = json!({ "id": "c2", "file": "a.txt", "body": "   ", "scope": "round" });
    assert!(call(&repo, "review_comment", json!({ "branch": "feature", "comment": empty })).is_err());

    let list = ok(&repo, "review_list", json!({}));
    assert_eq!(
        (list[0]["reviewed"].as_u64(), list[0]["files"].as_u64(), list[0]["open"].as_bool()),
        (Some(1), Some(2), Some(true))
    );

    ok(&repo, "review_conclude", json!({ "branch": "feature" }));
    assert!(call(&repo, "review_mark", json!({ "branch": "feature", "file": "b.txt" })).is_err());
    let reopened = ok(&repo, "review_open", json!({ "branch": "feature" }));
    assert!(reopened["review"]["rounds"][0]["concludedMs"].as_u64().is_some());
}

#[test]
fn encerrar_apaga_os_dados_e_as_refs_ocultas() {
    let repo = forked();
    ok(&repo, "review_start", json!({ "branch": "feature", "base": "main" }));
    ok(&repo, "review_conclude", json!({ "branch": "feature" }));
    assert!(!repo.git(&["for-each-ref", "refs/mnemo/review"]).is_empty());
    ok(&repo, "review_end", json!({ "branch": "feature" }));
    assert!(repo.git(&["for-each-ref", "refs/mnemo/review"]).is_empty());
    assert_eq!(ok(&repo, "review_list", json!({})), json!([]));
    assert!(call(&repo, "review_open", json!({ "branch": "feature" })).is_err());
}

#[test]
fn recusa_branch_sem_nada_novo_e_nome_invalido() {
    let repo = forked();
    repo.git(&["branch", "parada", "main"]);
    let err = call(&repo, "review_start", json!({ "branch": "parada", "base": "main" })).unwrap_err();
    assert!(err.to_string().contains("nada"), "{err}");
    assert!(call(&repo, "review_start", json!({ "branch": "--output=x", "base": "main" })).is_err());
}

#[test]
fn diff_entre_dois_commits_e_recusa_sha_invalido() {
    let repo = forked();
    let (from, to) = (repo.rev("main~1"), repo.rev("feature"));
    let diff =
        ok(&repo, "file_diff", json!({ "file": "a.txt", "source": { "kind": "range", "from": from, "to": to } }));
    assert_eq!((diff["added"].as_u64(), diff["removed"].as_u64()), (Some(1), Some(1)));
    let bad = json!({ "file": "a.txt", "source": { "kind": "range", "from": "--output=x", "to": to } });
    assert!(call(&repo, "file_diff", bad).is_err());
}

#[test]
fn busca_a_branch_e_avanca_a_local_que_nao_e_a_atual_ate_a_remota() {
    let repo = TestRepo::new();
    let _remote = repo.with_remote();
    repo.git(&["switch", "-q", "-c", "feature"]);
    repo.write("b.txt", "b\n");
    repo.commit_all("b");
    repo.git(&["push", "-q", "-u", "origin", "feature"]);
    repo.git(&["switch", "-q", "main"]);
    // outro clone empurra mais um commit na feature
    let other = tempfile::TempDir::new().unwrap();
    let url = repo.git(&["remote", "get-url", "origin"]);
    run_git(other.path(), &["clone", "-q", "-b", "feature", &url, "."]);
    for (k, v) in [("user.name", "Outro"), ("user.email", "outro@example.com"), ("commit.gpgsign", "false")] {
        run_git(other.path(), &["config", k, v]);
    }
    std::fs::write(other.path().join("b.txt"), "b2\n").unwrap();
    run_git(other.path(), &["commit", "-q", "-am", "b2"]);
    run_git(other.path(), &["push", "-q"]);
    let pushed = run_git(other.path(), &["rev-parse", "HEAD"]);

    assert_eq!(ok(&repo, "review_fetch", json!({ "branch": "feature" })), Value::Null);
    assert_eq!(repo.rev("origin/feature"), pushed);
    let before = repo.rev("feature");
    repo.exec(OperationKind::FastForward { branch: "feature".into() });
    assert_eq!(repo.rev("feature"), pushed);
    assert_eq!(repo.branch(), "main", "sem checkout");
    repo.session().undo().expect("desfazer");
    assert_eq!(repo.rev("feature"), before);
}
