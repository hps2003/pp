import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// 建置輸出到 repo 根目錄的 /reqmanager，GitHub Pages 發布於 https://hps2003.github.io/pp/reqmanager/
// base 使用相對路徑，部署在任何子路徑都能運作。
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../../reqmanager'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // 本機開發時，若同時執行 `npm run server`，/api 會轉給 Node API 伺服器
    proxy: { '/api': 'http://localhost:8787' },
  },
})
