// Descartar tudo, Desfazer e conflito com cópia ao lado, pela UI. Uso: `bun run build && node scripts/e2e-discard.mjs`
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { launch, makeRepo } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
const f = (n) => path.join(repo, n)
const read = (n) => readFileSync(f(n), 'utf8').split(/\r?\n/).join('\n') // autocrlf no Windows
writeFileSync(f('a.txt'), 'original\n')
g('add', '.')
g('commit', '-q', '-m', 'x')
writeFileSync(f('a.txt'), 'mudado\n')
writeFileSync(f('b.txt'), 'novo\n')

const ui = await launch(repo, 9334)
const { ev, until, click } = ui
const text = (sel) => ev(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`)
try {
  await until(() => text('[data-testid=current-branch]'), 'main')

  // descartar: confirmação mostra a contagem e some com as mudanças
  await until(() => click('Descartar tudo'), true)
  await until(() => ev(`document.querySelector('.modal')?.textContent.includes('1 arquivo(s) rastreado(s) e 1 novo(s)') ?? false`), true)
  await click('Descartar')
  await until(() => existsSync(f('b.txt')), false)
  assert.equal(read('a.txt'), 'original\n')

  // desfazer: tudo volta
  await until(() => click('Desfazer'), true)
  await until(() => existsSync(f('b.txt')), true)
  assert.equal(read('a.txt'), 'mudado\n')

  // conflito: descarta, edita a mesma região e desfaz → nada muda e a UI oferece a cópia ao lado
  await until(() => click('Descartar tudo'), true)
  await until(() => ev(`!!document.querySelector('.modal')`), true)
  await click('Descartar')
  await until(() => existsSync(f('b.txt')), false)
  writeFileSync(f('a.txt'), 'outra edicao\n')
  await until(() => click('Desfazer'), true)
  await until(() => text('.modal h2'), 'Conflito ao desfazer')
  assert.equal(read('a.txt'), 'outra edicao\n')
  await click('Restaurar como cópia ao lado')
  await until(() => existsSync(f('a.txt.mnemo-restaurado')), true)
  assert.equal(read('a.txt.mnemo-restaurado'), 'mudado\n')
  console.log('OK: descartar, desfazer, conflito com cópia ao lado')
} finally {
  ui.close()
}
process.exit(0)
