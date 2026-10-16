# Mnemo — instruções para o Claude Code

Mnemo é um Git client desktop visual. Interface em **português do Brasil**.
Usa o design system em `app/design-system/`.

## Fonte de verdade

- Telas: `03-telas.md`
- Comportamento: `02-comportamentos.md`
- Escopo e prioridade: `01-features.md` (implementar MVP primeiro; não implementar itens "Fora")
- Visual: `04-design-system.md` + `app/design-system/tokens.css`

Se a descrição de tela e o doc de comportamento divergirem, o doc de comportamento vence. Pergunte antes de inventar tela nova.

## Stack

Decidida: ver `AGENTS.md` (raiz) e `docs/adr/0001` e `0002`. O git continua sendo o executável
do sistema, chamado como processo filho. Nada de reimplementar git.

## Regras de UI

- Usar só tokens de `app/design-system/tokens.css`. Nada de hex solto no componente.
- Cor só onde há estado ou ação. O resto é cinza. Estado = cor + texto/ícone, nunca só cor.
- Amarelo/âmbar sempre significa "sua vez / atenção". Verde: sucesso, commit, push. Azul: ação principal, pull, seleção.
- Um botão primário (azul) por área. Verde só para commitar/aprovar.
- Fontes: IBM Plex Sans (UI) e JetBrains Mono (código, SHA, branch, números).
- Ícones: traço 2px, grade 24, herdam a cor do texto. Tamanhos 14/16/18.
- Botões e controles reais (`<button>`, `<input>`, `<label>`); botão só com ícone leva `aria-label`.
- Contraste mínimo 4.5:1 no texto.
- Textos de botão não quebram linha (`white-space: nowrap`, corta com reticências).
- Rótulos de ações dizem o objeto: "Merge t34951 em t34949", "Push t34949", nunca só "Merge".
- Ações destrutivas (reset hard, excluir branch, descartar mudanças, esquecer credenciais) pedem confirmação e oferecem desfazer quando possível.

## Performance

- Grafo, listas de refs e diffs virtualizados (só desenha o visível). Repos reais têm 2.500+ branches remotas.
- Sem blur, `backdrop-filter` ou sombras grandes em listas. Animar só `transform` e `opacity`.
- Commits carregados sob demanda (padrão 2000, lazy load ao rolar).

## Escopo fora

Nada de conta, organização, times, cloud patches, upgrade, marketing. É um app local.
