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
| 1 | Grafo + detalhes do commit | `Main.dc.html` | grafo normal, commit selecionado, arquivos do commit |
| 2 | WIP: staging e commit | `WIP.dc.html` | nó WIP selecionado, preparar/tirar, área de commit |
| 3 | Diff + menu do arquivo | `Diff.dc.html` | painel esquerdo recolhido em rail, diff lado a lado com syntax highlight, menu do arquivo aberto |
| 4 | Menu da branch | `MenuBranch.dc.html` | clique direito em `t34951` no painel |
| 5 | Menu do commit | `MenuCommit.dc.html` | clique direito num commit, submenu Reset aberto |
| 6 | Notificações + toast | `Notificacoes.dc.html` | popover do sino agrupado por repo, toast com Desfazer |
| 7 | Paleta de comandos | `Paleta.dc.html` | `Ctrl+P` com busca "hom" |
| 7b | Colunas e grafo compacto | `GraphColunas.dc.html` | popover da engrenagem do grafo, grafo em modo compacto |
| 8 | Repositórios | `Repositorios.dc.html` | nova aba: favoritos, abertos, encontrados, seleção em lote |
| 9 | Clonar | `Clonar.dc.html` | modal sobre a tela 8 |
| 10 | Launchpad | `Launchpad.dc.html` | WIPs de todos os repos + issues |
| 11 | Preferências: Geral | `PrefGeral.dc.html` | |
| 12 | Preferências: Aparência | `PrefAparencia.dc.html` | tema, densidade, datas com prévia, colunas |
| 13 | Preferências do repo: Commit | `PrefCommit.dc.html` | badges "deste repo"/"global", modelo de mensagem |
| 14 | Resolução de conflito | `Conflito.dc.html` | faixa âmbar, Atual x Entrando, Resultado |
| 15 | Rebase interativo | `Rebase.dc.html` | interativo: troca pick/squash/drop e o resumo muda |

## Componentes compartilhados

| Componente | Arquivo | Props |
|---|---|---|
| Barra superior | `TopBar.dc.html` | `tab`, `toolbar`, `repo`, `sub`, `branch`, `behind`, `ahead` |
| Barra de status | `StatusBar.dc.html` | `message` |
| Painel de refs | `LeftPanel.dc.html` | `current`, `focus` |
| Grafo | `Graph.dc.html` | `selected` (índice da linha), `compact` |
| Menu das preferências | `PrefSidebar.dc.html` | `active` |
| Checkbox | `Checkbox.dc.html` | estados de referência |

## Dados de exemplo

Os desenhos originais usavam dados reais do autor para testar densidade. Ao implementar, usar dados vindos do git.

## Grafo: geometria do desenho original

- Linha: 28px. Lane: 16px de passo, primeira lane em x=12.
- Nó normal: avatar 20px com borda 2px na cor da lane. Nó compacto: ponto r=5; merge: anel r=4.
- HEAD: anel extra azul. WIP: círculo tracejado cinza.
- Conector da pill até o nó: linha fina na cor da lane, 55% de opacidade.
- Cores das lanes (em ordem): `#4fb3d9 #d65bd0 #e5534b #e0a43a #5b8def #46b866 #c4a7f5 #f08a5d`.
