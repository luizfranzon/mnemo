# Ações por pasta e stash parcial

- Seleção múltipla de arquivos no WIP (Ctrl/Shift) e menu de pasta no modo árvore.
- Stash parcial: `git stash push -- <caminhos>`; aplicar parte: `git checkout stash@{n} -- <caminhos>` (como Operação desfazível igual ao descarte).
- Descartar pasta reutiliza o snapshot recuperável do descarte.
- Adicionar ao `.gitignore` (arquivo, pasta, extensão) direto do menu.
