# Mnemo não guarda credenciais

Credenciais HTTPS ficam no credential helper do usuário (Git Credential Manager, libsecret) e chaves SSH no `ssh-agent`. Todo git roda com `GIT_TERMINAL_PROMPT=0` e `GIT_ASKPASS`/`SSH_ASKPASS` apontando para um helper do Mnemo, que pede usuário/senha/passphrase num modal do app. "Lembrar" chama `git credential approve`. "Esquecer credenciais" chama `git credential reject`. Um cofre próprio facilitaria perfis com contas diferentes, mas duplicaria o GCM e criaria uma superfície de segurança nova.
