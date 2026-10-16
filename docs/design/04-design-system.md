# Design system

Este doc é a fonte do design system. Tokens prontos em `app/design-system/tokens.css` e `tokens.json`.

**Tema escuro, denso e calmo**, feito para passar horas olhando histórico e diff.

## Princípios

1. **Calmo por padrão.** Cor só onde há estado ou ação. O resto é cinza.
2. **Estado = cor + texto/ícone.** Nunca só a cor. Âmbar sempre significa "sua vez / atenção".
3. **Uma ação principal por área.** Um botão azul. Verde só para commitar/aprovar.
4. **Sem blur nem sombras grandes em listas.** Animar só `transform` e `opacity`.

## Cores

### Superfícies
| Token | Hex | Uso |
|---|---|---|
| `bg-rail` | `#0B0B0C` | barra de título, abas, status |
| `bg` | `#0E0E0F` | fundo da página, grafo |
| `surface-1` | `#121213` | toolbar, painéis laterais, inputs |
| `surface-2` | `#141415` | cards, área de commit, cabeçalho de grupo |
| `surface-3` | `#18181A` | popover, menu, card sobre coluna |
| `control` | `#1C1C1E` | botão secundário |
| `hover` | `#1F1F21` | hover de item |
| `selected` | `#232326` | item atual |
| `active` | `#2A2A2D` | segmento ativo, trilho |

### Bordas e texto
| Token | Hex | Uso |
|---|---|---|
| `border-subtle` | `#1F1F21` | divisória interna |
| `border` | `#232325` | painéis |
| `border-strong` | `#2C2C2F` | inputs, botões, menus |
| `text` | `#E8E6E3` | principal (15.6:1) |
| `text-secondary` | `#C9C6C0` | corpo em listas |
| `text-muted` | `#9C9992` | descrições (6.6:1) |
| `text-subtle` | `#8A877F` | metadados (5.1:1) |
| `text-disabled` | `#6F6C66` | só texto não essencial |

### Ação e estados
| Papel | Base | Texto | Fundo | Uso |
|---|---|---|---|---|
| accent | `#5B8DEF` (primário `#3D6FE0`, link `#8FB2FF`) | `#DFE7FF` | `#22325A` | botão principal, foco, seleção, Pull, linha selecionada do grafo |
| warning | `#E0A43A` | `#F0C06A` | `#3A2F18` | sua vez, modificado (✎), merge/rebase em andamento |
| success | `#46B866` (sólido `#2F9A4A`, botão commit `#237A3B`) | `#7FDC95` | `#173020` | adicionado, commit, Push, branch atual |
| danger | `#E5534B` | `#F0877F` | `#2A1414` | excluir, removido, erro |
| ai | `#C4A7F5` | `#D5C2FA` | `#2A2440` | ações com IA |

Item de menu destacado: fundo `#2B3A5E`, texto `#FFFFFF`.

### Diff
| | Fundo da linha | Fundo do nº |
|---|---|---|
| adicionada | `#3FB950` 10% | `#3FB950` 15% |
| removida | `#F85149` 11% | `#F85149` 15% |
| vazio (lado a lado) | listras `#141415`/`#1A1A1C` a 135° | |

Conflito: lado Atual âmbar `#E0A43A` 12%, lado Entrando azul `#5B8DEF` 12%.

### Lanes do grafo
`#4fb3d9 #d65bd0 #e5534b #e0a43a #5b8def #46b866 #c4a7f5 #f08a5d`
Pill de ref: fundo = cor da lane a 18% (`2e`), borda = cor a 50% (`80`), texto `#E8E6E3`, mono 11px, altura 20, raio 4.

### Syntax highlight (cores do tema VSCode "Min Darkest Dracula")
| Token | Cor |
|---|---|
| palavra-chave (`const`, `import`, `then`) e operador (`=`, `=>`, `??`, `<`) | `#FF79C6` |
| string | `#F1FA8C` |
| constante (`UPPER_CASE`, número, `this`, `null`, `true`, nome declarado com `const`/`readonly`) | `#BD93F9` |
| tipo / classe (`PascalCase`) | `#8BE9FD` |
| chamada de função (`nome(` ou `nome<T>(`) | `#50FA7B` |
| comentário | `#6272A4` |
| pontuação e resto | `#F8F8F2` |
Mesma paleta do tema do VSCode, pra o diff e o editor de conflito lerem igual ao editor. Os papéis vêm do parser da linguagem (Lezer, do CodeMirror) escolhido pela extensão do arquivo; sem parser, cai num highlight genérico por regex.

### Avatares
Avatares de pessoa: fundo escuro + iniciais na cor clara do mesmo matiz (ex.: `#3A2A22`/`#E8A07F`, `#1F2A2A`/`#7FD4C8`, `#2A2440`/`#D5C2FA`, `#173020`/`#7FDC95`).

## Tipografia

**IBM Plex Sans** para interface. **JetBrains Mono** para código, SHA, branch, caminhos, contadores e números (tabulares).

| Estilo | Tamanho / peso | Uso |
|---|---|---|
| display | 40 / 600 / −1.5% | — |
| title-1 | 22 / 600 | título de tela |
| title-2 | 16 / 600 | título de diálogo |
| body | 14 / 400 / 1.5 | texto corrido |
| body-sm | 13 / 400 | listas, menus, botões |
| caption | 12 / 400 muted | metadados |
| overline | 11 / 600 / +6% caixa alta | cabeçalho de seção ("LOCAL", "PREPARADOS") |
| code | 12–12.5 / 400 mono | diff, SHA, branch |

## Espaço, raio, elevação

- Espaçamento base 4: 4, 8 (gap de chips), 12 (padding de card), 16 (painel), 20, 24 (conteúdo), 32, 48 (entre seções).
- Raio: 4 (checkbox, pill), 6 (chip, item de menu), 8 (botão, input), 10 (menu), 12 (card, diálogo), full (badge, avatar).
- Elevação: flat em listas · menu `0 12px 32px rgba(0,0,0,.5)` · diálogo `0 24px 60px rgba(0,0,0,.6)`.
- Foco: anel 2px `#5B8DEF`, offset 2px.
- Altura de linha: grafo 28, lista de arquivos 26–28, item de menu 30, linha de diff 20.

## Ícones

Traço 2px, grade 24, cantos arredondados, herdam `currentColor`. Tamanhos 14 (inline), 16 (listas), 18 (barra). Nada de emoji.

## Componentes

### Botão
| Variante | Estilo |
|---|---|
| primary | fundo `#3D6FE0`, texto branco |
| secondary | fundo `#1C1C1E`, borda `#2C2C2F`, texto `#E8E6E3` |
| ghost | transparente, texto `#C9C6C0` |
| success | fundo `#237A3B`, texto branco (só commitar/aprovar) |
| danger | fundo `#2A1414`, borda `#5A2422`, texto `#F0877F` |
| ai | fundo `#2A2440`, borda `#3A3258`, texto `#D5C2FA` |
Tamanhos: sm 28 · md 32 · lg 40. Só ícone: `aria-label` obrigatório. Texto não quebra.

### Input
Altura 32–36, fundo `#121213` (ou `#0E0E0F` dentro de painel), borda `#2C2C2F`, raio 8. Foco: borda `#5B8DEF` + anel `0 0 0 2px #22325A`. Placeholder `#8A877F`.

### Checkbox
16px, raio 4. Desmarcado: fundo e borda do input (`#121213` / `#2C2C2F`). Hover: borda `#55535A`, fundo `#18181A`.
Marcado: `#3D6FE0` com check branco (hover `#4A7BEA`). Foco: anel 2px. Desabilitado: 45% de opacidade.
Com texto de ajuda: alinha ao topo da primeira linha. CSS pronto em `tokens.css`.

### SegmentedControl
Trilho `#0E0E0F` com borda `#232325`, raio 8, padding 2. Segmento ativo `#2A2A2D`, texto `#E8E6E3`; inativo transparente `#9C9992`.

### Chip / badge
Altura 20–22, raio 10–11, fundo tint do estado + texto do estado. Ex.: "✎ 5 modificados" (warning), "+ 12 adicionados" (success), "ready-for-agent" (success).

### Menu de contexto / popover
Fundo `#18181A`, borda `#2C2C2F`, raio 10, padding 6, sombra de menu. Item 30px, raio 6. Separador 1px `#232325` com margem 4×6. Cabeçalho com o alvo em mono.

### Toast
Fundo `#18181A`, borda `#2C2C2F`, raio 10, ícone de estado + título + linha de detalhe + ação (Desfazer) + fechar.

### Faixa de estado (merge/rebase em andamento)
42px, fundo `#3A2F18`, borda inferior `#5A4A24`, texto `#F0C06A`, ações Abortar (outline) e Concluir.

### Painel lateral de seções (refs)
Cabeçalho de seção 30px, overline, contador mono `#8FB2FF`. Item 26px, raio 6, indentado 34px. Atual: fundo `#173020` + check verde. Foco/menu aberto: fundo `#22325A`.

### Abas
33px, raio 6 em cima. Ativa: fundo da superfície abaixo + linha azul de 2px em cima. Inativa transparente `#9C9992`. Contador ✎ em âmbar mono.
