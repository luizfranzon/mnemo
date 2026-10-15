// Painel direito pela UI real: detalhe do commit, pais clicáveis, Árvore e "Todos os arquivos".
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { launch, makeRepo } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
g('commit', '-q', '--allow-empty', '-m', 'inicial')
mkdirSync(path.join(repo, 'src/pasta com espaço'), { recursive: true })
writeFileSync(path.join(repo, 'src/pasta com espaço/ação.txt'), 'a\nb\n')
writeFileSync(path.join(repo, 'raiz.txt'), 'r\n')
g('add', '.')
g('commit', '-q', '-m', 'segundo', '-m', 'corpo da descrição')
const ui = await launch(repo, 9341)
const { ev, until } = ui
const text = (sel) => ev(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`)
try {
  await until(() => ev(`document.querySelector('.commit-subject')?.value`), 'segundo')
  assert.equal(await ev(`document.querySelector('.commit-body')?.value`), 'corpo da descrição')
  await until(() => ev(`document.querySelectorAll('.commit-file').length`), 2)
  assert.match(await text('.commit-summary'), /2 adicionados/)
  assert.match(await text('.commit-summary'), /\+3/)
  await ev(`[...document.querySelectorAll('.segmented .seg-btn')].find((b) => b.textContent === 'Árvore').click()`)
  await until(() => ev(`!!document.querySelector('.commit-dir')`), true)
  await ev(`document.querySelector('.commit-parents a').click()`)
  await until(() => ev(`document.querySelector('.commit-subject')?.value`), 'inicial')
  console.log('OK: detalhe, árvore e pai clicável')
} finally { ui.close() }
process.exit(0)
