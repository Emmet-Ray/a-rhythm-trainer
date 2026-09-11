import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 保留 /api 前缀，与 FastAPI 路由一致；不代理前端页面路径。
      '^/api(?:/|$)': 'http://127.0.0.1:8000',
    },
  },
})
