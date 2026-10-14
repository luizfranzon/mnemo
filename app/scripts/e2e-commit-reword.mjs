// Painel do commit: título e descrição editáveis só no HEAD; "Atualizar mensagem" reescreve o commit.
// Uso: `bun run build:renderer && node scripts/e2e-commit-reword.mjs`
import assert from 'node:assert/strict'
import { launch, makeRepo } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
g('commit', '-q', '--allow-empty', '-m', 'antigo', '-m', 'corpo')
const ui = await launch(repo, 9348)
const { ev, until } = ui
const set = (sel, v) => ev(`(() => { const el = document.querySelector('${sel}'); Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
const btn = (t) => ev(`(() => { const b = [...document.querySelectorAll('.commit-msg-actions button')].find((x) => x.textContent === ${JSON.stringify(t)}); if (!b || b.disabled) return false; b.click(); return true })()`)
try {
  await until(() => ev(`document.querySelector('.commit-subject')?.value`), 'antigo')
  await until(() => ev(`document.querySelector('.commit-subject').readOnly`), false)
  await set('.commit-subject', 'novo')
  await set('.commit-body', 'corpo novo')
  await until(() => btn('Atualizar mensagem'), true)
  await until(() => g('log', '-1', '--format=%s|%b').toString().trim(), 'novo|corpo novo')
  await until(() => ev(`document.querySelector('.commit-subject')?.value`), 'novo')
  console.log('OK: editar mensagem do HEAD pelo painel')
} finally { ui.close() }
process.exit(0)
