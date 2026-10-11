mod support;
use mnemo_core::api::HeadInfo;
use mnemo_core::CoreError;
use support::TestRepo;

#[test]
fn abrir_repositorio_mostra_a_branch_atual() {
    let repo = TestRepo::new();
    let info = repo.core.open_repository(&repo.path().to_string_lossy()).expect("abre");
    assert!(matches!(info.head, HeadInfo::Branch { ref name, .. } if name == "main"));
}

#[test]
fn head_destacado_mostra_o_sha_curto() {
    let repo = TestRepo::new();
    let sha = repo.head();
    repo.git(&["checkout", "-q", "--detach"]);
    let info = repo.core.open_repository(&repo.path().to_string_lossy()).expect("abre");
    assert!(matches!(info.head, HeadInfo::Detached { sha: ref s } if s == &sha[..7]));
}

#[test]
fn repositorio_sem_commits_mostra_a_branch_nao_nascida() {
    let repo = TestRepo::empty();
    let info = repo.core.open_repository(&repo.path().to_string_lossy()).expect("abre");
    assert!(matches!(info.head, HeadInfo::Branch { ref name, .. } if name == "main"));
}

#[test]
fn pasta_que_nao_e_repositorio_devolve_erro_claro() {
    let dir = tempfile::tempdir().expect("tempdir");
    let data = tempfile::tempdir().expect("tempdir");
    let core = mnemo_core::Mnemo::new(data.path(), std::sync::Arc::new(mnemo_core::application::ports::NoEvents));
    let err = core.open_repository(&dir.path().to_string_lossy()).expect_err("não é repo");
    assert!(matches!(err, CoreError::NotARepository { .. }));
}

#[test]
fn verifica_o_git_do_sistema() {
    let repo = TestRepo::empty();
    assert!(repo.core.check_git().is_ok());
}

#[test]
fn nomes_com_espaco_e_unicode_funcionam() {
    let parent = tempfile::tempdir().expect("tempdir");
    let dir = parent.path().join("meu repositório ção");
    std::fs::create_dir(&dir).expect("mkdir");
    support::init_repo(&dir);
    std::fs::write(dir.join("a b.txt"), "x").expect("write");
    support::run_git(&dir, &["add", "-A"]);
    support::run_git(&dir, &["commit", "-q", "-m", "x"]);
    let data = tempfile::tempdir().expect("tempdir");
    let core = mnemo_core::Mnemo::new(data.path(), std::sync::Arc::new(mnemo_core::application::ports::NoEvents));
    assert!(core.open_repository(&dir.to_string_lossy()).is_ok());
}

#[test]
fn invoke_devolve_json_no_formato_da_ponte() {
    let repo = TestRepo::new();
    let v = repo.core.invoke("open_repository", serde_json::json!({ "path": repo.path() })).expect("invoke");
    assert_eq!(v["head"]["kind"], "branch");
    assert_eq!(v["head"]["name"], "main");
    let err = repo.core.invoke("nao_existe", serde_json::json!({ "path": repo.path() }));
    assert!(err.is_err());
}
