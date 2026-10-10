import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  base: './',
  plugins: [react({ babel: { plugins: ['babel-plugin-react-compiler'] } })],
  resolve: { alias: { '@tokens': resolve(import.meta.dirname, '../claude-design/design-system/tokens.css') } },
  server: { fs: { allow: ['..'] } },
  build: { outDir: 'dist', emptyOutDir: true },
})
