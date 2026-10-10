# Preferências de repositório no `.git/config`

Preferências que mudam comportamento num repositório (modelo de mensagem, ação padrão do Pull, diretório de hooks, codificação, Base de cada branch, Perfil fixado) ficam no `.git/config` do repo, em chaves `mnemo.*` ou `branch.<nome>.mnemoBase`. Assim elas continuam valendo se o repo mudar de pasta, servem para todos os worktrees e nunca são commitadas. O Perfil fixado escreve direto em `user.*`, para o git do terminal usar a mesma identidade. O estado de layout (larguras de painéis e colunas, seções recolhidas) fica nos dados do app, indexado pelo caminho do diretório de trabalho, porque muda a cada arraste e não deve fazer barulho no config do git.

## Considered Options

- **Tudo nos dados do app**: rejeitado, porque mover o repo de pasta perde as preferências e cada worktree teria as suas.
- **Tudo no `.git/config`**: rejeitado, porque cada arraste de divisor gravaria no config.
