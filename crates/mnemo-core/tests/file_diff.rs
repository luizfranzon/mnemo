mod support;

use serde_json::{json, Value};
use support::TestRepo;

fn diff(repo: &TestRepo, file: &str, source: Value) -> Value {
    diff_full(repo, file, source, false)
}

fn diff_full(repo: &TestRepo, file: &str, source: Value, full: bool) -> Value {
    repo.core
        .invoke("file_diff", json!({ "path": repo.path().to_string_lossy(), "file": file, "source": source, "full": full }))
        .expect("file_diff")
}

/// Linhas no formato `+3 texto`, `-2 texto`, ` 1 texto` (número do lado que existe).
fn lines(d: &Value) -> Vec<String> {
    d["lines"]
        .as_array()
        .unwrap()
        .iter()
        .map(|l| {
            let (mark, n) = match l["kind"].as_str().unwrap() {
                "add" => ('+', &l["new"]),
                "del" => ('-', &l["old"]),
                _ => (' ', &l["new"]),
            };
            format!("{mark}{} {}", n, l["text"].as_str().unwrap())
        })
        .collect()
}

#[test]
fn adicao_no_meio_vira_um_trecho_com_numeros_dos_dois_lados() {
    let repo = TestRepo::new();
    repo.write("a.txt", "um\ndois\nnovo\ntres\n");
    let d = diff(&repo, "a.txt", json!({ "kind": "unstaged" }));
    assert_eq!(d["binary"], false);
    assert_eq!(d["encoding"], "UTF-8");
    assert_eq!((d["added"].as_u64(), d["removed"].as_u64()), (Some(1), Some(0)));
    assert_eq!(d["hunks"].as_array().unwrap().len(), 1);
    assert_eq!(d["hunks"][0]["header"], "@@ -1,3 +1,4 @@");
    assert_eq!(lines(&d), [" 1 um", " 2 dois", "+3 novo", " 4 tres"]);
    assert_eq!(d["lines"][3]["old"], 3, "contexto depois da adição tem o número antigo deslocado");
}

#[test]
fn remocao_preparada_compara_head_com_index() {
    let repo = TestRepo::new();
    repo.write("a.txt", "um\ntres\n");
    repo.git(&["add", "a.txt"]);
    repo.write("a.txt", "outro\n");
    let d = diff(&repo, "a.txt", json!({ "kind": "staged" }));
    assert_eq!(lines(&d), [" 1 um", "-2 dois", " 2 tres"]);
}

#[test]
fn arquivo_novo_nao_rastreado_aparece_inteiro_como_adicao() {
    let repo = TestRepo::new();
    repo.write("dir/novo.txt", "x\ny\n");
    let d = diff(&repo, "dir/novo.txt", json!({ "kind": "unstaged" }));
    assert_eq!(lines(&d), ["+1 x", "+2 y"]);
    assert_eq!(d["hunks"][0]["oldStart"], 0);
}

#[test]
fn renomeacao_no_commit_traz_o_caminho_antigo() {
    let repo = TestRepo::new();
    repo.git(&["mv", "a.txt", "b.txt"]);
    let sha = repo.commit_all("renomeia");
    let d = diff(&repo, "b.txt", json!({ "kind": "commit", "sha": sha, "oldPath": "a.txt" }));
    assert_eq!(d["oldPath"], "a.txt");
    assert!(d["hunks"].as_array().unwrap().is_empty());
}

#[test]
fn sem_quebra_final_marca_a_linha() {
    let repo = TestRepo::new();
    repo.write("a.txt", "um\ndois\ntres");
    let d = diff(&repo, "a.txt", json!({ "kind": "unstaged" }));
    assert_eq!(lines(&d), [" 1 um", " 2 dois", "-3 tres", "+3 tres"]);
    assert_eq!(d["lines"][2]["noNewline"], false);
    assert_eq!(d["lines"][3]["noNewline"], true);
}

#[test]
fn binario_nao_traz_linhas() {
    let repo = TestRepo::new();
    std::fs::write(repo.path().join("img.bin"), [0u8, 1, 2, 3, 0, 255]).unwrap();
    let sha = repo.commit_all("binario");
    let d = diff(&repo, "img.bin", json!({ "kind": "commit", "sha": sha }));
    assert_eq!(d["binary"], true);
    assert!(d["lines"].as_array().unwrap().is_empty());
}

#[test]
fn unicode_no_conteudo_e_no_caminho() {
    let repo = TestRepo::new();
    repo.write("ação/café.txt", "olá\n");
    repo.commit_all("unicode");
    repo.write("ação/café.txt", "olá 🌍\n");
    let d = diff(&repo, "ação/café.txt", json!({ "kind": "unstaged" }));
    assert_eq!(d["encoding"], "UTF-8");
    assert_eq!(lines(&d), ["-1 olá", "+1 olá 🌍"]);
}

#[test]
fn arquivo_inteiro_preenche_o_que_fica_entre_os_trechos() {
    let repo = TestRepo::new();
    let body: String = (1..=20).map(|n| format!("l{n}\n")).collect();
    repo.write("a.txt", &body);
    repo.commit_all("vinte");
    repo.write("a.txt", &body.replace("l2\n", "L2\n").replace("l18\n", "L18\n"));
    let hunks = diff(&repo, "a.txt", json!({ "kind": "unstaged" }));
    assert_eq!(hunks["hunks"].as_array().unwrap().len(), 2);
    let full = diff_full(&repo, "a.txt", json!({ "kind": "unstaged" }), true);
    assert_eq!(full["hunks"].as_array().unwrap().len(), 2, "os trechos continuam os mesmos");
    let l = lines(&full);
    assert_eq!(l.len(), 22);
    assert_eq!(l[10], " 10 l10");
    assert!(full["lines"][10]["hunk"].is_null(), "linha entre trechos não pertence a trecho");
    assert_eq!(full["hunks"][1]["start"], full["lines"].as_array().unwrap().iter().position(|x| x["hunk"] == 1).unwrap());
}
