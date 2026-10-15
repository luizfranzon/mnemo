// Painel de codificação do diff: Adivinhar, troca manual, Binário e volta ao Adivinhar ao trocar de arquivo.
import { writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { launch, makeRepo } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
const f = (n) => path.join(repo, n)
writeFileSync(f('l.txt'), Buffer.from('antigo\n'))
writeFileSync(f('u.txt'), 'x\n')
g('add', '.')
g('commit', '-q', '-m', 'x')
writeFileSync(f('l.txt'), Buffer.from('informa\xe7\xe3o sobre a a\xe7\xe3o do cora\xe7\xe3o\n', 'latin1'))
writeFileSync(f('u.txt'), 'y\n')

const ui = await launch(repo, 9361)
const { ev, until, send } = ui
const fileRow = (name) => `[...document.querySelectorAll('.wip-file')].find((r) => r.querySelector('.wip-name')?.textContent === ${JSON.stringify(name)})`
const label = () => ev(`document.querySelector('.diff-encoding')?.textContent ?? ''`)
const code = () => ev(`[...document.querySelectorAll('.diff-line.add .diff-code')].map((e) => e.textContent).join('|')`)
const pick = async (text) => {
  await ev(`document.querySelector('.diff-encoding').click()`)
  await until(() => ev(`!!document.querySelector('.author-filter input')`), true)
  await send('Input.insertText', { text })
  await new Promise((r) => setTimeout(r, 150))
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await until(() => ev(`!document.querySelector('.author-filter')`), true)
}
try {
  await until(() => ev(`!!document.querySelector('.graph-wip')`), true)
  await ev(`document.querySelector('.graph-wip').closest('.graph-row').click()`)
  await until(() => ev(`!!(${fileRow('l.txt')})`), true)
  await ev(`${fileRow('l.txt')}.click()`)
  await until(() => label(), 'Windows-1252 (Europa Ocidental) (adivinhada)')
  assert.match(await code(), /informação sobre a ação do coração/)

  await ev(`document.querySelector('.diff-encoding').click()`)
  await until(() => ev(`!!document.querySelector('.author-filter input')`), true)
  assert.equal(await ev(`document.querySelector('.enc-row').textContent`), 'Adivinhar codificação')
  assert.equal(await ev(`!!document.querySelector('.enc-row .enc-check svg')`), true, 'a opção atual leva o ícone de check')
  assert.equal(await ev(`document.querySelectorAll('.enc-row').length > 50`), true)
  await send('Page.captureScreenshot', { format: 'png' }).then((s) => writeFileSync(path.join(os.tmpdir(), 'mnemo-encoding-shot.png'), Buffer.from(s.result.data, 'base64')))
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await until(() => ev(`!document.querySelector('.author-filter')`), true)

  await ev(`document.querySelector('.diff-encoding').click()`)
  await until(() => ev(`!!document.querySelector('.author-filter input')`), true)
  await send('Input.insertText', { text: 'cp850' })
  await new Promise((r) => setTimeout(r, 150))
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await until(() => ev(`!document.querySelector('.author-filter')`), true)
  await until(() => label(), 'CP850 (Europa Ocidental)')
  assert.doesNotMatch(await code(), /informação/)

  await pick('binário')
  await until(() => ev(`document.querySelector('.diff-message')?.textContent ?? ''`), 'Arquivo binário: não há diff de texto para mostrar.')

  // outro arquivo: volta ao Adivinhar
  await ev(`${fileRow('u.txt')}.click()`)
  await until(() => label(), 'UTF-8')
  console.log('OK: codificação do diff')
} finally { ui.close() }
process.exit(0)
