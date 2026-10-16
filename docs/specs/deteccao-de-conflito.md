# Detecção proativa de conflito

- Usa a Base da branch (CONTEXT.md). Após cada fetch, roda `git merge-tree --write-tree HEAD <base>` (sem tocar no diretório) e marca conflito previsto.
- Indicador na toolbar ao lado do ahead/behind; clique mostra arquivos em conflito e as ações Rebase/Merge.
- Regras de base com glob nas Preferências do repositório; prioridade v2 (`01-features.md` § 11 e § 12).
