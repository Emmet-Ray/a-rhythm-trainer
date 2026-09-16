import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin, type ViteDevServer } from 'vite'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

// 仅开发与本地预览提供内容路由；build 不复制题库，正式环境单独部署 content/。
function presetContent(): Plugin {
  const directory = process.env.PRESET_CONTENT_DIR || fileURLToPath(new URL('../content/', import.meta.url))
  const configure = (server: Pick<ViteDevServer, 'middlewares'>) => {
    server.middlewares.use((request, response, next) => {
      if (request.url?.split('?')[0] !== '/content/preset-exercises.json') return next()
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' }).end()
        return
      }
      void readFile(resolve(directory, 'preset-exercises.json')).then(content => {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' })
        response.end(request.method === 'HEAD' ? undefined : content)
      }, () => {
        response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
        response.end('Preset catalog unavailable')
      })
    })
  }
  return { name: 'independent-preset-content', configureServer: configure, configurePreviewServer: configure }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), presetContent()],
  server: {
    proxy: {
      // 保留 /api 前缀，与 FastAPI 路由一致；不代理前端页面路径。
      '^/api(?:/|$)': 'http://127.0.0.1:8000',
    },
  },
})
