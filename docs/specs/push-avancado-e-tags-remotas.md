# Push avançado e tags no remoto

- Push e exclusão no remoto não são desfazíveis (CONTEXT.md). O toast diz isso.
- Force push sempre com `--force-with-lease` por padrão; "forçar mesmo assim" (sem lease) só depois de um segundo aviso explícito.
- Excluir tag local pergunta se exclui também nos remotos onde ela existe; a parte local continua desfazível, a remota não.
- Duplo clique no ahead/behind da toolbar e do painel de refs faz pull/push.
