mod support;

use serde_json::{json, Value};
use support::TestRepo;

fn diff(repo: &TestRepo, file: &str, source: Value) -> Value {
    diff_full(repo, file, source, false)
}

fn diff_full(repo: &TestRepo, file: &str, source: Value, full: bool) -> Value {
    repo.core
        .invoke(
            "file_diff",
            json!({ "path": repo.path().to_string_lossy(), "file": file, "source": source, "full": full }),
        )
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
    assert_eq!(
        full["hunks"][1]["start"],
        full["lines"].as_array().unwrap().iter().position(|x| x["hunk"] == 1).unwrap()
    );
}

fn diff_enc(repo: &TestRepo, file: &str, encoding: &str) -> Value {
    repo.core
        .invoke("file_diff", json!({ "path": repo.path().to_string_lossy(), "file": file, "source": { "kind": "unstaged" }, "full": false, "encoding": encoding }))
        .expect("file_diff")
}

fn write_bytes(repo: &TestRepo, file: &str, bytes: &[u8]) {
    std::fs::write(repo.path().join(file), bytes).expect("escreve");
}

fn utf16le(text: &str) -> Vec<u8> {
    let mut out = vec![0xFF, 0xFE];
    out.extend(text.encode_utf16().flat_map(u16::to_le_bytes));
    out
}

#[test]
fn adivinha_windows_1252_e_aceita_troca_manual() {
    let repo = TestRepo::new();
    write_bytes(&repo, "l.txt", b"informa\xe7\xe3o sobre a a\xe7\xe3o do cora\xe7\xe3o\n");
    let d = diff_enc(&repo, "l.txt", "guess");
    assert_eq!((d["encodingId"].as_str(), d["guessed"].as_bool()), (Some("windows-1252"), Some(true)));
    assert_eq!(lines(&d), ["+1 informação sobre a ação do coração"]);
    let manual = diff_enc(&repo, "l.txt", "cp850");
    assert_eq!((manual["encodingId"].as_str(), manual["guessed"].as_bool()), (Some("cp850"), Some(false)));
    assert_ne!(lines(&manual), lines(&d));
}

#[test]
fn utf8_valido_nao_aciona_o_detector() {
    let repo = TestRepo::new();
    repo.write("u.txt", "ação\n");
    let d = diff_enc(&repo, "u.txt", "guess");
    assert_eq!(
        (d["encoding"].as_str(), d["guessed"].as_bool(), d["stageable"].as_bool()),
        (Some("UTF-8"), Some(false), Some(true))
    );
}

#[test]
fn utf16_com_bom_vira_diff_de_texto_sem_stage() {
    let repo = TestRepo::empty();
    write_bytes(&repo, "w.txt", &utf16le("um\ndois\n"));
    repo.commit_all("utf16");
    write_bytes(&repo, "w.txt", &utf16le("um\ndois\ntrês\n"));
    let d = diff_enc(&repo, "w.txt", "guess");
    assert_eq!(
        (d["binary"].as_bool(), d["encodingId"].as_str(), d["stageable"].as_bool()),
        (Some(false), Some("utf-16le"), Some(false))
    );
    assert_eq!(lines(&d), [" 1 um", " 2 dois", "+3 três"]);
}

#[test]
fn binario_nao_mostra_linhas_e_codificacao_desconhecida_falha() {
    let repo = TestRepo::new();
    repo.write("a.txt", "mudou\n");
    let d = diff_enc(&repo, "a.txt", "binary");
    assert_eq!((d["binary"].as_bool(), d["lines"].as_array().map(Vec::len)), (Some(true), Some(0)));
    assert!(repo
        .core
        .invoke("file_diff", json!({ "path": repo.path().to_string_lossy(), "file": "a.txt", "source": { "kind": "unstaged" }, "full": false, "encoding": "nada" }))
        .is_err());
}

#[test]
fn lista_de_codificacoes_comeca_por_adivinhar_e_binario() {
    let repo = TestRepo::new();
    let list = repo.core.invoke("list_encodings", json!({})).expect("lista");
    assert_eq!((list[0]["id"].as_str(), list[1]["id"].as_str()), (Some("guess"), Some("binary")));
}
