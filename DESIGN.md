# Design do Mnemo

Brief mínimo, escrito a partir do README, CONTEXT.md e `app/design-system/tokens.css`. Lacunas marcadas com (assumed).

## Product

Git client desktop visual e local. Histórico como grafo, ações git com rótulos que nomeiam o alvo, Desfazer para as Operações. Electron + React. Design no Doop: https://doop.design/c/CiixHLSCX3 (incompleto, vai ganhando telas aos poucos).

## Audience and voice

Devs que usam git todo dia, em vários repositórios e worktrees ao mesmo tempo (assumed). Interface em pt-BR, direta, rótulos que nomeiam o alvo.

## Mood

Ferramenta densa, calma, escura (assumed). Neutros quase pretos, um único accent azul, sem decoração.

## Brand

Design system source: `app/design-system/tokens.css` (tokens.json espelha). Tema escuro único. Fonte UI IBM Plex Sans, mono JetBrains Mono. Accent `--accent` #5B8DEF. Escala de espaço base 4. Raios 4/6/8/12.

## References

Nenhuma informada (assumed: nenhuma). Pedir quando houver.

## Constraints

- Só tokens do `tokens.css`; valor novo passa por decisão.
- Listas virtualizadas, interação a 60fps com ref + CSS variable (AGENTS.md).

## Decisions log

- 2026-11-24: entrevista pulada a pedido; brief mínimo.
- 2026-11-24: tokens de cor e espaçamento do `tokens.css` importados no Doop.
- 2026-11-24: abas de repositório viram pílulas de duas linhas (repo + ponto de status em cima, branch embaixo), com chip WORKTREE nas abas de worktree. Escolhida entre pílulas, duas linhas e rail vertical, pedindo uma abordagem mais moderna e com mais informação. Aplicada nos componentes Repo Tab e Tab Bar do Doop; o código do app ainda não mudou.
- 2026-11-24: primitivos e padrões reutilizáveis redesenhados no Doop a partir do código (Button, Icon Button, Checkbox, Radio, Text Field, Select, Segmented, Count Badge, Avatar, Breadcrumb, Tab, Menu Item, Menu, Toast, Dialog, Popover). Tokens `--font-mono`, `--fs-*` e `--h-*` que faltavam foram adicionados. Telas e painéis grandes ficaram de fora.
- 2026-11-24: padrões de tela redesenhados no Doop a partir do código, compostos com os primitivos via `<doop-use>`: Title Bar, Toolbar, Toolbar Button, Status Bar, Banner, Empty State, Chip, Palette, Palette Row, Refs Panel, Refs Section Head, Refs Row, Submodule Card, Graph Header, Graph Row, Graph Pill, Find Bar, Author Row, Encoding Row, Commit Head, File Row, WIP Head, WIP Section Head, WIP Compose, Diff Head, Diff Line, Diff Hunk, Review Note, Conflict Head, Prefs Nav Item e os diálogos Confirm, Force Push, Push, Checkout, Name, Delete Branch, Stash Apply e Review Start.

## Open questions

- Referências visuais e o que evitar (não informado).
- Público e mood são suposição (assumed).
- Tema claro existe na v1? (assumed: não)
- Overflow da barra de abas com muitas abas (encolher até um mínimo e rolar?) e estados de sistema (spinner de operação, pasta ausente) ainda não desenhados.
- Só no código, sem componente no Doop: composições de tela inteira (App, Workspace, Panels, SplitScroll), o editor de resultado do conflito (ResultEditor, CodeMirror), Preferences e ReviewPanel completos, o painel de detalhes do commit montado, e as linhas virtualizadas (WipRows, árvore de arquivos) além do File Row. Viram frames montados com os componentes quando houver tela para desenhar.
- Estados não desenhados: hover de `.refs-more` e `.refs-eye`, Graph Row com refs múltiplas (`+N`), Segmented com 3+ opções, Toolbar em largura estreita (menu "mais"), Review Note com sugestão e composer.
- `--h-tabs` no canvas (36px) diverge do código (56px).
- Storybook só roda local: import_storybook não alcança. Publicar o build ou usar a CLI do Doop daria variantes reais.
