# Rebase interativo

- Ações por commit: pick, reword, squash, fixup, edit, drop (já previsto em `docs/design/01-features.md` § 14). Resumo "6 commits viram 3".
- O rebase interativo concluído é **uma Operação** e se desfaz inteiro. Parado em conflito, segue a regra do CONTEXT.md (só entra no Histórico ao concluir ou abortar), com a faixa âmbar Continuar/Pular/Abortar que já existe.
- Branch já publicada: aviso de que o próximo push precisará de `--force-with-lease`.
- Executa pelo git do sistema (`git rebase -i` com `GIT_SEQUENCE_EDITOR` e `GIT_EDITOR` controlados pelo core), sem libgit2.
- Atalhos `p`, `r`, `s`, `f`, `e`, `d` e `Alt+↑/↓` para mover, ativos só com o painel focado.
