//! Adaptador napi-rs fino: só traduz JS ↔ `mnemo-core`. Nenhuma regra mora aqui.
//! Todo export usa `catch_unwind`: um panic vira `Error` em JS, não derruba o processo main.

use mnemo_core::application::ports::{CoreEvent, EventSink};
use mnemo_core::{CoreError, Mnemo};
use napi::bindgen_prelude::{AsyncTask, Env, Task};
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi::{Error, Status};
use napi_derive::napi;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::{Arc, OnceLock};

type EventCallback = ThreadsafeFunction<String, (), String, Status, false>;

static CORE: OnceLock<Arc<Mnemo>> = OnceLock::new();

struct JsEventSink(EventCallback);

impl EventSink for JsEventSink {
    fn emit(&self, event: CoreEvent) {
        if let Ok(json) = serde_json::to_string(&event) {
            self.0.call(json, ThreadsafeFunctionCallMode::NonBlocking);
        }
    }
}

/// Liga o core. `data_dir` guarda o Histórico de Operações; `on_event` recebe eventos em JSON.
#[napi(catch_unwind)]
pub fn init(data_dir: String, on_event: EventCallback) -> napi::Result<()> {
    let core = Arc::new(Mnemo::new(data_dir, Arc::new(JsEventSink(on_event))));
    CORE.set(core).map_err(|_| Error::new(Status::GenericFailure, "o core já foi iniciado"))
}

pub struct InvokeTask {
    cmd: String,
    args: String,
}

impl Task for InvokeTask {
    type Output = String;
    type JsValue = String;

    /// Roda no pool de threads do libuv, sem bloquear o processo main do Electron.
    fn compute(&mut self) -> napi::Result<String> {
        let core = CORE.get().ok_or_else(|| Error::new(Status::GenericFailure, "o core não foi iniciado"))?;
        let outcome = catch_unwind(AssertUnwindSafe(|| {
            let args: serde_json::Value =
                serde_json::from_str(&self.args).map_err(|e| CoreError::InvalidInput { reason: e.to_string() })?;
            core.invoke(&self.cmd, args)
        }))
        .unwrap_or_else(|_| Err(CoreError::internal("pânico no core")));
        match outcome {
            Ok(value) => Ok(value.to_string()),
            Err(e) => Err(Error::new(Status::GenericFailure, error_json(&e))),
        }
    }

    fn resolve(&mut self, _env: Env, output: String) -> napi::Result<String> {
        Ok(output)
    }
}

/// `invoke(cmd, argsJson)` → Promise<string JSON>. Em erro, a mensagem é um JSON `{code, message, …}`.
#[napi(catch_unwind)]
pub fn invoke(cmd: String, args_json: String) -> AsyncTask<InvokeTask> {
    AsyncTask::new(InvokeTask { cmd, args: args_json })
}

fn error_json(e: &CoreError) -> String {
    let mut value = serde_json::to_value(e).unwrap_or_else(|_| serde_json::json!({ "code": "internal" }));
    if let Some(obj) = value.as_object_mut() {
        obj.insert("message".into(), e.to_string().into());
    }
    value.to_string()
}
