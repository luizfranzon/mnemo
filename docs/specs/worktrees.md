# Worktrees

- Aba = diretório de trabalho (CONTEXT.md): abrir worktree abre ou foca a aba dele.
- Operações de worktree não são desfazíveis. Nada de integração com agentes (AGENTS.md).

## Grafo

- Pill de worktree: a pill da branch presa a um worktree ganha o ícone de worktree no lugar do ícone local (cadeado se travado). Sem pill extra, segue a ordem e o `+N` do commit.
- Tooltip: pasta e caminho. Clique no ícone abre ou foca a aba. Menu de contexto da pill ganha as ações de worktree.
- O worktree da aba atual não troca o ícone.
- Worktree com HEAD destacado: pill própria só com o nome da pasta.
- Worktree com pasta ausente não aparece no grafo.
- Sem WIP de worktree no grafo.
- Duplo clique em pill de branch presa a worktree abre ou foca a aba, sem checkout.

## Painel de refs

- Item: `branch · caminho`; HEAD destacado mostra o SHA curto no lugar da branch.
- Marcas: "atual" no worktree da aba, cadeado se travado (motivo no tooltip), esmaecido com "pasta ausente".
- Clique simples seleciona e rola o grafo até o HEAD do worktree (sem efeito se fora do grafo carregado). Duplo clique abre ou foca a aba: não faz nada no worktree da aba atual, mostra o erro de abertura em toast se a pasta sumiu e abre normalmente se estiver travado.
- Nome da aba do worktree: `<repo> - <branch>` (`<repo> - <pasta>` com HEAD destacado), atualizado a cada checkout. Colisão de rótulo usa o trecho do caminho pai.

## Menu de contexto (item do painel, pill e "⋯")

- Abrir, copiar caminho, revelar na pasta, copiar nome da branch.
- Travar (mensagem opcional) / Destravar.
- Remover: só destravado, nunca o principal. Confirma; só força se sujo, e avisa de submódulos. Fecha a aba do worktree. Checkbox "excluir também a branch" (desmarcado), avisando que ela não volta.
- Pasta ausente: Abrir desabilitado; ação é Podar.
- Cabeçalho da seção: Criar worktree…, Podar (`git worktree prune`).
- Menu de branch e de commit: Criar worktree… com a ref como base.

## Criar worktree

- Base: ref de onde o menu foi aberto.
- Branch: existente (que não esteja presa em outro worktree) ou nova com nome.
- Pasta padrão: `<pai>/<repo>-<branch>` (`/` na branch vira `-`), editável, com seletor de pasta.
- Valida: pasta já existe, ref inexistente, branch local ou worktree com o mesmo nome. Avisa se a pasta fica dentro de um diretório de trabalho.
- Ao criar, abre a aba do novo worktree.
