# Design system em Storybook, com tokens de uma camada e CSS colado ao componente

O design system vive no Storybook dentro de `app/`, reaproveitando o `vite.config.ts` do app. Os tokens ficam em `design-system/tokens.json` (formato DTCG), a única fonte; `bun run tokens` gera o `tokens.css`. Há uma camada só de tokens, semânticos (`--surface-1`, `--text-muted`, `--space-2`), e nenhuma cor ou espaçamento literal fora deles. Cada token só vale no escopo do nome (`--lane-*` só no grafo, `--conflict-*` só em conflito). Cada componente leva seu CSS puro ao lado (`Button.tsx` + `Button.css`, classes com prefixo `.btn--primary`), e elemento nu (`button`, `input`) não tem estilo global.

O Mnemo tem um tema escuro e uma plataforma, então uma camada de primitivos crus (`--gray-900`) seria indireção sem uso. Se um tema claro surgir, ela nasce nesse dia: os componentes só consomem tokens semânticos, e a refatoração é mecânica. O processo por componente está em `docs/design/05-ciclo-do-componente.md`.

## Considered Options

- **Tokens em três camadas (global, semântico, componente)**: rejeitado. A camada de componente é a mais debatida e só paga com vários temas ou marcas.
- **Style Dictionary v4 para gerar os tokens**: rejeitado por ora. Um script de ~20 linhas gera o único formato que usamos (CSS). Entra se houver outra plataforma de saída. Os tokens compostos (`shadow`, `border`, `gradient`) guardam o valor como string CSS, não como objeto DTCG, e precisam ser convertidos nesse dia.
- **CSS Modules**: rejeitado. Os nomes viram hash e quebram os seletores dos scripts e2e.
- **`styles.css` global organizado por seções**: rejeitado. O Storybook não provaria que o primitivo é autocontido.
- **Workspace separado para o Storybook**: rejeitado. Duplicaria a config do Vite e perderia o React Compiler.
- **`addon-vitest` e Chromatic**: fora do escopo. O projeto testa com `node:test`, e não há servidor de CI para regressão visual.
- **`react-docgen-typescript`**: não funciona com o TypeScript 7 (a API JS do compilador não existe mais). O Storybook usa o `react-docgen` padrão.

## Consequences

- Hard to reverse: a convenção de classe com prefixo e a regra de escopo dos tokens viram contrato com todo componente novo.
- Componente de Features e Telas só entra no Storybook depois de receber dados por props; a store e o `invoke` ficam num container fino.
- O `tokens.css` gerado não se edita à mão. Quem alterar o JSON roda `bun run tokens` e commita os dois.
