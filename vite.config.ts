import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Em produção o mesmo Nginx serve esta aplicação e encaminha `/auth` e `/videos`. O proxy
 * abaixo reproduz isso no `npm run dev`, então o código não precisa saber onde está
 * rodando: em qualquer um dos dois casos as chamadas saem na mesma origem, sem CORS.
 *
 * `ws: true` em `/videos` é o que faz o WebSocket de atualizações atravessar o proxy.
 */
const gateway = process.env.GATEWAY_URL ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': { target: gateway, changeOrigin: true },
      '/videos': { target: gateway, changeOrigin: true, ws: true },
    },
  },
})
