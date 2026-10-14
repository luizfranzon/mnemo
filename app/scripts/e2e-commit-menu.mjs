// Menus do commit (grafo) e do arquivo (painel do commit): restaurar, excluir, tag, editar mensagem só no HEAD.
// Uso: `bun run build && node scripts/e2e-commit-menu.mjs`
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { launch, makeRepo, sleep } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
const file = path.join(repo, 'r.txt')
writeFileSync(file, 'v1\n')
g('add', '.')
g('commit', '-q', '-m', 'v1')
writeFileSync(file, 'v2\n')
g('commit', '-q', '-am', 'v2')
writeFileSync(file, 'sujo\n')

const ui = await launch(repo, 9342)
const { ev, until, click } = ui
const rightClick = (selector, match) => ev(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => ${match}); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 })); return true })()`)
const commitRow = (subject) => rightClick('.graph-row', `e.querySelector('.graph-message')?.textContent === ${JSON.stringify(subject)}`)
const labels = () => ev(`[...document.querySelectorAll('.menu-label, .toolbar-menu-heading')].map((s) => s.textContent)`)
// null = item ausente (menu fechado)
const disabled = (label) => ev(`(() => { const b = [...document.querySelectorAll('.menu-item')].find((b) => b.textContent.includes(${JSON.stringify(label)})); return b ? b.hasAttribute('aria-disabled') : null })()`)
// a Operação anterior ainda pode estar em curso (itens desabilitados): reabre o menu até o item ficar habilitado
const openIdle = (open, label) => until(async () => { await open(); await sleep(150); return await disabled(label) }, false)
const typeInto = (sel, value, proto = 'HTMLInputElement') => ev(`(() => { const i = document.querySelector('${sel}'); Object.getOwnPropertyDescriptor(${proto}.prototype, 'value').set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
try {
  await until(() => ev(`document.querySelectorAll('.commit-file').length`), 1)

  // arquivo: restaurar a versão do commit sobrescreve a mudança local
  await openIdle(() => rightClick('.commit-file', 'true'), 'Restaurar versão deste commit')
  assert.ok(await click('Restaurar versão deste commit'))
  await until(() => ev(`document.querySelector('dialog h2')?.textContent ?? ''`), 'Restaurar versão deste commit?')
  assert.ok(await click('Restaurar'))
  await until(() => readFileSync(file, 'utf8').trim(), 'v2') // trim: o autocrlf do Windows grava \r\n

  // arquivo: excluir (rastreado) sai do diretório de trabalho
  await openIdle(() => rightClick('.commit-file', 'true'), 'Excluir arquivo')
  assert.ok(await click('Excluir arquivo'))
  await until(() => ev(`!!document.querySelector('dialog')`), true)
  assert.ok(await click('Excluir'))
  await until(() => existsSync(file), false)

  // commit: cabeçalho, rótulos com o nome da branch e tag
  await openIdle(() => commitRow('v1'), 'Criar tag aqui')
  const items = await labels()
  assert.ok(items.includes('Cherry-pick em main') && items.includes('Reset main para este commit'), items.join(' | '))
  assert.ok(await disabled('Editar mensagem'), 'só o HEAD pode ter a mensagem editada')
  assert.ok(await click('Criar tag aqui'))
  await until(() => ev(`!!document.querySelector('dialog #tag-name')`), true)
  await typeInto('#tag-name', 'marco')
  assert.ok(await click('Criar tag'))
  await until(() => g('tag', '--points-at', 'HEAD~1').toString().trim(), 'marco')

  // commit: editar a mensagem do HEAD não leva a exclusão preparada para o commit
  await openIdle(() => commitRow('v2'), 'Editar mensagem')
  assert.ok(await click('Editar mensagem'))
  await until(() => ev(`document.querySelector('dialog #reword-message')?.disabled === false`), true)
  await typeInto('#reword-message', 'v2 editado', 'HTMLTextAreaElement')
  assert.ok(await click('Salvar'))
  await until(() => g('log', '-1', '--format=%s').toString().trim(), 'v2 editado')
  assert.equal(g('show', 'HEAD:r.txt').toString().trim(), 'v2')
  console.log('OK: menus do commit e do arquivo (restaurar, excluir, tag, editar mensagem)')
} finally {
  ui.close()
}
process.exit(0)
