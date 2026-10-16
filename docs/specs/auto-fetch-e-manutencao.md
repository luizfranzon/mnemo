# Auto-fetch, prune e manutenção

- Auto-fetch para abas abertas e Favoritos (CONTEXT.md), intervalo nas Preferências, em segundo plano sem bloquear Operações (fila de uma Operação por vez).
- Prune ligado por padrão (`fetch --prune`), já usado pela toolbar.
- "há 2 min" no botão Fetch atualiza com o auto-fetch; falha vira indicador discreto com o erro no tooltip.
- Manutenção: item no menu Repositório e na paleta, roda `git maintenance run --auto`/`gc` com progresso.
- Fetch não é desfazível.
