# Repositório público, com as Releases no próprio repositório

O código do Mnemo é público (MIT) e as Releases saem no mesmo repositório, criadas pelo CI quando uma PR que sobe a versão entra na `main`. O `electron-updater` lê essas Releases direto, sem token, e instala só versões com semver maior que a instalada. A `main` é protegida: PR obrigatória, CI verde e squash merge.

Isso substitui a decisão anterior de manter o código privado e publicar numa repo de releases separada. Um repo de releases só existia para o app instalado conseguir consultar e baixar sem credencial; com o código público o problema some, e junto vão o segundo repo e o token entre repos (o `GITHUB_TOKEN` do workflow basta).

## Considered Options

- **Repo de releases público separado, código privado**: rejeitado. Duplica repositório e exige um token com escrita entre os dois.
- **Releases no repo privado**: rejeitado. O app instalado não consegue consultar nem baixar sem embutir um token no binário.
- **Versão por mensagem de commit (release-please)**: rejeitado. A versão fica no diff da PR (`app/package.json`, `Cargo.toml`, `CHANGELOG.md`), sem convenção de mensagem nem PR extra de release.

## Consequences

- Hard to reverse: tornar o repo público expõe o histórico; foi reescrito antes para tirar referências externas e e-mails.
- Os instaladores não são assinados no MVP. O Windows mostra o SmartScreen na primeira instalação.
