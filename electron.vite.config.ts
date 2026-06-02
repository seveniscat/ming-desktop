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
          // Serve all Vditor dist assets (js, css, etc.)
          server.middlewares.use((req, res, next) => {
            // Only handle requests to /dist/ (Vditor's dist directory)
            if (!req.url || !req.url.startsWith('/dist/')) {
              return next()
            }
            
            // Extract the path after /dist/
            const relativePath = req.url.replace('/dist/', '')
            const vditorDistPath = resolve(__dirname, 'node_modules/vditor/dist')
            const filePath = resolve(vditorDistPath, relativePath)
            
            // Security check: ensure the file is within vditor/dist
            if (!filePath.startsWith(vditorDistPath)) {
              return next()
            }
            
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              // Set appropriate content type
              const ext = filePath.split('.').pop()?.toLowerCase()
              const contentTypeMap: Record<string, string> = {
                'js': 'application/javascript; charset=utf-8',
                'css': 'text/css; charset=utf-8',
                'json': 'application/json; charset=utf-8',
                'woff': 'font/woff',
                'woff2': 'font/woff2',
                'ttf': 'font/ttf',
                'eot': 'application/vnd.ms-fontobject',
                'svg': 'image/svg+xml',
              }
              
              res.setHeader('Content-Type', contentTypeMap[ext || ''] || 'application/octet-stream')
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
