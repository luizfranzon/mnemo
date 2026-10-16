mod support;

use mnemo_core::application::graph::{GraphCursor, GraphVisibility};
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
    let first = repo.core.graph_page(&path, None, 2, &GraphVisibility::default()).expect("primeira página");
    assert_eq!(first.commits.len(), 2);
    let next = first.next.clone().expect("há mais commits");
    let second = repo.core.graph_page(&path, Some(next), 2, &GraphVisibility::default()).expect("segunda página");
    let all = repo.core.graph_page(&path, None, 20, &GraphVisibility::default()).expect("histórico completo");
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
    let page = repo.core.graph_page(&repo.path().to_string_lossy(), None, 2000, &GraphVisibility::default()).expect("grafo vazio");
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
fn tag_anotada_aparece_no_commit_e_remota_sem_local_tambem_aparece() {
    let repo = TestRepo::new();
    let _remote = repo.with_remote();
    repo.git(&["tag", "-a", "v1", "-m", "versão um"]);
    repo.git(&["switch", "-q", "-c", "so-remota"]);
    repo.write("remota.txt", "remota");
    let remote_sha = repo.commit_all("só no remoto");
    repo.git(&["push", "-q", "origin", "so-remota"]);
    repo.git(&["switch", "-q", "main"]);
    repo.git(&["branch", "-D", "so-remota"]);
    let page = repo.core.graph_page(&repo.path().to_string_lossy(), None, 2000, &GraphVisibility::default()).expect("grafo");
    assert!(page.commits.iter().any(|commit| commit.sha == remote_sha && commit.refs.iter().any(|r| r.name == "origin/so-remota")));
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
    let first = repo.core.graph_page(&path, None, 2000, &GraphVisibility::default()).expect("primeiro lote");
    assert_eq!(first.commits.len(), 2000);
    let second = repo.core.graph_page(&path, Some(first.next.expect("cursor")), 2000, &GraphVisibility::default()).expect("segundo lote");
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
    let page = repo.core.graph_page(&repo.path().to_string_lossy(), None, 10, &GraphVisibility::default()).expect("página");
    assert_eq!(page.commits[0].description, "");
    assert_eq!(page.commits[1].description, "primeira linha");
}

/// main com um commit próprio e `feature` (não mergeada) com outro.
fn repo_com_feature() -> (TestRepo, String) {
    let repo = TestRepo::new();
    repo.git(&["switch", "-q", "-c", "feature"]);
    repo.write("feature.txt", "feature");
    let feature = repo.commit_all("feature");
    repo.git(&["switch", "-q", "main"]);
    repo.write("main.txt", "main");
    repo.commit_all("main");
    (repo, feature)
}

fn shas(repo: &TestRepo, visibility: &GraphVisibility) -> Vec<String> {
    let page = repo.core.graph_page(&repo.path().to_string_lossy(), None, 50, visibility).expect("grafo");
    page.commits.into_iter().map(|c| c.sha).collect()
}

#[test]
fn ocultar_branch_tira_seus_commits_e_libera_a_lane() {
    let (repo, feature) = repo_com_feature();
    assert!(shas(&repo, &GraphVisibility::default()).contains(&feature));
    let hidden = GraphVisibility { hidden: vec!["refs/heads/feature".into()], ..Default::default() };
    let page = repo.core.graph_page(&repo.path().to_string_lossy(), None, 50, &hidden).expect("grafo");
    assert!(!page.commits.iter().any(|c| c.sha == feature));
    assert!(page.commits.iter().all(|c| c.lane == 0 && c.lane_count == 1), "sem a feature, tudo cabe numa lane");
}

#[test]
fn solo_mostra_so_a_branch_e_seus_ancestrais() {
    let (repo, feature) = repo_com_feature();
    let solo = GraphVisibility { solo: Some("refs/heads/feature".into()), ..Default::default() };
    let page = repo.core.graph_page(&repo.path().to_string_lossy(), None, 50, &solo).expect("grafo");
    assert_eq!(page.commits.len(), 2, "o commit da feature e o inicial");
    assert_eq!(page.commits[0].sha, feature);
    assert!(page.commits.iter().all(|c| c.refs.iter().all(|r| r.name != "main")));
}

#[test]
fn visibilidade_inteligente_mantem_atual_base_e_mergeadas() {
    let (repo, feature) = repo_com_feature();
    repo.git(&["switch", "-q", "-c", "outra", "main"]);
    repo.write("outra.txt", "outra");
    let outra = repo.commit_all("outra");
    repo.git(&["switch", "-q", "main"]);
    let smart = GraphVisibility { smart: true, ..Default::default() };
    let all = shas(&repo, &smart);
    assert!(!all.contains(&feature) && !all.contains(&outra), "branches não mergeadas somem");
    repo.git(&["merge", "--no-ff", "-q", "-m", "merge", "feature"]);
    assert!(shas(&repo, &smart).contains(&feature), "depois do merge a feature aparece");
}

#[test]
fn branches_irmas_mantem_lanes_proprias_ate_o_pai_comum() {
    let repo = TestRepo::new();
    for name in ["a", "b", "c"] {
        repo.git(&["switch", "-q", "-c", name, "main"]);
        repo.write(&format!("{name}.txt"), name);
        repo.commit_all(name);
    }
    let all = repo.core.graph_page(&repo.path().to_string_lossy(), None, 20, &GraphVisibility::default()).expect("grafo");
    let tips: Vec<usize> = all.commits.iter().take(3).map(|c| c.lane).collect();
    assert_eq!(tips.iter().collect::<std::collections::HashSet<_>>().len(), 3, "cada ponta na sua lane: {tips:?}");
}

#[test]
fn commit_sem_ref_aponta_branch_atual_ou_ponta_da_lane() {
    let repo = TestRepo::new();
    repo.write("a.txt", "a");
    repo.commit_all("base");
    repo.git(&["switch", "-q", "-c", "feature"]);
    repo.write("f.txt", "f");
    repo.commit_all("na feature");
    repo.git(&["switch", "-q", "main"]);
    repo.write("m.txt", "m");
    repo.commit_all("so na main");
    let path = repo.path().to_string_lossy();
    let page = repo.core.graph_page(&path, None, 20, &GraphVisibility::default()).expect("grafo");
    let ghost = |subject: &str| page.commits.iter().find(|c| c.subject == subject).and_then(|c| c.ghost.as_ref()).map(|g| g.name.clone());
    // pontas de branch têm pill própria; commit só da feature não tem commit sem ref acima dele
    assert_eq!(ghost("so na main"), None);
    assert_eq!(ghost("na feature"), None);
    // o commit base está na ancestralidade do HEAD (main), mesmo com a feature em outra lane
    assert_eq!(ghost("base").as_deref(), Some("main"));
}

fn commit_at(repo: &TestRepo, file: &str, msg: &str, ts: u32) {
    repo.write(file, msg);
    repo.git(&["add", "-A"]);
    let date = format!("{ts} +0000");
    let status = Command::new("git")
        .current_dir(repo.path())
        .env("GIT_COMMITTER_DATE", &date)
        .env("GIT_AUTHOR_DATE", &date)
        .args(["commit", "-q", "-m", msg])
        .status()
        .expect("git commit");
    assert!(status.success());
}

#[test]
fn ordem_por_data_intercala_branches_e_a_topologica_agrupa() {
    let repo = TestRepo::new();
    repo.git(&["switch", "-q", "-c", "a"]);
    commit_at(&repo, "a1", "a1", 1_700_000_100);
    repo.git(&["switch", "-q", "main"]);
    repo.git(&["switch", "-q", "-c", "b"]);
    commit_at(&repo, "b1", "b1", 1_700_000_200);
    repo.git(&["switch", "-q", "a"]);
    commit_at(&repo, "a2", "a2", 1_700_000_300);
    repo.git(&["switch", "-q", "b"]);
    commit_at(&repo, "b2", "b2", 1_700_000_400);
    repo.git(&["switch", "-q", "main"]);
    repo.git(&["merge", "-q", "--no-ff", "-m", "m", "a", "b"]);
    let subjects = |date_order| {
        let visibility = GraphVisibility { date_order, ..Default::default() };
        let page = repo.core.graph_page(&repo.path().to_string_lossy(), None, 50, &visibility).expect("grafo");
        page.commits.into_iter().map(|c| c.subject).take(5).collect::<Vec<_>>()
    };
    assert_eq!(subjects(true), ["m", "b2", "a2", "b1", "a1"]);
    assert_ne!(subjects(false), subjects(true));
}

#[test]
fn branch_em_destaque_fica_na_lane_0_e_as_outras_saem_dela() {
    let (repo, _) = repo_com_feature();
    let path = repo.path().to_string_lossy();
    for (highlight, other) in [("refs/heads/main", "feature"), ("refs/heads/feature", "main")] {
        let visibility = GraphVisibility { highlight: Some(highlight.into()), ..Default::default() };
        let page = repo.core.graph_page(&path, None, 50, &visibility).expect("grafo");
        let lane_of = |subject: &str| page.commits.iter().find(|c| c.subject == subject).expect("commit").lane;
        let chain = highlight.trim_start_matches("refs/heads/");
        assert_eq!(lane_of(chain), 0, "{chain} na lane 0");
        assert!(lane_of(other) >= 1, "{other} fora da lane 0");
    }
}

#[test]
fn destaque_numa_branch_oculta_ou_fora_do_solo_nao_reserva_lane() {
    let (repo, _) = repo_com_feature();
    let path = repo.path().to_string_lossy();
    let hidden = GraphVisibility { hidden: vec!["refs/heads/main".into()], highlight: Some("refs/heads/main".into()), ..Default::default() };
    let solo = GraphVisibility { solo: Some("refs/heads/feature".into()), highlight: Some("refs/heads/main".into()), ..Default::default() };
    for visibility in [hidden, solo] {
        let page = repo.core.graph_page(&path, None, 50, &visibility).expect("grafo");
        assert!(page.commits.iter().all(|c| c.lane == 0 && c.lane_count == 1), "sem a branch em destaque, tudo cabe numa lane");
    }
}

#[test]
fn destaque_preserva_lanes_entre_paginas() {
    let (repo, _) = repo_com_feature();
    let path = repo.path().to_string_lossy();
    let visibility = GraphVisibility { highlight: Some("refs/heads/main".into()), ..Default::default() };
    let all = repo.core.graph_page(&path, None, 20, &visibility).expect("completo");
    let first = repo.core.graph_page(&path, None, 1, &visibility).expect("primeira");
    let second = repo.core.graph_page(&path, first.next.clone(), 20, &visibility).expect("segunda");
    let lanes = |commits: &[mnemo_core::application::graph::GraphCommit]| commits.iter().map(|c| c.lane).collect::<Vec<_>>();
    assert_eq!([lanes(&first.commits), lanes(&second.commits)].concat(), lanes(&all.commits));
}

#[test]
fn precedencia_das_lanes_e_destaque_depois_branch_atual_depois_o_resto() {
    let repo = TestRepo::new();
    repo.git(&["switch", "-q", "-c", "outra"]);
    repo.write("outra.txt", "outra");
    repo.commit_all("da outra");
    repo.git(&["switch", "-q", "-c", "atual", "main"]);
    repo.write("atual.txt", "atual");
    repo.commit_all("da atual");
    repo.git(&["switch", "-q", "main"]);
    repo.write("main.txt", "main");
    repo.commit_all("da main");
    repo.git(&["switch", "-q", "atual"]);
    let path = repo.path().to_string_lossy();
    let lane = |visibility: &GraphVisibility, subject: &str| {
        let page = repo.core.graph_page(&path, None, 50, visibility).expect("grafo");
        page.commits.iter().find(|c| c.subject == subject).expect("commit").lane
    };
    let sem_destaque = GraphVisibility::default();
    assert_eq!(lane(&sem_destaque, "da atual"), 0, "sem destaque a branch atual fica na lane 0");
    assert!(lane(&sem_destaque, "da outra") >= 1);
    let destaque = GraphVisibility { highlight: Some("refs/heads/main".into()), ..Default::default() };
    assert_eq!(lane(&destaque, "da main"), 0);
    assert_eq!(lane(&destaque, "da atual"), 1, "a branch atual vem logo depois do destaque");
    assert!(lane(&destaque, "da outra") >= 2);
}
