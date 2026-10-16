// Falha se a versão do app e do core divergem ou se o CHANGELOG.md não tem a seção da versão atual.
// Com `--print`, só imprime a versão (usado pelo workflow de release).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (f) => readFileSync(join(root, f), 'utf8')

const app = JSON.parse(read('app/package.json')).version
if (process.argv.includes('--print')) {
  console.log(app)
  process.exit(0)
}

const core = read('Cargo.toml').match(/^\[workspace\.package\][^[]*?^version = "([^"]+)"/ms)?.[1]
const errors = []
if (core !== app) errors.push(`versões diferentes: app/package.json=${app}, Cargo.toml=${core}`)
if (!new RegExp(`^## \\[${app.replaceAll('.', '\\.')}\\]`, 'm').test(read('CHANGELOG.md'))) errors.push(`CHANGELOG.md sem a seção "## [${app}]"`)
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log(`versão ${app} ok`)
