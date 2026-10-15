# CodeMirror 6 no Resultado do editor de conflito

O Resultado do editor de conflito usa CodeMirror 6, só ali. Ele precisa ser um editor de verdade (número de linha, highlight, cursor, seleção, undo, scroll). Um `<textarea>` com overlay caseiro daria zero dependência, mas exige sincronizar scroll, fonte e quebra de linha à mão e recolore o arquivo inteiro a cada tecla. O highlight segue o regex genérico do app (`highlight()`), via decoração, para a paleta ficar igual à do diff. Atual e Entrando continuam `<div>` virtualizados com TanStack Virtual, somente leitura.

## Considered Options

- **Overlay `<textarea>` + `<pre>`**: sem dependência, mas frágil e caro de manter.
- **Monaco**: completo, mas pesado demais para um único painel.
