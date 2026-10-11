import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@tokens'
import './styles.css'
import { App } from './components/App'
import { invoke } from './bridge'

// Exceções não tratadas da UI vão para o Log de diagnóstico (via core).
const logUi = (e: unknown) => {
  const message = e instanceof Error ? (e.stack ?? e.message) : String(e)
  void invoke('log_error', { context: 'ui', message }).catch(() => {})
}
window.addEventListener('error', (e) => logUi(e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => logUi(e.reason))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
