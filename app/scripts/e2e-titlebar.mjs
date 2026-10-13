// Barra de título e menu único: menus da janela, foco em campo no Editar, teclado, submenu, clique fora,
// atalhos sem o menu nativo, maximizar. Uso: `bun run build && node scripts/e2e-titlebar.mjs`
import assert from 'node:assert/strict'
import { launch, makeRepo, sleep } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
g('commit', '-q', '--allow-empty', '-m', 'x')
g('branch', 't34951')

const ui = await launch(repo, 9339)
const { ev, until, send } = ui
const branch = () => ev(`document.querySelector('[data-testid=current-branch]')?.textContent`)
const at = (sel) => ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`)
async function press(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
}
const openMenu = async (label) => press(...(await ev(`(() => { const r = [...document.querySelectorAll('.titlebar-menu')].find((b) => b.textContent === ${JSON.stringify(label)}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`)))
const items = () => ev(`[...([...document.querySelectorAll('.menu')].at(-1)?.querySelectorAll('.menu-label') ?? [])].map((s) => s.textContent)`)
const key = (k, mods = {}) => ev(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true, ...${JSON.stringify(mods)} }))`)
const menus = () => ev(`document.querySelectorAll('.menu').length`)
try {
  await until(branch, 'main')
  assert.deepEqual(await ev(`[...document.querySelectorAll('.titlebar-menu')].map((b) => b.textContent)`), ['Arquivo', 'Editar', 'Exibir', 'Repositório', 'Ajuda'])

  // Editar sem foco em campo: só a Operação
  await ui.click('Checkout…')
  await until(() => ev(`document.activeElement?.tagName`), 'INPUT')
  await key('Escape')
  await until(() => ev(`!!document.querySelector('.palette')`), false)
  const p = repo.split('\\').join('/')
  await ev(`window.__mnemo.invoke('execute_operation', { path: '${p}', kind: { type: 'checkout', target: 't34951' } })`)
  await until(branch, 't34951')

  // Editar com foco em campo: digitação + Operação; o campo continua focado (a paleta é modal: campo avulso)
  await ev(`(() => { const i = document.createElement('input'); i.id = 'campo'; document.querySelector('.panel-center').append(i); i.focus() })()`)
  await openMenu('Editar')
  await until(menus, 1)
  assert.deepEqual((await items()).slice(0, 4), ['Desfazer digitação', 'Desfazer checkout de t34951', 'Refazer digitação', 'Refazer'])
  await key('Escape')
  await until(menus, 0)
  assert.equal(await ev(`document.activeElement?.id`), 'campo', 'Esc devolve o foco ao campo')
  await send('Input.insertText', { text: 'abc' })
  await openMenu('Editar')
  await until(menus, 1)
  await key('ArrowDown')
  await key('Enter') // Desfazer digitação: age no campo, não na Operação
  await until(() => ev(`document.getElementById('campo').value`), '')
  assert.equal(await branch(), 't34951')
  await ev(`document.getElementById('campo').remove()`)

  // item sem ação: desabilitado com motivo, não some
  await openMenu('Arquivo')
  await until(menus, 1)
  assert.equal(await ev(`[...document.querySelectorAll('.menu-item')].find((b) => b.textContent.startsWith('Clonar'))?.title`), 'Ainda não disponível')

  // clique fora só fecha: o botão embaixo não recebe o clique
  await press(...(await at('.toolbar-search'))) // "Buscar branch" (abriria a paleta)
  await until(menus, 0)
  await sleep(500)
  assert.equal(await ev(`!!document.querySelector('.palette')`), false, 'clique fora não pode acionar o que está embaixo')

  // teclado: ↓ navega, → abre submenu, ← volta, Enter executa
  await openMenu('Exibir')
  await until(menus, 1)
  await key('ArrowDown') // Tela cheia
  await key('ArrowDown') // Zoom
  await key('ArrowRight')
  await until(menus, 2)
  assert.deepEqual(await items(), ['Aumentar', 'Diminuir', 'Tamanho original'])
  await key('ArrowLeft')
  await until(menus, 1)
  for (let i = 0; i < 3; i++) await key('ArrowDown') // Abas, Favoritos, Painel esquerdo (pula o separador)
  assert.equal(await ev(`document.querySelector('.menu-item.active .menu-label').textContent`), 'Painel esquerdo')
  await key('Enter')
  await until(menus, 0)
  await until(() => ev(`document.querySelector('.panel-left').classList.contains('rail')`), true)

  // atalhos sem menu nativo: Ctrl+J, Ctrl+P, Ctrl+Z
  await ev(`document.body.focus()`)
  await key('j', { ctrlKey: true })
  await until(() => ev(`document.querySelector('.panel-left').classList.contains('rail')`), false)
  await key('p', { ctrlKey: true })
  await until(() => ev(`!!document.querySelector('.palette')`), true)
  await key('Escape')
  await until(() => ev(`!!document.querySelector('.palette')`), false)
  await ev(`document.activeElement.blur()`)
  await key('z', { ctrlKey: true })
  await until(branch, 'main')

  // maximizar pelo controle próprio
  const size = () => ev(`window.outerWidth + 'x' + window.outerHeight`)
  const before = await size()
  await ev(`document.querySelector('[aria-label=Maximizar]').click()`)
  await until(async () => (await size()) !== before, true)

  // Ctrl+W fecha a Aba
  await key('w', { ctrlKey: true })
  await until(() => ev(`document.querySelectorAll('[role=tab]').length`), 0)
  console.log('OK: menus da janela, foco no Editar, teclado, submenu, clique fora, atalhos e maximizar')
} finally {
  ui.close()
}
process.exit(0)
