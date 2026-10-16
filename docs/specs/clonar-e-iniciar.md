# Clonar e iniciar repositório

- Tela Repositórios (`01-features.md` § 9): Clonar com URL, pasta destino, branch, profundidade, submódulos (`--recurse-submodules`), abrir em aba. Colar URL na busca abre o Clonar preenchido.
- Progresso do `git clone --progress` em barra, com cancelar (mata o processo e apaga a pasta criada).
- Iniciar: `git init -b <branch>`, `.gitignore` de templates embutidos no app e licença opcional; abre em aba nova.
- Credenciais seguem a ADR 0004 (delegadas ao helper do git).
- Clonar e iniciar não são Operações (não há estado anterior para desfazer).
