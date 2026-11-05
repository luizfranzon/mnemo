# Ciclo do componente

Processo que cada componente do Mnemo segue até virar o componente central no Storybook. Complementa o `04-design-system.md`.

## Classificação

| Nível | O que é | Entra no Storybook |
|---|---|---|
| Fundamentos | Tokens: cor, espaço, raio, tipografia, elevação | Sempre, só docs |
| Primitivos | Sem domínio git e sem store; só props. Button, Input, Checkbox, Radio, Segmented, Chip, Icon, Avatar, Kbd | Sempre |
| Compostos | Montam primitivos, ainda sem domínio git. Menu, Dialog, Toast, faixas, FindBar | Sempre |
| Features e Telas | Conhecem commits, refs e diff. Graph, WipPanel, DiffView, RefPanel, Preferences, Workspace | Só depois de receber dados por props; a store e o `invoke` ficam num container fino |

O nível vira o prefixo do `title` da story: `Primitivos/Button`, `Compostos/Menu`.

## Convenções

- Arquivos lado a lado: `Button.tsx`, `Button.css`, `Button.stories.tsx`.
- CSS puro, importado pelo `.tsx`. Classes com prefixo do componente: `.btn`, `.btn--primary`, `.btn--sm`.
- Só tokens: nenhuma cor nem espaçamento literal fora de `design-system/tokens.json`. O `tokens.css` é gerado, não se edita à mão.
- Cada token só vale no escopo do nome. `--lane-*` é só das lanes do grafo, `--conflict-*` só dos estados de conflito, `--diff-*` só do diff, `--syn-*` só do highlight, `--ref-pill` só da pill de ref. Precisou da mesma cor em outro lugar: use o token semântico do papel (`--warning`, `--accent`...) ou crie um token novo com o nome do papel. Nunca pegue emprestado o token de outro escopo só porque o valor é parecido.
- Gap e padding usam `--space-*`. Valor literal em `px` só para dimensão fixa do componente, e a altura de linha usa os tokens `--h-*`.
- Elemento nu (`button`, `input`, `select`, `textarea`) não tem estilo global. Uso cru no app é duplicação.
- Stories em CSF 3, com tag `autodocs` herdada do `preview.ts`.

## O ciclo

Para cada componente, nesta ordem:

1. **Levantar.** Listar todos os usos no app (inclusive o elemento cru e classes parecidas) e as variações que existem hoje.
2. **Extrair.** Criar o componente com `variant` e `size` em união de strings, as props nativas repassadas e o CSS colado, só com tokens.
3. **Story.** Uma story por variante e por estado: padrão, hover, foco, desabilitado e, quando fizer sentido, carregando, erro e texto longo.
4. **Lapidar com o usuário.** Trazer os desvios contra o `04-design-system.md` e as melhorias de usabilidade. O usuário decide, e o perdedor (doc ou código) é corrigido.
5. **Checar a maturidade** (abaixo).
6. **Varrer.** Buscar todo uso que não passa pelo componente central: elemento cru, classe duplicada, componente parecido. Trocar pelo central e remover o CSS que sobrar.
7. **Commit.** Um commit por componente, com `tsc`, testes e `build-storybook` passando.

## Maturidade

O componente só é central, e só libera a varredura, quando cumpre os 7:

1. **Só tokens.** Nada de cor ou espaçamento literal no CSS dele.
2. **Variantes e estados em story**, incluindo conteúdo longo que quebra ou trunca.
3. **API pequena e tipada.** Sem `className` livre nem `style` vindo de fora; `...rest` nativo repassado.
4. **Teclado completo.** Foco visível (anel de 2px) e Enter, Espaço e setas conforme o padrão ARIA.
5. **A11y sem violações** no painel do Storybook. Componente só de ícone exige `aria-label`.
6. **Aderência ao doc.** Alturas, raios e cores batem com o `04-design-system.md`; divergência resolvida no passo 4.
7. **Render barato.** Sem estado desnecessário, sem assinar a store, compatível com o React Compiler.

## Testes

Teste de comportamento segue o `node:test` já usado (`bun run test`). Nome do teste descreve o comportamento do componente, sem citar tela ou consumidor.
