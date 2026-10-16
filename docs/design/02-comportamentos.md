# Comportamentos e decisões de interação

Decisões tomadas durante o desenho do layout. Valem mais que o desenho quando houver conflito.

## Checkout

- **Duplo clique na branch** (painel esquerdo e pill no grafo) faz checkout.
- Remota sem local: cria a local rastreando e faz checkout. Toast: "criada `t34949` rastreando `origin/t34949`".
- Remota com local existente: checkout na local; se estiver atrás, toast com ação "Pull agora".
- Mudanças locais que conflitam: modal "Você tem N arquivos alterados" → **Stash e trocar** · **Levar mudanças** · Cancelar. Nunca descarta sem perguntar.
- Clique simples só seleciona e rola o grafo até a ponta.
- Duplo clique no **commit**: checkout em HEAD destacado, com aviso âmbar na toolbar ("HEAD destacado · Criar branch aqui").
- Configurável em Preferências › Geral.

## Desfazer

- `Ctrl+Z` / `Ctrl+Y` dependem do foco: em campo de texto desfazem a digitação; fora dele, a Operação git.
- O botão da toolbar e o menu Editar sempre agem na Operação. Com foco em campo, o menu mostra os dois ("Desfazer digitação" e "Desfazer checkout").

## Menus de contexto

- Clique direito abre o menu e **trava o scroll** do grafo, painéis e listas até o menu fechar.
- Fecha com Esc, clique fora ou escolhendo um item. Clique fora só fecha, não seleciona nada embaixo.
- Menu mais alto que a janela: a roda do mouse rola o próprio menu.
- Nunca sai da janela: abre para cima/esquerda se faltar espaço.
- Teclado: ↑↓ navega, → abre submenu, ← volta, Enter executa.
- O mesmo menu abre pelo ⋮ que aparece no hover das linhas.
- Cabeçalho do menu identifica o alvo (branch + ahead/behind + upstream, ou SHA + mensagem).
- Rótulos sempre com nomes: "Merge **t34951** em **t34949**".
- Itens indisponíveis ficam desabilitados com tooltip do motivo (não somem).
- Itens perigosos em vermelho e com confirmação.
- Implementar como **um componente de menu único** com essas regras embutidas.

### Menu da branch (local e remota)

```
t34951 · ↑2 ↓0 · rastreia origin/t34951
Fazer checkout de t34951                    duplo clique
Merge t34951 em t34949
Rebase t34949 sobre t34951
─
Pull t34951            (só local)
Push t34951            (só local)
Definir upstream…      (só local)
─
Nova branch a partir daqui…                 Ctrl B
Criar worktree…
Comparar com o diretório de trabalho
─
Commit da ponta (7a1f3c2) ›   Cherry-pick · Revert · Reset › · Copiar SHA
─
Renomear…              (só local)           F2
Excluir t34951…        local, remota ou ambas
Copiar nome · Copiar link no GitHub
─
Ocultar no grafo · Solo · Destacar no grafo (Branch em destaque)
Explicar mudanças com IA (v2)
```

### Menu do commit

Checkout (HEAD destacado) · Nova branch aqui · Criar worktree · Cherry-pick em <atual> · Revert ·
Reset <atual> para este commit › (Soft: mantém preparadas · Mixed (padrão): mantém no diretório ·
Hard…: descarta, mostra quantos commits e mudanças, confirma) · Editar mensagem (só HEAD) ·
Criar tag / tag anotada · Comparar com diretório · Criar patch · Copiar SHA `Ctrl+Shift+C` ·
Copiar link no GitHub · Explicar com IA (v2).

### Menu do arquivo (no painel do commit)

Histórico do arquivo · Blame · Abrir no editor · Abrir na ferramenta de diff · Abrir com programa padrão ·
Mostrar na pasta · Copiar caminho · Copiar caminho relativo · Editar arquivo ·
Restaurar versão deste commit… (âmbar) · Excluir arquivo… (vermelho).

## Pull

Split-button.
- Botão principal mostra o modo atual: "Pull ff", "Pull rebase" ou "Fetch", com badge de commits atrás.
- O dropdown tem duas partes: **Executar agora** (Fetch tudo · Pull ff se possível · Pull só ff · Pull com rebase — executa uma vez) e **Padrão do botão** (radio, muda o padrão).
- Padrão por repositório, com fallback no global.

## Toolbar

- Ações alinhadas logo após a branch; à direita só busca/paleta.
- Rótulos em linha com o ícone (barra ~48px).
- Durante uma operação: botão vira spinner + "Fazendo push…", resto desabilitado com motivo.
- Pull em azul, Push em verde (ícone e badge); ↓ azul e ↑ verde ao lado da branch.

## Painéis

- Três painéis com divisores arrastáveis: refs (200–420px) · centro (≥480px) · commit/WIP (300–640px).
- Duplo clique no divisor volta à largura padrão.
- Arrastar até o mínimo recolhe: esquerdo vira rail de ícones com contadores; direito some. `Ctrl+J` / `Ctrl+K`.
- Larguras salvas por repositório.
- Divisor com área de pega de 8px, linha de 1px, azul no hover/arrasto.
- Janela estreita (< 1100px): painel direito vira gaveta sobreposta.

## Colunas do grafo

- Redimensionar arrastando o divisor do cabeçalho; duplo clique ajusta ao conteúdo.
- Mínimos: grafo nunca some, mensagem ≥ 200px. Mensagem é a coluna flexível.
- Branch/Tag com overflow: 1 pill + "+2"; hover lista o resto.
- Normal: foto do autor no nó (borda na cor da lane), coluna Autor só com nome.
- Compacto: ponto colorido no nó, lanes mais estreitas, foto vai para a coluna Autor.
- Larguras e colunas salvas por repositório.

## Commit (WIP)

- `Ctrl+Enter` commita. Contador de 72 no resumo.
- Botão desabilitado diz o porquê ("Prepare arquivos para commitar").
- Descartar tudo / descartar arquivo pedem confirmação e permitem desfazer.

## Notificações

- Agrupadas por repositório; ícone do tipo + texto (nunca só cor).
- Filtros: Todas · Não lidas · por repositório. "Marcar tudo como lido".
- Ação principal inline (Pull e tentar de novo, Ver log, Rebase agora).
- Data relativa com tooltip da completa.
- Toast para eventos ao vivo (com Desfazer quando cabe); sino guarda histórico.
- Notificação do sistema só para erro (configurável).

## Paleta de comandos (`Ctrl+P`)

- Mistura comandos, branches, commits e arquivos. Prefixos: `>` comandos, `@` branches, `#` commits, `/` arquivos.
- Enter executa; `Ctrl+Enter` abre em nova aba.
- Todo item de menu existe na paleta.

## Preferências

- Busca no topo. Global x Repositório; badge "deste repo" / "global".
- Salva sozinho com toast. Nada de botão "Salvar" desabilitado.
- Label em cima, ajuda embaixo, alinhado à esquerda.
- Evitar ajustes que exigem reiniciar; quando inevitável, faixa "reiniciar para aplicar".

## Repositórios grandes

- Remotas agrupadas por prefixo (`12.x`, `t3xxxx`), lista virtualizada.
- Ocultar no grafo remotas sem branch local (padrão).
- Visibilidade inteligente no grafo.
