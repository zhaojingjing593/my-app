import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'electron' ? './' : '/',
  build: {
    outDir: mode === 'electron' ? 'dist/renderer' : 'dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/.netlify/functions/arxiv': {
        target: 'https://export.arxiv.org',
        changeOrigin: true,
        rewrite: (path) => path.replace('/.netlify/functions/arxiv', '/api/query'),
      },
      '/.netlify/functions/translate': {
        target: 'https://translate.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace('/.netlify/functions/translate', '/translate_a/single'),
      },
    },
  },
  define: {
    'import.meta.env.VITE_IS_ELECTRON': JSON.stringify(mode === 'electron'),
  },
}))
