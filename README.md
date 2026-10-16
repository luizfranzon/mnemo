# Mnemo

Git client desktop visual e local: histórico como grafo, ações git com rótulos que nomeiam o alvo e Desfazer para as Operações.

## Instalar

Baixe o instalador da [última Release](https://github.com/luizfranzon/mnemo/releases/latest):

- Windows: `Mnemo-Setup-x.y.z.exe` (sem assinatura; o SmartScreen avisa na primeira vez).
- Debian/Ubuntu: `.deb`. Fedora/openSUSE: `.rpm`. O pacote traz o git como dependência.

O app avisa na barra inferior quando existe uma versão mais nova.

## Desenvolver

Precisa de Rust, Bun e git.

```
cd app
bun install
bun run native   # compila o mnemo-core (napi)
bun run dev
```

`bun run typecheck`, `bun run test` e `cargo test --workspace` rodam o mesmo que o CI. Contexto de domínio em `CONTEXT.md`, decisões em `docs/adr/`.

## Licença

MIT.
