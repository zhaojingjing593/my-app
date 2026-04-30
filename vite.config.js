import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'electron' ? './' : './',
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
      '/.netlify/functions/translate/mymemory': {
        target: 'https://api.mymemory.translated.net',
        changeOrigin: true,
        rewrite: (path) => path.replace('/.netlify/functions/translate/mymemory', '/get'),
      },
      '/.netlify/functions/translate/youdao': {
        target: 'https://fanyi.youdao.com',
        changeOrigin: true,
        rewrite: (path) => path.replace('/.netlify/functions/translate/youdao', '/translate'),
      },
    },
  },
  define: {
    'import.meta.env.VITE_IS_ELECTRON': JSON.stringify(mode === 'electron'),
  },
}))
