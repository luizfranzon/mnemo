# TODO: Storybook e design system (descartável)

Apagar quando a PR for mergeada. Decisões completas: ADR 0009 (a escrever) e `05-ciclo-do-componente.md`.

Branch: `design-system-storybook` (saiu da `0.6.0`). Uma PR, um commit por componente.

## Setup
- [x] Branch criada
- [x] Storybook 10.6.5 (`react-vite`, `addon-docs`, `addon-a11y`)
- [x] `.storybook/main.ts` e `preview.ts`
- [x] Scripts `storybook` e `build-storybook`, `storybook-static/` ignorado
- [x] Story `Fundamentos/Cores` (superfícies, bordas, texto)
- [x] `bun run storybook` roda no navegador
- [ ] Conferir se o painel a11y acusa algo nas amostras

## Tokens
- [x] `tokens.json` (DTCG) completo, com tudo que só existia no `tokens.css`
- [x] `bun run tokens` gera `tokens.css` a partir do JSON; regras que não são token foram para `design-system/base.css`
- [x] Meio-passos de espaço: `--space-0-5` (2), `--space-1-5` (6), `--space-2-5` (10)
- [x] Trocar os hex soltos do `styles.css`, `WipPanel.tsx` e `Graph.tsx` por tokens (sobra só 1 hex em `electron/main.ts`)
- [x] Regra de escopo dos tokens no `05-ciclo-do-componente.md`
- [x] Gaps, paddings e margens do `styles.css` só com `--space-*` (sobram os `paddingLeft: n + depth * 14` de árvore em `CommitPanel`, `WipPanel` e `StashApplyDialog`, a tratar nos componentes)
- [x] Stories de Fundamentos: Cores, Tipografia, Espaço, Raio, Elevação, Foco, Alturas
- [ ] Ícones: story entra com o primitivo Icon (exportar a lista de nomes)

## Documentação
- [x] ADR 0009: design system em Storybook, tokens de uma camada, CSS colado ao componente
- [x] Taxonomia (Fundamentos, Primitivos, Compostos, Features/Telas) no `04-design-system.md`
- [x] Mencionar o Storybook e o ciclo no `AGENTS.md`

## Primitivos (ordem do plano)
- [ ] Button e IconButton (161 `<button>` crus no app)
- [ ] Input, Textarea, Select, Checkbox, Radio (30 `<input>`, 5 `<textarea>`, 2 `<select>`)
- [ ] Icon (já existe, 100 usos), Avatar, Kbd (7 usos), Chip/Badge
- [ ] Segmented (já existe)
- [ ] Remover estilo global de `button`, `input`, `select`, `textarea` do `styles.css`

## Compostos
- [ ] Menu
- [ ] Dialog (casca dos `*Dialogs`; `DiscardDialogs` usa `.modal`)
- [ ] Toast
- [ ] Faixa de estado (`PushRejectedBar`, merge/rebase em andamento)
- [ ] FindBar, SubmoduleCard, Breadcrumb

## Features e Telas
Só entram quando recebem dados por props (store e `invoke` num container fino).
- [ ] Mapear quais já estão prontos e quais precisam separar o container
- [ ] Graph, WipPanel, DiffView, RefPanel, ReviewPanel, Preferences, Workspace

## Ao fechar
- [ ] `tsc --noEmit`, `bun run test` e `build-storybook` passando
- [ ] e2e que dependem de seletor de classe ainda passam
- [ ] Apagar este arquivo
