import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// fontes empacotadas (offline); os nomes batem com --font-ui / --font-mono do tokens.css
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@tokens'
import './styles.css'
import './scrollbars'
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
