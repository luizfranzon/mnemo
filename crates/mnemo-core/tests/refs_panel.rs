mod support;

use mnemo_core::domain::operation::{CheckoutChangesMode, OperationKind};
use support::TestRepo;

#[test]
fn painel_agrupa_remotas_e_mostra_tracking_de_todas_as_locais() {
    let repo = TestRepo::new();
    let _remote = repo.with_remote();
    repo.git(&["branch", "feature/teste"]);
    repo.git(&["push", "-q", "origin", "feature/teste"]);
    repo.git(&["branch", "--set-upstream-to=origin/feature/teste", "feature/teste"]);
    repo.git(&["branch", "sem-upstream"]);
    repo.git(&["tag", "v1"]);
    let refs = repo.core.list_refs(&repo.path().to_string_lossy()).expect("refs");
    assert!(refs.local.iter().any(|b| b.name == "main" && b.current && b.upstream.as_deref() == Some("origin/main")));
    assert!(refs.local.iter().any(|b| b.name == "sem-upstream" && b.ahead.is_none()));
    assert!(refs.local.iter().any(|b| b.name == "feature/teste" && b.ahead == Some(0) && b.behind == Some(0)));
    let origin = refs.remotes.iter().find(|r| r.name == "origin").expect("origin");
    assert!(origin.branches.iter().any(|b| b.name == "main"));
    assert!(origin.folders.iter().any(|f| f.name == "feature" && f.branches.iter().any(|b| b.name == "feature/teste")));
    let sha = repo.head();
    repo.git(&["update-ref", "refs/remotes/origin/t34947", &sha]);
    repo.git(&["update-ref", "refs/remotes/origin/t34948", &sha]);
    repo.git(&["update-ref", "refs/remotes/origin/12.1", &sha]);
    let refs = repo.core.list_refs(&repo.path().to_string_lossy()).expect("refs agrupadas");
    let origin = refs.remotes.iter().find(|r| r.name == "origin").expect("origin");
    assert!(origin.folders.iter().any(|f| f.name == "t3xxxx" && f.branches.len() == 2));
    assert!(origin.folders.iter().any(|f| f.name == "12.x" && f.branches.len() == 1));
    assert!(refs.tags.iter().any(|t| t.name == "v1"));
    assert_eq!(refs.worktrees.len(), 1);
}

#[test]
fn remota_sem_local_vira_branch_rastreada_e_desfaz() {
    let repo = TestRepo::new();
    let _remote = repo.with_remote();
    repo.git(&["branch", "feature/nova"]);
    repo.git(&["push", "-q", "origin", "feature/nova"]);
    repo.git(&["branch", "-D", "feature/nova"]);
    repo.exec(OperationKind::CheckoutRemote { remote: "origin".into(), branch: "feature/nova".into() });
    assert_eq!(repo.branch(), "feature/nova");
    assert_eq!(repo.git(&["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]), "origin/feature/nova");
    repo.session().undo().expect("desfaz checkout remoto");
    assert_eq!(repo.branch(), "main");
    assert!(repo.git(&["branch", "--list", "feature/nova"]).is_empty());
    repo.session().redo().expect("refaz checkout remoto");
    assert_eq!(repo.branch(), "feature/nova");
    assert_eq!(repo.git(&["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]), "origin/feature/nova");
}

#[test]
fn checkout_avisa_sobre_arquivo_que_mudou_nas_duas_branches_e_stash_preserva_o_wip() {
    let repo = TestRepo::new();
    repo.git(&["switch", "-q", "-c", "feature"]);
    repo.write("a.txt", "na feature\ndois\ntres\n");
    repo.commit_all("feature");
    repo.git(&["switch", "-q", "main"]);
    repo.write("a.txt", "editado\ndois\ntres\n");
    repo.write("novo.txt", "arquivo novo");
    assert_eq!(repo.core.checkout_conflict_count(&repo.path().to_string_lossy(), "feature").expect("preview"), 1);
    repo.exec(OperationKind::CheckoutWithChanges {
        target: "feature".into(),
        remote: None,
        mode: CheckoutChangesMode::Stash,
    });
    assert_eq!(repo.branch(), "feature");
    assert_eq!(repo.read("a.txt"), "na feature\ndois\ntres\n");
    assert!(!repo.exists("novo.txt"));
    assert_eq!(repo.git(&["stash", "list", "--format=%H"]).lines().count(), 1);
    repo.session().undo().expect("desfaz stash e checkout");
    assert_eq!(repo.branch(), "main");
    assert_eq!(repo.read("a.txt"), "editado\ndois\ntres\n");
    assert_eq!(repo.read("novo.txt"), "arquivo novo");
    assert!(repo.git(&["stash", "list"]).is_empty());
    repo.session().redo().expect("refaz stash e checkout");
    assert_eq!(repo.branch(), "feature");
    assert_eq!(repo.read("a.txt"), "na feature\ndois\ntres\n");
    assert!(!repo.exists("novo.txt"));
    assert_eq!(repo.git(&["stash", "list", "--format=%H"]).lines().count(), 1);
}

#[test]
fn levar_mudancas_mantem_edicao_na_nova_branch() {
    let repo = TestRepo::new();
    repo.git(&["switch", "-q", "-c", "feature"]);
    repo.write("a.txt", "um\ndois\nna feature\n");
    repo.commit_all("feature");
    repo.git(&["switch", "-q", "main"]);
    repo.write("a.txt", "editado\ndois\ntres\n");
    repo.exec(OperationKind::CheckoutWithChanges {
        target: "feature".into(),
        remote: None,
        mode: CheckoutChangesMode::Carry,
    });
    assert_eq!(repo.branch(), "feature");
    assert_eq!(repo.read("a.txt"), "editado\ndois\nna feature\n");
    repo.session().undo().expect("desfaz checkout");
    assert_eq!(repo.branch(), "main");
    assert_eq!(repo.read("a.txt"), "editado\ndois\ntres\n");
    repo.session().redo().expect("refaz checkout");
    assert_eq!(repo.branch(), "feature");
    assert_eq!(repo.read("a.txt"), "editado\ndois\nna feature\n");
}

#[test]
fn contagem_de_ahead_e_behind_reflete_o_upstream_de_cada_branch() {
    let repo = TestRepo::new();
    let _remote = repo.with_remote();
    repo.git(&["switch", "-q", "-c", "feature"]);
    repo.git(&["branch", "--set-upstream-to=origin/main", "feature"]);
    repo.write("feature.txt", "feature");
    repo.commit_all("feature");
    repo.git(&["switch", "-q", "main"]);
    repo.write("main.txt", "main");
    repo.commit_all("main novo");
    repo.git(&["push", "-q", "origin", "main"]);
    repo.git(&["fetch", "-q", "origin"]);
    let refs = repo.core.list_refs(&repo.path().to_string_lossy()).expect("refs");
    let branch = refs.local.iter().find(|b| b.name == "feature").expect("feature");
    assert_eq!((branch.ahead, branch.behind), (Some(1), Some(1)));
}

#[test]
fn levar_mudancas_com_conflito_textual_nao_deixa_checkout_parcial() {
    let repo = TestRepo::new();
    repo.git(&["switch", "-q", "-c", "feature"]);
    repo.write("a.txt", "na feature\ndois\ntres\n");
    repo.commit_all("feature");
    repo.git(&["switch", "-q", "main"]);
    repo.write("a.txt", "editado\ndois\ntres\n");
    repo.write("novo.txt", "untracked");
    let result = repo.session().execute(OperationKind::CheckoutWithChanges {
        target: "feature".into(),
        remote: None,
        mode: CheckoutChangesMode::Carry,
    });
    assert!(result.is_err());
    assert_eq!(repo.branch(), "main");
    assert_eq!(repo.read("a.txt"), "editado\ndois\ntres\n");
    assert_eq!(repo.read("novo.txt"), "untracked");
}

#[test]
fn checkout_com_stash_que_falha_recupera_o_wip() {
    let repo = TestRepo::new();
    repo.write("a.txt", "alterado\n");
    repo.write("novo.txt", "novo");
    let result = repo.session().execute(OperationKind::CheckoutWithChanges {
        target: "inexistente".into(),
        remote: None,
        mode: CheckoutChangesMode::Stash,
    });
    assert!(result.is_err());
    assert_eq!(repo.branch(), "main");
    assert_eq!(repo.read("a.txt"), "alterado\n");
    assert_eq!(repo.read("novo.txt"), "novo");
    assert!(repo.git(&["stash", "list"]).is_empty());
}

#[test]
fn commit_on_remote_so_e_verdadeiro_depois_do_push() {
    let repo = TestRepo::new();
    let _remote = repo.with_remote();
    let path = repo.path().to_string_lossy().into_owned();
    let enviado = repo.head();
    repo.write("novo.txt", "x");
    let local = repo.commit_all("local");
    assert!(repo.core.commit_on_remote(&path, &enviado).expect("remoto"));
    assert!(!repo.core.commit_on_remote(&path, &local).expect("remoto"));
    repo.git(&["push", "-q"]);
    assert!(repo.core.commit_on_remote(&path, &local).expect("remoto"));
}

#[test]
fn remote_url_devolve_a_url_do_remoto_ou_nada() {
    let repo = TestRepo::new();
    let _remote = repo.with_remote();
    let path = repo.path().to_string_lossy().into_owned();
    assert!(repo.core.remote_url(&path, "origin").expect("url").is_some());
    assert_eq!(repo.core.remote_url(&path, "inexistente").expect("url"), None);
}

#[test]
fn autores_vem_um_por_email_com_o_nome_mais_recente_e_em_ordem_alfabetica() {
    let repo = TestRepo::new();
    let commit = |name: &str, email: &str, file: &str| {
        repo.write(file, name);
        repo.git(&["add", "."]);
        repo.git(&["-c", &format!("user.name={name}"), "-c", &format!("user.email={email}"), "commit", "-qm", file]);
    };
    commit("Zé", "ze@x.com", "a");
    commit("Ana Antiga", "ana@x.com", "b");
    commit("Ana", "ANA@x.com", "c");
    let authors = repo.core.list_authors(&repo.path().to_string_lossy()).expect("autores");
    let ana = authors.iter().find(|a| a.email.eq_ignore_ascii_case("ana@x.com")).expect("ana");
    assert_eq!(ana.name, "Ana");
    assert_eq!(authors.iter().filter(|a| a.email.eq_ignore_ascii_case("ana@x.com")).count(), 1);
    let names: Vec<_> = authors.iter().map(|a| a.name.as_str()).collect();
    let mut sorted = names.clone();
    sorted.sort_by_key(|n| n.to_lowercase());
    assert_eq!(names, sorted);
    assert!(names.contains(&"Zé"));
}

#[test]
fn painel_lista_submodulos_do_gitmodules_e_nenhum_sem_ele() {
    let repo = TestRepo::new();
    let path = repo.path().to_string_lossy().into_owned();
    assert!(repo.core.list_refs(&path).expect("refs").submodules.is_empty());
    let sub_src = tempfile::tempdir().expect("tempdir");
    support::init_repo(sub_src.path());
    support::run_git(sub_src.path(), &["commit", "-q", "--allow-empty", "-m", "s"]);
    repo.git(&["-c", "protocol.file.allow=always", "submodule", "add", "-q", &sub_src.path().to_string_lossy(), "sub"]);
    let refs = repo.core.list_refs(&path).expect("refs com submódulo");
    assert!(refs.submodules.iter().any(|s| s.name == "sub"));
}
