# Electron na interface, lógica em Rust via napi-rs

O Mnemo precisa rodar em Windows e Linux com a mesma renderização. No Linux, o Tauri estável usa WebKitGTK, e isso obrigaria a manter dois motores de renderização. A alternativa daemon + navegador perde menus e atalhos nativos. Por isso a interface roda em Electron. A meta é migrar para o Tauri quando o runtime CEF amadurecer, então toda a lógica (chamadas ao git, parse, lanes do grafo, watcher, preferências) fica num crate Rust puro (`mnemo-core`), exposto ao Electron por um adaptador fino em napi-rs. A UI fala com o backend só por `invoke(cmd, args)` e `listen(evento, cb)`, no mesmo formato da API do Tauri. Assim, a migração troca só o adaptador e o import da ponte.

## Considered Options

- **Tauri agora**: rejeitado, porque o WebKitGTK no Linux renderiza diferente do WebView2 no Windows.
- **Tauri + CEF / Verso (Servo)**: rejeitados por enquanto, porque ainda são experimentais.
- **Daemon local + Chrome `--app`**: rejeitado por perder menu na barra de título e atalhos como `Ctrl+W`/`Ctrl+T`, e por exigir a segurança de um servidor local.
- **Backend em TypeScript**: rejeitado, porque a migração para o Tauri obrigaria a reescrever o backend.
- **Sidecar Rust (stdio/JSON-RPC)**: rejeitado. No Tauri o core é chamado direto, e a fronteira de processo seria jogada fora.

## Consequences

- Um panic no addon derrubaria o processo main. Mitigação: `#[napi(catch_unwind)]` em todo export, `Result` em todo o core, `clippy::unwrap_used = deny` e `#![forbid(unsafe_code)]`. Isolamento via `utilityProcess` só se aparecer um crash real.
- O CI precisa compilar o addon nativo para Windows e Linux.
- O git continua sendo o executável do sistema, chamado como processo filho. O core não reimplementa git.
