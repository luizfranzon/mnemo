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

## Distribuição

- Windows: NSIS (electron-builder), sem assinatura no MVP. `installer.nsh` oferece instalar o git via winget se faltar.
- Linux: `.deb` (`Depends: git`) e `.rpm` (`Requires: git`). Sem AppImage, Flatpak ou Snap.
- Atualização: electron-updater lendo GitHub Releases de um repo público só de releases (código fica privado). No Linux instala via `pkexec`.

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
