// Compila o addon napi (mnemo-node) e copia a biblioteca para app/native/mnemo.node.
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const release = process.argv.includes('--release')
execFileSync('cargo', ['build', '-p', 'mnemo-node', ...(release ? ['--release'] : [])], { cwd: root, stdio: 'inherit' })

const lib = { win32: 'mnemo_node.dll', darwin: 'libmnemo_node.dylib', linux: 'libmnemo_node.so' }[process.platform]
if (!lib) throw new Error(`plataforma sem suporte: ${process.platform}`)
const out = join(root, 'app', 'native')
mkdirSync(out, { recursive: true })
copyFileSync(join(root, 'target', release ? 'release' : 'debug', lib), join(out, 'mnemo.node'))
