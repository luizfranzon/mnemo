// Painel do commit: título e descrição editáveis "Atualizar mensagem" reescreve o commit.
// Uso: `bun run build:renderer && node scripts/e2e-commit-reword.mjs`
import assert from 'node:assert/strict'
import { launch, makeRepo } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
g('commit', '-q', '--allow-empty', '-m', 'antigo', '-m', 'corpo')
g('commit', '-q', '--allow-empty', '-m', 'topo')
const ui = await launch(repo, 9348)
const { ev, until } = ui
const set = (sel, v) => ev(`(() => { const el = document.querySelector('${sel}'); Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
const btn = (t) => ev(`(() => { const b = [...document.querySelectorAll('.commit-msg-actions button')].find((x) => x.textContent === ${JSON.stringify(t)}); if (!b || b.disabled) return false; b.click(); return true })()`)
try {
  await until(() => ev(`document.querySelectorAll('.graph-row').length > 2`), true)
  await ev(`[...document.querySelectorAll('.graph-row')].find((r) => r.textContent.includes('antigo')).click()`)
  await until(() => ev(`document.querySelector('.commit-subject')?.value`), 'antigo')
  await set('.commit-subject', 'novo')
  await set('.commit-body', 'corpo novo')
  await until(() => btn('Atualizar mensagem'), true)
  await until(() => g('log', '-2', '--format=%s|%b').toString().replace(/\n+/g, ' ').trim(), 'topo| novo|corpo novo')
  console.log('OK: editar mensagem de commit antigo pelo painel')
} finally { ui.close() }
process.exit(0)
