# Seleção de vários commits e comparação

- Seleção múltipla no grafo com `Ctrl`+clique e `Shift`+clique (intervalo topológico). `Esc` volta à seleção única.
- Painel direito mostra a lista de arquivos do intervalo e abre o diff do visualizador existente.
- Diff entre 2 commits: `git diff A B`. Diff mesclado de N commits: do pai do mais antigo até o mais novo, desde que sejam contínuos na mesma linha. Seleção não contínua mostra a lista sem diff mesclado.
- Ações em lote no menu: cherry-pick, squash, drop (ligam ao rebase interativo), criar patch.
