import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  server: {
    proxy: {
      '/auth': 'http://localhost:3000',
      '/sync': 'http://localhost:3000',
      '/stats': 'http://localhost:3000',
    }
  },
  build: {
    outDir: 'dist'
  }
})


