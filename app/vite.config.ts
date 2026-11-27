import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const { version } = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')) as { version: string }

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  resolve: { alias: { '@tokens': resolve(import.meta.dirname, 'design-system/tokens.css') } },
  server: { fs: { allow: ['..'] } },
  build: { outDir: 'dist', emptyOutDir: true },
})
