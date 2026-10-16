# Telas do layout

Todas as telas foram pensadas em 1440×900 e usam os componentes compartilhados.

## Estrutura de toda tela de repositório

```
TopBar (118px)    título + menus · abas · toolbar do repo
├─ LeftPanel (264px) │ centro (Graph / Diff / …) │ painel direito (380–400px)
StatusBar (26px)
```
Telas sem repositório (Repositórios, Launchpad, Preferências) usam TopBar sem toolbar (70px).

## Telas

| # | Tela | Arquivo | Mostra |
|---|---|---|---|
| 1 | Grafo + detalhes do commit | mockup removido | grafo normal, commit selecionado, arquivos do commit |
| 2 | WIP: staging e commit | mockup removido | nó WIP selecionado, preparar/tirar, área de commit |
| 3 | Diff + menu do arquivo | mockup removido | painel esquerdo recolhido em rail, diff lado a lado com syntax highlight, menu do arquivo aberto |
| 4 | Menu da branch | mockup removido | clique direito em `t34951` no painel |
| 5 | Menu do commit | mockup removido | clique direito num commit, submenu Reset aberto |
| 6 | Notificações + toast | mockup removido | popover do sino agrupado por repo, toast com Desfazer |
| 7 | Paleta de comandos | mockup removido | `Ctrl+P` com busca "hom" |
| 7b | Colunas e grafo compacto | mockup removido | popover da engrenagem do grafo, grafo em modo compacto |
| 8 | Repositórios | mockup removido | nova aba: favoritos, abertos, encontrados, seleção em lote |
| 9 | Clonar | mockup removido | modal sobre a tela 8 |
| 10 | Launchpad | mockup removido | WIPs de todos os repos + issues |
| 11 | Preferências: Geral | mockup removido | |
| 12 | Preferências: Aparência | mockup removido | tema, densidade, datas com prévia, colunas |
| 13 | Preferências do repo: Commit | mockup removido | badges "deste repo"/"global", modelo de mensagem |
| 14 | Resolução de conflito | mockup removido | faixa âmbar, Atual x Entrando, Resultado |
| 15 | Rebase interativo | mockup removido | interativo: troca pick/squash/drop e o resumo muda |

## Componentes compartilhados

| Componente | Arquivo | Props |
|---|---|---|
| Barra superior | mockup removido | `tab`, `toolbar`, `repo`, `sub`, `branch`, `behind`, `ahead` |
| Barra de status | mockup removido | `message` |
| Painel de refs | mockup removido | `current`, `focus` |
| Grafo | mockup removido | `selected` (índice da linha), `compact` |
| Menu das preferências | mockup removido | `active` |
| Checkbox | mockup removido | estados de referência |

## Dados de exemplo

Os desenhos originais usavam dados reais do autor para testar densidade. Ao implementar, usar dados vindos do git.

## Grafo: geometria do desenho original

- Linha: 28px. Lane: 16px de passo, primeira lane em x=12.
- Nó normal: avatar 20px com borda 2px na cor da lane. Nó compacto: ponto r=5; merge: anel r=4.
- HEAD: anel extra azul. WIP: círculo tracejado cinza.
- Conector da pill até o nó: linha fina na cor da lane, 55% de opacidade.
- Cores das lanes (em ordem): `#4fb3d9 #d65bd0 #e5534b #e0a43a #5b8def #46b866 #c4a7f5 #f08a5d`.
