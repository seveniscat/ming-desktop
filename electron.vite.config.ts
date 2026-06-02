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
          // Register middleware without path filter, handle path matching inside
          server.middlewares.use((req, res, next) => {
            // Only handle requests to /dist/js/i18n/
            if (!req.url || !req.url.includes('/dist/js/i18n/')) {
              return next()
            }
            
            // Extract filename from URL (e.g., /dist/js/i18n/en_US.js -> en_US.js)
            const filename = req.url.split('/').pop()
            if (!filename || !filename.endsWith('.js')) {
              return next()
            }
            
            const vditorI18nPath = resolve(__dirname, 'node_modules/vditor/dist/js/i18n')
            const filePath = resolve(vditorI18nPath, filename)
            
            console.log('[Vditor Assets] Checking:', filePath)
            
            if (fs.existsSync(filePath)) {
              res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
              fs.createReadStream(filePath).pipe(res)
            } else {
              console.log('[Vditor Assets] Not found:', filePath)
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
