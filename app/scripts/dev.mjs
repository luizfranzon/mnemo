// Hot reload do renderer: sobe o Vite e abre o Electron apontando pra ele (MNEMO_DEV_URL).
// Mudanças em electron/ ou no mnemo-core exigem `bun run build` e reiniciar.
import { createServer } from 'vite'
import { spawn } from 'node:child_process'

const server = await createServer({ server: { port: 5173, strictPort: true } })
await server.listen()
const url = server.resolvedUrls.local[0]
const app = spawn('electron', ['.'], { stdio: 'inherit', env: { ...process.env, MNEMO_DEV_URL: url } })
app.on('exit', async (code) => { await server.close(); process.exit(code ?? 0) })
