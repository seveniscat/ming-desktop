import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/main.ts') }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/preload.ts') }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  },
  renderer: {
    plugins: [
      react(),
      {
        name: 'serve-vditor-assets',
        configureServer(server) {
          // Return early for requests that don't match
          server.middlewares.use('/dist/js/i18n', (req, res, next) => {
            if (!req.url || !req.url.endsWith('.js')) {
              return next()
            }
            
            const vditorI18nPath = resolve(__dirname, 'node_modules/vditor/dist/js/i18n')
            const filePath = resolve(vditorI18nPath, req.url.replace('/dist/js/i18n/', ''))
            
            if (filePath.startsWith(vditorI18nPath) && fs.existsSync(filePath)) {
              res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
              fs.createReadStream(filePath).pipe(res)
            } else {
              next()
            }
          })
        }
      }
    ],
    root: resolve(__dirname, 'src/renderer'),
    build: {
      outDir: resolve(__dirname, 'dist/renderer'),
      emptyOutDir: true
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer')
      }
    },
    server: {
      port: 5188,
      strictPort: true
    }
  }
})
