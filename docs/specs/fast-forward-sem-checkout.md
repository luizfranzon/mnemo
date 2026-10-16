# Fast-forward sem checkout

- Item "Avançar X até Y" no menu da branch local quando `X` é ancestral de `Y` e `X` não é a branch atual. Implementa com `git fetch . Y:X` (ou `git update-ref` validado), sem tocar no diretório de trabalho.
- Para a branch atual, o caminho continua sendo Pull ff-only.
- É uma Operação de refs e se desfaz.
