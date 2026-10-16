## Agent skills

### Issue tracker

Issues no GitHub Issues (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Vocabulário padrão (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context (`CONTEXT.md` + `docs/adr/` na raiz). See `docs/agents/domain.md`.

## Stack

Electron + `mnemo-core` em Rust via napi-rs (ADR 0001). UI em React 19 + TS + Vite, React Compiler, Zustand, TanStack Virtual (ADR 0002).

- UI fala com o backend só por `invoke(cmd, args)` / `listen(evento, cb)` (formato da API do Tauri). Nenhum componente importa `electron`.
- `mnemo-core` não conhece Electron nem napi. Todo export napi usa `#[napi(catch_unwind)]`.
- Git: executável do sistema (processo filho), verificado ao abrir. Nada de git embutido no MVP.

## Argus (regra)

Mnemo e Argus são apps diferentes e não correlatos. Nada do Argus entra no Mnemo: sem integração, feature, notificação, referência em docs ou dado de exemplo, nem na v2.

## Agentes de código (regra)

Nada de integração com agentes de código (Claude Code, Codex etc.): sem aba Agentes, sem sessão de agente em worktree, sem notificação de agente, nem na v2. Worktrees continuam existindo como recurso de git puro. IA para explicar commit e gerar mensagem (v2) não é agente e continua no escopo.

## Distribuição

- Windows: NSIS (electron-builder), sem assinatura no MVP. `installer.nsh` oferece instalar o git via winget se faltar.
- Linux: `.deb` (`Depends: git`) e `.rpm` (`Requires: git`). Sem AppImage, Flatpak ou Snap.
- Repositório público (MIT). As Releases ficam no próprio repo (ADR 0007).
- Atualização: electron-updater lendo as Releases do repo. No Linux instala via `pkexec`.

## Fluxo de mudança (regra)

A `main` é protegida: só entra por PR, com o CI verde, em squash merge. Nunca dar push direto na `main`.

- Uma branch por tarefa, commits pequenos, `gh pr create`. O merge é do usuário.
- Release: subir a versão em `app/package.json` e `Cargo.toml` (iguais) e acrescentar a seção `## [x.y.z]` no `CHANGELOG.md`. O CI falha se divergirem ou faltar a seção. No merge, a Release `vx.y.z` sai sozinha se a tag ainda não existe.
- Títulos de PR e o `CHANGELOG.md` são públicos: sem detalhes internos.

## React: evitar re-render desnecessário (regra)

Sempre pensar no custo de render antes de escrever um componente.

- Listas (grafo, refs, arquivos, diff) sempre virtualizadas com TanStack Virtual. `key` estável (SHA, nome da ref, caminho), nunca índice.
- Estado vivo no Zustand, lido com seletor da fatia mínima (`useStore(s => s.selectedSha)`). Nada de assinar a store inteira. Seletor que devolve objeto/array usa `useShallow`.
- Context só para valores estáveis (tema, ponte `invoke`). Nunca estado que muda com frequência.
- Interação a 60fps (arrastar divisor/coluna, scroll, hover) usa `ref` + CSS variable/`transform`, e grava no estado só ao soltar.
- Dados derivados pesados (lanes do grafo, parse de diff) vêm prontos do `mnemo-core`, não são recalculados em componente.
- Confiar no React Compiler. `memo`/`useMemo`/`useCallback` manuais só com medição que justifique.
- Estado o mais perto possível de quem usa. Não subir estado para o topo "por garantia".
- Desconfiou de re-render, medir com o React DevTools Profiler (Highlight updates) antes de otimizar.
