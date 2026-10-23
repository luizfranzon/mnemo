# Revisão sem branch física, com dados no `.git` e refs ocultas

A Revisão não cria branch nem faz checkout. O diff de cada Rodada é calculado na hora: na primeira, do merge-base com a Base até a ponta; nas seguintes, do último Commit revisado até a ponta, só nos arquivos que também estão no diff líquido da branch (assim o que veio de um merge da Base ou de um rebase fica de fora). Rodadas, arquivos revisados e comentários ficam num JSON por branch em `<git-common-dir>/mnemo/reviews/`, e cada Rodada grava, já ao começar, `refs/mnemo/review/<branch>/round-<n>` apontando para o commit dela (o prefixo `round-` evita que a ref de `feature` se confunda com as de `feature/x`).

A ref oculta segura o commit contra `gc` e `fetch --prune` quando o dev faz force push, e o diff por árvore continua funcionando mesmo com o commit fora da branch. O JSON no `.git` comum segue a ADR 0005: vale para todos os worktrees, sobrevive a mover a pasta e nunca é commitado.

## Considered Options

- **Branch `code-review-<branch>` com squash mergeado na padrão**: rejeitado. Exige checkout ou worktree (esbarra no WIP e trava o uso do app), polui o grafo, para em conflito antes de revisar e fica velha a cada push do dev.
- **Diff contra o resultado do `merge-tree` com a Base**: rejeitado. Traz marcadores de conflito e muda a cada merge na Base, mesmo sem commit novo na branch.
- **Dados no `localStorage`**: rejeitado. Some ao mover o repo de pasta e não é compartilhado entre worktrees.
- **Dados no `.git/config`**: rejeitado. Comentários são texto livre e multilinha.
- **`git notes`**: rejeitado. A Revisão é pessoal e a API é ruim para dados estruturados.

## Consequences

- Hard to reverse: o formato do JSON e o nome das refs viram contrato com Revisões já gravadas.
- Apagar o `.git` (reclonar) perde todas as Revisões.
