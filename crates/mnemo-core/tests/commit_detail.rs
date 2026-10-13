mod support;

use support::TestRepo;

fn detail(repo: &TestRepo, rev: &str, all: bool) -> mnemo_core::application::detail::CommitDetail {
    let sha = repo.rev(rev);
    repo.core.commit_detail(&repo.path().to_string_lossy(), &sha, all).expect("detalhe")
}

#[test]
fn commit_raiz_lista_arquivos_adicionados_com_linhas() {
    let repo = TestRepo::empty();
    repo.write("a.txt", "1\n2\n3\n");
    repo.git(&["add", "."]);
    repo.git(&["commit", "-q", "-m", "raiz", "-m", "descrição longa"]);
    let d = detail(&repo, "HEAD", false);
    assert!(d.parents.is_empty());
    assert_eq!((d.subject.as_str(), d.body.as_str()), ("raiz", "descrição longa"));
    assert_eq!(d.files.len(), 1);
    assert_eq!((d.files[0].status.as_str(), d.files[0].added, d.files[0].removed), ("A", Some(3), Some(0)));
    assert_eq!((d.added, d.removed), (3, 0));
}

#[test]
fn merge_compara_com_o_primeiro_pai() {
    let repo = TestRepo::new();
    repo.git(&["switch", "-q", "-c", "feature"]);
    repo.write("feature.txt", "f\n");
    repo.commit_all("feature");
    repo.git(&["switch", "-q", "main"]);
    repo.write("main.txt", "m\n");
    repo.commit_all("main");
    repo.git(&["merge", "--no-ff", "-m", "merge", "feature"]);
    let d = detail(&repo, "HEAD", false);
    assert_eq!(d.parents.len(), 2);
    assert_eq!(d.files.iter().map(|f| f.path.as_str()).collect::<Vec<_>>(), ["feature.txt"]);
}

#[test]
fn renomeacao_traz_caminho_antigo_e_linhas() {
    let repo = TestRepo::new();
    repo.write("velho.txt", "a\nb\nc\nd\n");
    repo.commit_all("base");
    repo.git(&["mv", "velho.txt", "novo.txt"]);
    repo.write("novo.txt", "a\nb\nc\nd\ne\n");
    repo.commit_all("renomeia");
    let d = detail(&repo, "HEAD", false);
    assert_eq!(d.files.len(), 1);
    let f = &d.files[0];
    assert_eq!((f.status.as_str(), f.path.as_str(), f.old_path.as_deref()), ("R", "novo.txt", Some("velho.txt")));
    assert_eq!((f.added, f.removed), (Some(1), Some(0)));
}

#[test]
fn nomes_com_espaco_e_unicode_chegam_sem_aspas() {
    let repo = TestRepo::new();
    repo.write("pasta com espaço/ação ç.txt", "x\n");
    repo.write("bin.dat", "\0\0\0");
    repo.commit_all("nomes");
    let d = detail(&repo, "HEAD", false);
    let paths: Vec<_> = d.files.iter().map(|f| f.path.as_str()).collect();
    assert!(paths.contains(&"pasta com espaço/ação ç.txt"), "{paths:?}");
    let bin = d.files.iter().find(|f| f.path == "bin.dat").expect("binário");
    assert_eq!((bin.added, bin.removed), (None, None));
}

#[test]
fn todos_os_arquivos_inclui_os_nao_tocados() {
    let repo = TestRepo::new();
    repo.write("intocado.txt", "i\n");
    repo.commit_all("um");
    repo.write("novo.txt", "n\n");
    repo.commit_all("dois");
    let d = detail(&repo, "HEAD", true);
    let status = |p: &str| d.files.iter().find(|f| f.path == p).map(|f| f.status.clone());
    assert_eq!(status("novo.txt").as_deref(), Some("A"));
    assert_eq!(status("intocado.txt").as_deref(), Some("U"));
}

#[test]
fn sha_inexistente_e_erro() {
    let repo = TestRepo::new();
    assert!(repo.core.commit_detail(&repo.path().to_string_lossy(), "deadbeef", false).is_err());
}
