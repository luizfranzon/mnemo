# Assinatura de commits e tags

- Configuração vive no git config (`user.signingkey`, `gpg.format`, `gpg.program`, `commit.gpgsign`, `tag.gpgsign`), conforme a ADR 0005 e o Perfil (CONTEXT.md). OpenPGP, SSH e X.509 (`01-features.md` § 12).
- Opção "assinar" no painel WIP por commit, com o padrão vindo do config.
- Selo de assinatura no painel do commit (`git log --format=%G?`), com detalhes no hover.
- Senha da chave fica com o agente (gpg-agent/ssh-agent), como nas credenciais (ADR 0004); o Mnemo não guarda passphrase.
