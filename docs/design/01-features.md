# Features do Mnemo

Levantamento de features do Mnemo. Regras detalhadas das features futuras: `docs/specs/`.

Prioridade: **MVP** = primeira versão · **v2** = depois · **Fora** = não entra (app é local, sem conta).

## 1. Janela e navegação

| Feature | Prioridade |
|---|---|
| Menu Arquivo/Editar/Exibir/Repositório/Ajuda dentro da barra de título (ganha altura) | MVP |
| Abas de repositório + aba "Nova aba" (tela Repositórios) + aba Launchpad | MVP |
| Contador de mudanças locais na aba (✎4) | MVP |
| Notificações (sino), Preferências, menu de perfil (nome/email do commit, trocar perfil) | MVP |
| Upgrade, organização, conta, sign out | Fora |

### Menus da janela

- **Arquivo**: Nova aba `Ctrl+T` · Fechar aba `Ctrl+W` · Reabrir aba fechada `Ctrl+Shift+T` · Clonar `Ctrl+N` · Iniciar `Ctrl+I` · Abrir `Ctrl+O` · Repositórios `Ctrl+Alt+O` · Abrir no editor `Ctrl+Shift+E` · Abrir terminal `Alt+T` · Abrir pasta `Alt+O` · Preferências `Ctrl+,` · Sair `Ctrl+Q`
- **Editar**: Desfazer `Ctrl+Z` (desfaz ação Git, rótulo diz qual: "Desfazer checkout") · Refazer `Ctrl+Y` · Recortar/Copiar/Colar/Selecionar tudo · Buscar commits `Ctrl+F`
- **Exibir**: Tela cheia `F11` · Zoom +/−/reset · Abas › · Favoritos › · Painel esquerdo `Ctrl+J` · Painel do commit `Ctrl+K` · Terminal `` Ctrl+` `` · Densidade
- **Repositório** (novo): Fetch · Pull › · Push · Stash · Pop · Nova branch `Ctrl+B` · Checkout `Ctrl+Shift+B` · Commitar `Ctrl+Enter` · Amend · Merge… · Rebase… · Cherry-pick… · Ajustes do repositório
- **Ajuda**: Paleta de comandos `Ctrl+P` · Atalhos `Ctrl+/` · Sobre/versão · Novidades · Verificar atualização · Logs de suporte ›
- Todo item de menu existe também na paleta `Ctrl+P`. Atalhos editáveis em Preferências › Atalhos.

## 2. Toolbar do repositório

| Feature | Prioridade |
|---|---|
| Breadcrumb `repositório › submódulo › branch`, cada um com dropdown; ✕ no submódulo volta ao pai | MVP |
| Ahead/behind ao lado da branch (↓ azul, ↑ verde) | MVP |
| Fetch: ícone com "há 2 min", clique força fetch, spinner durante | MVP |
| Desfazer / Refazer com tooltip da ação | MVP |
| Pull split-button (ver comportamentos) com badge de commits atrás | MVP |
| Push com badge de commits à frente | MVP |
| Branch, Stash ▾ (com contador), Terminal | MVP |
| Busca/paleta `Ctrl+P` à direita | MVP |
| Faixa âmbar durante merge/rebase: "Rebase 3/7 · Continuar · Pular · Abortar" | MVP |

## 3. Painel esquerdo (refs)

| Feature | Prioridade |
|---|---|
| Filtro `Ctrl+Alt+F` | MVP |
| Seções recolhíveis com contagem: Local, Remotos, Worktrees, Stashes, Tags, Submódulos | MVP |
| Seção vazia some (opção "mostrar seções vazias") | MVP |
| Branch atual com check e fundo verde; ahead/behind por branch | MVP |
| Remotas agrupadas por prefixo como pastas (`12.x`, `t3xxxx`, `feature/…`) | MVP |
| Lista virtualizada (2.500+ remotas) | MVP |
| Olho no hover = mostrar/ocultar no grafo; ⋮ no hover = mesmo menu do clique direito | MVP |
| Painel recolhido vira rail de ícones com contadores | MVP |
| Filtros rápidos: só minhas, atualizadas em 30 dias, já mergeadas em X (+ apagar em lote) | v2 |
| Issues, Teams, Cloud Patches | Fora |

## 4. Grafo de commits

| Feature | Prioridade |
|---|---|
| Colunas: Branch/Tag, Grafo, Mensagem, Descrição, Autor, Data, SHA | MVP |
| Redimensionar colunas arrastando; duplo clique ajusta; mínimos por coluna | MVP |
| Engrenagem: mostrar/ocultar e **reordenar** colunas, restaurar padrão, layout compacto | MVP |
| Modo **Normal** (foto do autor no nó) e **Compacto** (ponto colorido; foto vai para a coluna Autor) | MVP |
| Visibilidade inteligente (só branch atual, base e o que foi mergeado) | MVP |
| Pills de ref com ícone local/remoto, check no HEAD, "+2" quando há mais refs | MVP |
| Nó **// WIP** no topo com contadores (✎3 +1) | MVP |
| Linha selecionada em azul; **sem** tingir o fundo das linhas pela cor da lane (fica poluído) | MVP |
| Lazy load (2000 iniciais), scroll horizontal só da coluna do grafo | MVP |
| Filtro por autor, busca na mensagem | MVP |
| Ocultar remotas sem branch local no grafo (padrão ligado) | MVP |
| Arrastar branch sobre outra: menu merge / rebase / cherry-pick | MVP |

## 5. Painel direito — commit selecionado

| Feature | Prioridade |
|---|---|
| SHA + copiar, mensagem, descrição, autor com avatar, data, pais clicáveis | MVP |
| Resumo "✎5 modificados · +12 adicionados" e +linhas/−linhas | MVP |
| Arquivos em Caminho/Árvore, ordenar, "todos os arquivos"; caminho truncado no meio mantendo o nome | MVP |
| Explicar commit com IA | v2 |
| Recompor commit com IA | v2 |

## 6. Painel direito — WIP (mudanças locais)

| Feature | Prioridade |
|---|---|
| Cabeçalho "4 arquivos alterados em t34949" + descartar tudo (confirma) | MVP |
| Não preparados / Preparados, "Preparar todos" / "Tirar todos" | MVP |
| Por arquivo no hover: preparar, descartar, abrir diff | MVP |
| Stage por hunk e por linha no diff | MVP |
| Abas Commit / Stash | MVP |
| Amend, resumo com contador 72, descrição | MVP |
| Opções: assinar, pular hooks, push depois | MVP |
| Botão "Commitar N arquivos em <branch>" + `Ctrl+Enter`; desabilitado explica o motivo | MVP |
| Gerar mensagem com IA; compor vários commits com IA | v2 |

## 7. Diff

| Feature | Prioridade |
|---|---|
| Breadcrumb do arquivo, +/−, fechar (Esc) | MVP |
| Arquivo / Diff, Blame, Histórico | MVP |
| Trecho anterior/próximo ("Trecho 1 de 2") | MVP |
| Layout: Trechos, Inline, Lado a lado; área vazia hachurada no lado a lado | MVP |
| Marcadores de mudança na barra de scroll | MVP |
| Encoding (UTF-8), syntax highlight (paleta em `04-design-system.md`) | MVP |
| Editar no diretório de trabalho | v2 |

## 8. Menus de contexto

Ver lista completa e regras em `02-comportamentos.md`. Branch local, branch remota, commit, arquivo.
Explicar com IA (v2). Share as Cloud Patch (Fora).

## 9. Repositórios (nova aba + gerenciador)

No Mnemo é **uma** tela só (nova aba e gerenciador juntos).

| Feature | Prioridade |
|---|---|
| Abrir, Clonar, Iniciar, Escanear pasta; arrastar pasta para abrir | MVP |
| Busca; colar URL na busca abre o Clonar preenchido | MVP |
| Grupos: Favoritos, Abertos, Recentes, Encontrados na pasta escaneada | MVP |
| Linha: nome, caminho, branch, ahead/behind, ✎/+/−, último fetch | MVP |
| Seleção múltipla com barra de ações em lote (Fetch, Pull, Abrir em abas) só quando há seleção | MVP |
| Ações por linha no hover: Abrir, terminal, ⋮ (mostrar na pasta, copiar caminho, remover da lista) | MVP |
| Workspaces (grupos nomeados de repos, abrir todos) | v2 |
| Clonar: URL, pasta destino, branch, profundidade, submódulos, abrir em aba | MVP |
| Clonar a partir de "meus repos no GitHub" | v2 |

## 10. Launchpad

| Feature | Prioridade |
|---|---|
| Mudanças locais de **todos** os repos (WIP), com Abrir / Commitar (Commitar abre ou foca a aba com o painel WIP; não commita no Launchpad) | MVP |
| Meus PRs, Issues atribuídas (GitHub), filtros por repo/label | v2 |
| Criar branch a partir da issue com nome padrão configurável | v2 |
| Adiar item, visões salvas | v2 |
| Team | Fora |

## 11. Notificações

Eventos dos repositórios, não marketing.

| Evento | Prioridade |
|---|---|
| Fetch trouxe commits na sua branch ou na base | MVP |
| Push rejeitado, autenticação falhou, hook falhou (com "ver log") | MVP |
| Atualização do app: **uma** notificação que substitui a anterior | MVP |
| Conflito previsto com a base | v2 |
| PR aprovado/revisado, CI falhou | v2 |
| Marketing | Fora |

## 12. Preferências

Busca no topo. Duas partes: **Global** e **Repositório atual**. Ajuste de repo mostra "deste repo" vs "global".
Salva sozinho (toast "Salvo"). Sem duplicar opção em duas seções.

**Global**
- Geral: auto-fetch (min, 0 desliga), prune, submódulos atualizados, branch padrão, apagar `.orig`, commits iniciais + lazy load, lembrar abas, log estendido, duplo clique faz checkout, ocultar remotas sem local, ação padrão do Pull, aviso de conflito, esquecer credenciais — MVP
- Perfis (vários, sem paywall; sincroniza `.gitconfig`) — MVP
- SSH (agente local, chaves, gerar, credential manager) — MVP
- Integrações (GitHub via `gh` CLI, sem guardar token; GitLab, Bitbucket, Azure DevOps, self-hosted) — v2
- IA (provider/modelo, chave própria, instruções globais e por feature com chips) — v2
- Ferramentas externas (merge tool, diff tool, editor, terminal) — MVP
- Notificações (do sistema) — MVP
- Aparência (tema escuro/alto contraste/claro, densidade, tamanho, posição dos avisos, formatos de data com prévia, colunas do grafo, rótulos na toolbar, iniciais x avatar, destacar branch no hover) — MVP
- Assinatura (OpenPGP/SSH/X.509, programa, chave, gerar, assinar commits/tags por padrão) — MVP
- Editor (fonte mono, tamanho, tab, EOL, syntax, números de linha, quebra) — MVP
- Terminal (fonte, tamanho, altura de linha, cursor, escurecer sem foco, autocomplete) — MVP
- Atalhos (editáveis) — MVP
- Avançado (caminho do executável do git; usa o git do sistema, verificado ao abrir, e o instalador oferece instalar se faltar) — MVP · git embutido — v2
- Organização, Times, Cloud Patches — Fora

**Repositório**
- Commit (push após commit, assinar, pular hooks, squash no merge, modelo de mensagem) — MVP
- Git Hooks (diretório, ex.: `.husky/_`) — MVP
- Codificação — MVP
- Prevenção de conflito (branches base com glob `origin/**`, `!origin/abc`) — v2
- Gitflow, LFS, Sparse checkout (árvore de pastas com checkbox + modo texto), WIP de worktrees no grafo, Issue tracker (detectar pelo remote, `#35785` vira link) — v2
- Team — Fora

## 13. Barra de status

Estado de sincronização, `UTF-8 · LF`, zoom, versão do git, versão do Mnemo. — MVP · PRs abertos — v2

## 14. Merge e rebase

- Conflito: faixa âmbar com progresso, lista de arquivos em conflito/resolvidos, Atual x Entrando lado a lado, Resultado editável embaixo, aceitar trecho / os dois / usar lado, abrir na ferramenta externa — MVP
- Rebase interativo: pick/reword/squash/fixup/edit/drop por commit, arrastar para reordenar, atalhos de teclado, resumo "6 commits viram 3", aviso de push forçado (`--force-with-lease`) — MVP
