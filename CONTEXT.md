# Mnemo

Git client desktop visual, local. Mostra o histórico como grafo e executa ações git com rótulos que nomeiam o alvo.

## Language

### Janela

**Aba**:
Um diretório de trabalho aberto: o repositório principal ou um worktree. O mesmo diretório nunca fica aberto em duas abas, e abrir um worktree abre uma aba nova ou foca a que já existe. A única mudança de diretório permitida é entrar num submódulo e voltar ao pai. Cada nível (repositório e cada submódulo) tem HEAD, WIP e Histórico de Operações próprios, e a aba mostra o nível em que está.
_Avoid_: janela, projeto

**Favorito**:
Repositório marcado pelo usuário como de interesse mesmo quando está fechado. Favoritos recebem fetch automático e notificações como se estivessem abertos.
_Avoid_: fixado, pinned

### Histórico

**Lane**:
Coluna vertical do grafo onde corre uma linha de desenvolvimento. Cada lane tem uma cor fixa, tirada da sequência de cores do grafo.
_Avoid_: trilha, coluna (coluna é do cabeçalho da tabela do grafo)

**Pill**:
Rótulo de uma ref no grafo, na coluna Branch / Tag. Cada branch tem uma pill: a remota que a local rastreia entra na pill dela (💻☁). Remota de outro remoto, remota sem local e tag têm pill própria, com o nome completo. Duplo clique numa pill de branch faz checkout da branch (nunca do commit, que deixaria o HEAD destacado); tag não tem duplo clique.
_Avoid_: card, tag (tag é a ref `refs/tags`)

**Pills de um commit**:
Quando um commit tem várias pills, só a primeira aparece, mais um chip `+N` com as demais; passar o mouse sobre o conjunto abre a lista sobreposta, sem mudar a altura da linha. Ordem: branch atual, local com remota, só local, só remota, tags; alfabética dentro do nível.

**Visibilidade inteligente**:
Modo do grafo que mostra só a branch atual e a Base dela. Commits mergeados nelas aparecem por fazerem parte da história; as outras branches não ganham pill.
_Avoid_: filtro inteligente, modo foco

**WIP**:
As mudanças locais ainda não commitadas, mostradas como um nó tracejado acima do HEAD.
_Avoid_: rascunho, pendências

**Base**:
A branch de onde uma branch saiu. O Mnemo registra a base quando cria a branch, sempre pelo nome sem o remoto (saiu de `origin/12.x` → base `12.x`). Se a branch foi criada fora do Mnemo ou a partir de um commit solto, vale a branch padrão do repositório. O usuário pode trocar a base.
_Avoid_: upstream (upstream é a remota que a branch rastreia), branch pai

### Identidade

**Perfil**:
Identidade de quem commita: nome, email e chave de assinatura. Um perfil fica ativo para todos os repositórios, e um repositório pode fixar outro. A escolha vale também para o git usado fora do Mnemo. O que vale no fim é a identidade configurada no git: se ela não bater com nenhum perfil, o Mnemo mostra essa identidade como está e não a sobrescreve.
_Avoid_: conta, usuário

### Ações

**Operação**:
Uma ação git disparada pelo Mnemo (checkout, commit, reset, descartar…). Ela guarda o estado anterior dos refs e sabe como se inverter. Cada repositório roda uma Operação por vez. Preparar e tirar arquivos do stage não são Operações. Um merge ou rebase parado em conflito ainda não é uma Operação: ele só entra no Histórico quando é concluído (e aí se desfaz inteiro) ou abortado.
_Avoid_: comando, ação git (no código)

**Desfazer**:
Inverter a última Operação desfazível do repositório. Operações de refs feitas antes de uma Mudança externa não podem mais ser desfeitas. Desfazer não existe para Operações que mexem no remoto (push, fetch, excluir remota). Descartar mudanças do WIP também é desfazível. Desfazer um pull volta só a branch local; as refs remotas ficam como o fetch deixou.
_Avoid_: undo, reverter (revert é outra coisa no git)

**Refazer**:
Reaplicar a Operação que acabou de ser desfeita. Só existe logo depois de um Desfazer: qualquer Operação nova descarta o que havia para refazer. Segue o mesmo bloqueio por Mudança externa.
_Avoid_: redo

**Histórico de Operações**:
As Operações recentes de um repositório, das quais o Desfazer tira a última. Continua existindo depois que o app fecha e abre de novo, e guarda só as mais recentes.
_Avoid_: log, undo stack

**Mudança externa**:
Alteração de HEAD ou refs feita fora do Mnemo (terminal, outro app), detectada quando o estado atual não bate com o "depois" da última Operação. Ela tira do Histórico de Operações as Operações de refs anteriores a ela. Descartes anteriores continuam desfazíveis, porque não dependem de refs.

**Log de diagnóstico**:
Arquivos de texto, um por dia, na pasta de dados do app, para depurar o que rodou e o que falhou. Registra as Operações, os comandos git executados (com credenciais de URL mascaradas) e os erros inesperados com stacktrace. É descartável: os de mais de 7 dias são apagados, e apagar a pasta não afeta nada. Não tem relação com o Histórico de Operações.
_Avoid_: log (sozinho, confunde com Histórico de Operações)
