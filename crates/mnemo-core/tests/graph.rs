mod support;

use mnemo_core::application::graph::GraphCursor;
use std::io::Write;
use std::process::{Command, Stdio};
use support::TestRepo;

#[test]
fn pagina_seguinte_preserva_lanes_das_linhas_anteriores() {
    let repo = TestRepo::new();
    repo.git(&["switch", "-q", "-c", "feature"]);
    repo.write("feature.txt", "feature");
    repo.commit_all("feature");
    repo.git(&["switch", "-q", "main"]);
    repo.write("main.txt", "main");
    repo.commit_all("main");
    repo.git(&["merge", "--no-ff", "-m", "merge", "feature"]);
    let path = repo.path().to_string_lossy();
    let first = repo.core.graph_page(&path, None, 2).expect("primeira página");
    assert_eq!(first.commits.len(), 2);
    let next = first.next.clone().expect("há mais commits");
    let second = repo.core.graph_page(&path, Some(next), 2).expect("segunda página");
    let all = repo.core.graph_page(&path, None, 20).expect("histórico completo");
    assert_eq!(
        serde_json::to_value(&first.commits).expect("json"),
        serde_json::to_value(&all.commits[..2]).expect("json")
    );
    assert_eq!(
        serde_json::to_value(&second.commits).expect("json"),
        serde_json::to_value(&all.commits[2..]).expect("json")
    );
    assert!(all.commits.iter().any(|c| c.parents.len() == 2
        && c.segments
            .iter()
            .filter(|s| matches!(s.kind, mnemo_core::application::graph::SegmentKind::Parent))
            .count()
            == 2));
    assert!(all
        .commits
        .iter()
        .any(|c| c.segments.iter().any(
            |s| matches!(s.kind, mnemo_core::application::graph::SegmentKind::Parent) && s.from_lane != s.to_lane
        )));
}

#[test]
fn repo_vazio_tem_wip_sem_commits() {
    let repo = TestRepo::empty();
    repo.write("novo.txt", "novo");
    let page = repo.core.graph_page(&repo.path().to_string_lossy(), None, 2000).expect("grafo vazio");
    assert!(page.commits.is_empty());
    assert!(page.next.is_none());
    assert_eq!((page.wip.changed, page.wip.untracked), (0, 1));
}

#[test]
fn cursor_eh_pequeno_e_serializavel() {
    let cursor = GraphCursor::default();
    let json = serde_json::to_string(&cursor).expect("serializa");
    assert_eq!(serde_json::from_str::<GraphCursor>(&json).expect("desserializa"), cursor);
}

#[test]
fn tag_anotada_aparece_no_commit_e_remota_sem_local_fica_oculta() {
    let repo = TestRepo::new();
    let _remote = repo.with_remote();
    repo.git(&["tag", "-a", "v1", "-m", "versão um"]);
    repo.git(&["switch", "-q", "-c", "so-remota"]);
    repo.write("remota.txt", "remota");
    let remote_sha = repo.commit_all("só no remoto");
    repo.git(&["push", "-q", "origin", "so-remota"]);
    repo.git(&["switch", "-q", "main"]);
    repo.git(&["branch", "-D", "so-remota"]);
    let page = repo.core.graph_page(&repo.path().to_string_lossy(), None, 2000).expect("grafo");
    assert!(!page.commits.iter().any(|commit| commit.sha == remote_sha));
    assert!(page
        .commits
        .iter()
        .any(|commit| commit.refs.iter().any(|reference| reference.kind == "tag" && reference.name == "v1")));
}

#[test]
fn carrega_mais_de_dois_mil_commits_em_paginas() {
    let repo = TestRepo::new();
    let mut child = Command::new("git")
        .current_dir(repo.path())
        .arg("fast-import")
        .arg("--quiet")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .spawn()
        .expect("fast-import");
    let mut script = String::new();
    let base = repo.head();
    for i in 1..=2100 {
        script.push_str(&format!(
            "commit refs/heads/main\nmark :{i}\ncommitter Teste <teste@example.com> {} +0000\ndata 1\nx\nfrom {}\n\n",
            1_700_000_000 + i,
            if i == 1 { base.clone() } else { format!(":{}", i - 1) }
        ));
    }
    child.stdin.take().expect("stdin").write_all(script.as_bytes()).expect("escreve histórico");
    assert!(child.wait().expect("fast-import termina").success());
    let path = repo.path().to_string_lossy();
    let first = repo.core.graph_page(&path, None, 2000).expect("primeiro lote");
    assert_eq!(first.commits.len(), 2000);
    let second = repo.core.graph_page(&path, Some(first.next.expect("cursor")), 2000).expect("segundo lote");
    assert_eq!(second.commits.len(), 101);
    assert!(second.next.is_none());
}

#[test]
fn descricao_e_a_primeira_linha_do_corpo() {
    let repo = TestRepo::new();
    repo.write("a.txt", "a");
    repo.git(&["add", "."]);
    repo.git(&["commit", "-q", "-m", "assunto", "-m", "primeira linha\ncom mais texto", "-m", "outro parágrafo"]);
    repo.write("b.txt", "b");
    repo.commit_all("sem corpo");
    let page = repo.core.graph_page(&repo.path().to_string_lossy(), None, 10).expect("página");
    assert_eq!(page.commits[0].description, "");
    assert_eq!(page.commits[1].description, "primeira linha");
}
