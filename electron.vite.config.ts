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
          server.middlewares.use('/dist/js', (req, res, next) => {
            const vditorJsPath = resolve(__dirname, 'node_modules/vditor/dist/js')
            const filePath = resolve(vditorJsPath, req.url || '')
            if (filePath.startsWith(vditorJsPath) && fs.existsSync(filePath)) {
              res.setHeader('Content-Type', 'application/javascript')
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
