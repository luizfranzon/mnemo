mod support;

use serde_json::{json, Value};
use support::TestRepo;

fn diff(repo: &TestRepo, file: &str, staged: bool) -> Value {
    let source = if staged { json!({ "kind": "staged" }) } else { json!({ "kind": "unstaged" }) };
    repo.core
        .invoke("file_diff", json!({ "path": repo.path().to_string_lossy(), "file": file, "source": source }))
        .expect("file_diff")
}

/// Índices (trecho, linha no trecho) das linhas cujo texto está em `texts`.
fn pick(d: &Value, texts: &[&str]) -> Vec<(u64, u64)> {
    let mut out = Vec::new();
    for (h, hunk) in d["hunks"].as_array().unwrap().iter().enumerate() {
        let start = hunk["start"].as_u64().unwrap();
        for i in 0..hunk["len"].as_u64().unwrap() {
            let line = &d["lines"][(start + i) as usize];
            if line["kind"] != "context" && texts.contains(&line["text"].as_str().unwrap()) {
                out.push((h as u64, i));
            }
        }
    }
    out
}

fn stage_lines(repo: &TestRepo, file: &str, unstage: bool, lines: &[(u64, u64)]) {
    repo.core
        .invoke(
            "stage_lines",
            json!({ "path": repo.path().to_string_lossy(), "file": file, "unstage": unstage, "lines": lines }),
        )
        .expect("stage_lines");
}

fn index(repo: &TestRepo, file: &str) -> String {
    repo.git(&["show", &format!(":{file}")])
}

fn base(repo: &TestRepo) {
    let body: String = (1..=20).map(|n| format!("l{n}\n")).collect();
    repo.write("a.txt", &body);
    repo.commit_all("vinte");
    repo.write("a.txt", &body.replace("l2\n", "L2\n").replace("l18\n", "L18\n"));
}

#[test]
fn prepara_um_trecho_inteiro_sem_mexer_no_diretorio_de_trabalho() {
    let repo = TestRepo::new();
    base(&repo);
    let d = diff(&repo, "a.txt", false);
    stage_lines(&repo, "a.txt", false, &pick(&d, &["l2", "L2"]));
    let staged = index(&repo, "a.txt");
    assert!(staged.contains("L2") && !staged.contains("L18"));
    assert!(repo.read("a.txt").contains("L18"), "o diretório de trabalho não muda");
    assert_eq!(diff(&repo, "a.txt", false)["hunks"].as_array().unwrap().len(), 1);
}

#[test]
fn prepara_uma_linha_isolada_e_tira_de_volta() {
    let repo = TestRepo::new();
    repo.write("a.txt", "um\nA\nB\nC\ntres\n");
    let d = diff(&repo, "a.txt", false);
    stage_lines(&repo, "a.txt", false, &pick(&d, &["B"]));
    assert_eq!(index(&repo, "a.txt"), "um\ndois\nB\ntres");

    let s = diff(&repo, "a.txt", true);
    stage_lines(&repo, "a.txt", true, &pick(&s, &["B"]));
    assert_eq!(index(&repo, "a.txt"), "um\ndois\ntres");
    assert_eq!(repo.read("a.txt"), "um\nA\nB\nC\ntres\n");
}

#[test]
fn adicionadas_e_removidas_no_mesmo_trecho() {
    let repo = TestRepo::new();
    repo.write("a.txt", "um\nDOIS\ntres\nquatro\n");
    let d = diff(&repo, "a.txt", false);
    // só a remoção de "dois" e a adição de "quatro": "DOIS" fica de fora
    stage_lines(&repo, "a.txt", false, &pick(&d, &["dois", "quatro"]));
    assert_eq!(index(&repo, "a.txt"), "um\ntres\nquatro");
    let rest = diff(&repo, "a.txt", false);
    assert_eq!((rest["added"].as_u64(), rest["removed"].as_u64()), (Some(1), Some(0)));
}

#[test]
fn arquivo_novo_parcial_e_inteiro() {
    let repo = TestRepo::new();
    repo.write("novo.txt", "x\ny\nz\n");
    let d = diff(&repo, "novo.txt", false);
    stage_lines(&repo, "novo.txt", false, &pick(&d, &["x", "z"]));
    assert_eq!(index(&repo, "novo.txt"), "x\nz");
    assert_eq!(repo.read("novo.txt"), "x\ny\nz\n");

    let s = diff(&repo, "novo.txt", true);
    stage_lines(&repo, "novo.txt", true, &pick(&s, &["x", "z"]));
    assert!(repo.status().contains("?? novo.txt"), "tirar tudo devolve o arquivo a não rastreado: {}", repo.status());
}

#[test]
fn sem_linha_de_mudanca_escolhida_nao_faz_nada() {
    let repo = TestRepo::new();
    repo.write("a.txt", "um\nA\ntres\n");
    let err = repo
        .core
        .invoke(
            "stage_lines",
            json!({ "path": repo.path().to_string_lossy(), "file": "a.txt", "unstage": false, "lines": [] }),
        )
        .unwrap_err();
    assert!(matches!(err, mnemo_core::CoreError::NothingToDo { .. }), "{err:?}");
}
