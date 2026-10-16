# Gitflow

- Implementado com git puro (sem depender do `git-flow` instalado): config em `gitflow.*` no git config, start = criar branch do prefixo a partir da base, finish = merge `--no-ff` na(s) base(s), tag para release/hotfix, excluir a branch opcional.
- Cada start/finish é uma Operação composta e se desfaz inteira (refs locais).
- Prioridade v2 em `01-features.md` § 12.
