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

## Open questions

- Referências visuais e o que evitar (não informado).
- Público e mood são suposição (assumed).
- Tema claro existe na v1? (assumed: não)
- Overflow da barra de abas com muitas abas (encolher até um mínimo e rolar?) e estados de sistema (spinner de operação, pasta ausente) ainda não desenhados.
- Import dos demais componentes do código para o Doop: só Repo Tab e Tab Bar foram desenhados.
