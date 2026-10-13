# Toolbar do repositório (#16)

Complementa os critérios da [issue #16](https://github.com/luizfranzon/mnemo/issues/16), os comportamentos de `claude-design/docs/02-comportamentos.md` e o mockup `TopBar.dc.html`.

## Decisões confirmadas na entrevista

- O botão Fetch da toolbar e a opção “Fetch tudo” do menu Pull buscam todos os remotos configurados, com remoção das refs remotas obsoletas (`git fetch --all --prune`).
- Pull continua usando o upstream da branch atual; buscar todos os remotos não muda o alvo da integração.
- Sem upstream, os modos de execução de Pull ficam desabilitados com o motivo “Esta branch não tem upstream”. Fetch continua disponível e Push pode publicar a branch e definir seu upstream.
- A ausência de upstream não altera o padrão salvo do botão Pull. O botão mantém seu modo e fica desabilitado quando esse modo exigir upstream; “Fetch tudo” permanece disponível no dropdown. Os controles para escolher o padrão continuam disponíveis.
- Push de uma branch sem upstream usa `origin`, se existir, ou o único remoto configurado. Com vários remotos e nenhum `origin`, abre um seletor de remoto antes de publicar. Cancelar o seletor não executa uma Operação; escolher publica a branch e define o upstream no remoto escolhido.
- Com merge/rebase parado em conflito, Checkout, Pull, Push, nova branch, Stash e descarte ficam desabilitados com o motivo “Conclua ou aborte o merge/rebase”. Fetch e busca permanecem disponíveis quando nenhum comando estiver executando. A faixa âmbar oferece Continuar, Pular (somente rebase) e Abortar.
- Durante a execução de um comando, as demais ações ficam desabilitadas com motivo. O controle que disparou a Operação mostra spinner e rótulo de progresso.

## Implementação prevista

- Completar a toolbar existente conforme os critérios da issue e o mockup, preservando os rótulos com alvo, contadores e tooltips de Desfazer/Refazer.
- Usar o componente de menu único nos dropdowns e permitir escolha do padrão Pull por radio, com navegação por teclado e fechamento por Esc/clique fora.
- Preservar `mnemo.pullMode` local com fallback global, sem alterar as preferências de `git pull` do terminal.
- Mostrar o aviso de HEAD destacado previsto nos comportamentos, com criação de branch a partir do commit atual; Pull e Push indisponíveis nesse estado.
- Manter “Descartar tudo…” e “Excluir remota…” até os tickets #23 e #18. A paleta continua provisória nesta issue; sua expansão pertence à #27.
- Manter seletores mínimos do Zustand e interações conforme as regras de render do projeto.

## Validação prevista

- TDD na API pública do core com repositórios Git reais temporários: Fetch atualiza dois remotos e remove refs obsoletas; Fetch com remoto explícito mantém seu alvo; Push publica e define upstream no remoto escolhido; preferência Pull local e fallback global; estados sem upstream e HEAD destacado.
- Verificar as regras de disponibilidade e seleção de remoto na UI, além do teclado dos menus e da confirmação de cancelamento sem execução.
- Rodar typecheck e testes focados durante o trabalho, a suíte completa ao final e a skill code-review antes do commit.

## Estado

Entendimento confirmado pelo usuário; implementação concluída e revisada.

## Validação realizada

- Os 8 testes de integração da toolbar passaram, incluindo dois remotos, prune, Fetch explícito, Fetch durante conflito, Push escolhido e preferência Pull local/global.
- Os 13 testes da UI passaram. Typecheck, Clippy e builds do renderer, Electron e addon nativo passaram.
- Verificação no Chromium com ponte falsa: Fetch por teclado, radios do padrão Pull sem executar Operação, cancelamento/escolha de remoto no Push, motivos de bloqueio, Checkout pela busca bloqueado durante conflito, HEAD destacado e layout em 900px.
- Revisão de padrões: nenhuma violação; uma sugestão não bloqueante para futuramente identificar o controle do spinner por um identificador estruturado de Operação, em vez do rótulo do evento. Revisão de spec: duas lacunas corrigidas (Checkout pela busca em conflito e spinner no breadcrumb); nenhuma pendência após nova revisão.
- A suíte completa encontra 10 falhas em `discard_and_reset_hard`. As mesmas 10 falhas foram reproduzidas no commit anterior `67c3907`, numa cópia isolada, e não foram alteradas nesta issue. Os demais testes de integração executados passaram.
- A verificação global de rustfmt encontra diferenças preexistentes em `diag.rs`, `process_git.rs` e `discard_and_reset_hard.rs`; os arquivos Rust alterados nesta issue passaram na verificação de formatação.
