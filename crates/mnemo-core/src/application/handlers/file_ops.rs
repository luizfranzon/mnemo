use super::{ExecCtx, Handler, HandlerOutcome};
use crate::domain::error::{CoreError, Result};
use crate::domain::operation::{OperationKind, UndoPlan, WipPlan};
use std::path::{Component, Path};

/// Restaurar a versão de um commit e excluir um arquivo: mexem só no WIP. Desfazer troca o WIP de volta.
pub struct FileOps;

impl Handler for FileOps {
    fn handles(&self, kind: &OperationKind) -> bool {
        matches!(kind, OperationKind::RestoreFile { .. } | OperationKind::DeleteFile { .. })
    }

    fn run(&self, ctx: &mut ExecCtx, kind: &OperationKind) -> Result<HandlerOutcome> {
        let git = ctx.git;
        let before_tree = git.wip_tree()?;
        match kind {
            OperationKind::RestoreFile { commit, path } => {
                relative(path)?;
                git.run(["checkout", commit.as_str(), "--", path.as_str()])?;
            }
            OperationKind::DeleteFile { path } => {
                relative(path)?;
                git.run(["rm", "-rf", "-q", "--ignore-unmatch", "--", path.as_str()])?;
                // Não rastreado: o git rm não o toca.
                let on_disk = git.workdir().join(path);
                if on_disk.is_file() {
                    std::fs::remove_file(&on_disk)
                        .map_err(|e| CoreError::internal(format!("não foi possível excluir {path}: {e}")))?;
                }
            }
            _ => return Err(CoreError::internal("kind fora do handler")),
        }
        let after_tree = git.wip_tree()?;
        if after_tree == before_tree {
            return Err(CoreError::NothingToDo { reason: "o arquivo já está assim".into() });
        }
        let plan = UndoPlan {
            wip: Some(WipPlan::Replace {
                before_tree,
                after_tree,
                before_index: ctx.before.index_tree.clone(),
                after_index: git.index_tree()?,
            }),
            ..UndoPlan::default()
        };
        Ok(HandlerOutcome::Done(plan))
    }
}

/// Caminho relativo à raiz do repositório, sem `..`: nunca sai do diretório de trabalho.
fn relative(path: &str) -> Result<()> {
    let p = Path::new(path);
    if path.is_empty() || p.is_absolute() || p.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(CoreError::invalid(format!("caminho inválido: {path}")));
    }
    Ok(())
}
