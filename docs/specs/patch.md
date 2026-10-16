# Patch

- Criar de commit(s): `git format-patch`; do WIP/arquivos: `git diff [--cached] -- <caminhos>`. Salva com seletor de arquivo nativo ou copia para a área de transferência.
- Aplicar: `git apply --3way` (ou `git am` quando o arquivo é de `format-patch`), com auto-stash opcional (#14) e verificação prévia `--check`.
- Aplicar patch no WIP é desfazível como o descarte (snapshot); `git am` gera commits e é Operação de refs.
