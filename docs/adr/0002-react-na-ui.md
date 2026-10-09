# React na UI, com disciplina contra re-render

A UI é React 19 + TypeScript + Vite, com React Compiler, Zustand (estado com seletores) e TanStack Virtual (listas virtualizadas). Svelte 5 e SolidJS dariam reatividade fina sem esforço, mas React tem o maior ecossistema (primitivos acessíveis para menus e diálogos, virtualização) e é o que o autor prefere. O risco de re-render é contido por virtualização, memoização automática e as regras de performance do `AGENTS.md`, que valem para todo o projeto.

## Considered Options

- **Svelte 5**: templates próximos aos mockups `.dc.html` e reatividade fina, mas ecossistema menor.
- **SolidJS**: o melhor desempenho bruto, mas ecossistema pequeno e pegadinhas de reatividade (desestruturar props).
- **Angular**: o autor já domina, mas é pouco usado em apps desktop e traz mais cerimônia.
