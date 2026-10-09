# Mnemo

Git client desktop visual, local. Mostra o histórico como grafo e executa ações git com rótulos que nomeiam o alvo.

## Language

### Histórico

**Lane**:
Coluna vertical do grafo onde corre uma linha de desenvolvimento. Cada lane tem uma cor fixa, tirada da sequência de cores do grafo.
_Avoid_: trilha, coluna (coluna é do cabeçalho da tabela do grafo)

**WIP**:
As mudanças locais ainda não commitadas, mostradas como um nó tracejado acima do HEAD.
_Avoid_: rascunho, pendências

### Ações

**Operação**:
Uma ação git disparada pelo Mnemo (checkout, commit, reset, descartar…). Ela guarda o estado anterior dos refs e sabe como se inverter.
_Avoid_: comando, ação git (no código)

**Desfazer**:
Inverter a última Operação desfazível do repositório. Fica bloqueado quando o repositório mudou fora do Mnemo depois dela, e não existe para Operações que mexem no remoto (push, fetch, excluir remota).
_Avoid_: undo, reverter (revert é outra coisa no git)

**Mudança externa**:
Alteração de HEAD ou refs feita fora do Mnemo (terminal, outro app), detectada quando o estado atual não bate com o "depois" da última Operação.
