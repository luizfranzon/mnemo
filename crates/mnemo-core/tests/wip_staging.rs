mod support;

use serde_json::json;
use support::TestRepo;

fn status(repo: &TestRepo) -> serde_json::Value {
    repo.core.invoke("wip_status", json!({ "path": repo.path().to_string_lossy() })).expect("status")
}

fn stage(repo: &TestRepo, cmd: &str, paths: &[&str]) {
    repo.core.invoke(cmd, json!({ "path": repo.path().to_string_lossy(), "paths": paths })).expect(cmd);
}

fn names(v: &serde_json::Value) -> Vec<String> {
    v.as_array()
        .unwrap()
        .iter()
        .map(|f| format!("{}{}", f["status"].as_str().unwrap(), f["path"].as_str().unwrap()))
        .collect()
}

#[test]
fn separa_preparados_de_nao_preparados_e_prepara_e_tira() {
    let repo = TestRepo::new();
    repo.write("novo.txt", "n\n");
    let first = repo.git(&["ls-files"]).lines().next().unwrap().to_string();
    repo.write(&first, "mudou\n");
    let s = status(&repo);
    assert_eq!(names(&s["unstaged"]).len(), 2);
    assert!(names(&s["staged"]).is_empty());

    stage(&repo, "stage", &["novo.txt"]);
    let s = status(&repo);
    assert_eq!(names(&s["staged"]), ["Anovo.txt"]);
    assert_eq!(names(&s["unstaged"]), [format!("M{first}")]);

    stage(&repo, "stage", &[]);
    assert!(names(&status(&repo)["unstaged"]).is_empty());
    stage(&repo, "unstage", &[]);
    let s = status(&repo);
    assert!(names(&s["staged"]).is_empty());
    assert_eq!(names(&s["unstaged"]).len(), 2);
}
