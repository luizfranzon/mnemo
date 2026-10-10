use crate::application::ports::{HistoryStore, StoredSession};
use crate::domain::error::{CoreError, Result};
use std::fs;
use std::path::{Path, PathBuf};

/// Um JSON por diretório de trabalho nos dados do app (ADR 0005). Escrita atômica.
pub struct JsonHistoryStore {
    dir: PathBuf,
}

impl JsonHistoryStore {
    pub fn new(data_dir: impl AsRef<Path>) -> Self {
        Self { dir: data_dir.as_ref().join("history") }
    }

    fn file(&self, workdir: &Path) -> PathBuf {
        self.dir.join(format!("{:016x}.json", fnv1a(&key(workdir))))
    }
}

/// Chave estável do diretório (no Windows o caminho não diferencia maiúsculas).
fn key(workdir: &Path) -> String {
    let s = workdir.to_string_lossy().replace('\\', "/");
    if cfg!(windows) {
        s.to_lowercase()
    } else {
        s
    }
}

/// FNV-1a: estável entre versões do Rust, ao contrário de `DefaultHasher`.
fn fnv1a(s: &str) -> u64 {
    s.bytes().fold(0xcbf2_9ce4_8422_2325, |h, b| (h ^ u64::from(b)).wrapping_mul(0x0100_0000_01b3))
}

fn store_err(e: impl std::fmt::Display) -> CoreError {
    CoreError::Store { message: e.to_string() }
}

impl HistoryStore for JsonHistoryStore {
    fn load(&self, workdir: &Path) -> Result<Option<StoredSession>> {
        match fs::read(self.file(workdir)) {
            Ok(bytes) => Ok(serde_json::from_slice(&bytes).ok()), // arquivo corrompido = começa vazio
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(store_err(e)),
        }
    }

    fn save(&self, workdir: &Path, session: &StoredSession) -> Result<()> {
        fs::create_dir_all(&self.dir).map_err(store_err)?;
        let target = self.file(workdir);
        let tmp = target.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_vec(session).map_err(store_err)?).map_err(store_err)?;
        fs::rename(&tmp, &target).map_err(store_err)
    }
}
