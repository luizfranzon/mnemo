# Editor de arquivo

- "Editar no diretório de trabalho" está como v2 em `01-features.md` § 7. Editor leve (CodeMirror 6, sem Monaco) dentro do visualizador de diff, mesmas preferências de Editor das Preferências.
- Salvar grava no diretório de trabalho; o WIP atualiza pelo watcher. Conflito com mudança externa pergunta antes de sobrescrever.
- Criar/excluir arquivo pela paleta e pelo menu de pasta. Excluir usa a Operação existente (desfazível).
