import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const dir = resolve(import.meta.dirname, '..', 'design-system')
const tokens = JSON.parse(readFileSync(resolve(dir, 'tokens.json'), 'utf8'))

const alias = (value) => value.replace(/\{([^}]+)\}/g, (_, path) => `var(--${path.split('.').at(-1)})`)

const seen = new Set()
const blocks = Object.entries(tokens).map(([group, entries]) => {
  const lines = Object.entries(entries)
    .filter(([name]) => !name.startsWith('$'))
    .map(([name, token]) => {
      if (seen.has(name)) throw new Error(`token duplicado: ${name}`)
      seen.add(name)
      if (typeof token.$value !== 'string') throw new Error(`token sem $value: ${group}.${name}`)
      return `  --${name}: ${alias(token.$value)};`
    })
  return `  /* ${group} */\n${lines.join('\n')}`
})

const css = `/* Gerado por scripts/build-tokens.mjs a partir de tokens.json. Não editar à mão. */\n\n:root {\n${blocks.join('\n\n')}\n}\n`
writeFileSync(resolve(dir, 'tokens.css'), css)
console.log(`tokens.css: ${seen.size} tokens`)
