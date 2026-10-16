# Opções de commit e hooks

- Opções no painel WIP: Amend (já existe), Pular hooks (`--no-verify`), Push depois (dispara Push após o commit; o push continua não desfazível).
- Template: lê `commit.template` e preenche resumo/descrição vazios; editar o template nas Preferências do repositório.
- Diretório de hooks: `core.hooksPath` (ex.: `.husky/_`), por repositório.
- Falha de hook vira notificação com "ver log" (`01-features.md` § 11) mostrando a saída do hook.
