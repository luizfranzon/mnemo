# Histórico de arquivo e Blame

- Histórico: `git log --follow` paginado (seguindo renomeações), lista virtualizada, clique abre o diff do arquivo naquele commit; "Mostrar no grafo" carrega o grafo até o commit se ainda não estiver carregado.
- Blame: `git blame --porcelain` calculado no core; gutter com avatar/iniciais, autor, data relativa e resumo; agrupa linhas consecutivas do mesmo commit; clique seleciona o commit no grafo.
- Entradas: abas Diff/Blame/Histórico no visualizador (`01-features.md` § 7), menu do arquivo e prefixo na paleta (#27).
