import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const repository = env.GITHUB_REPOSITORY?.split('/')[1]
  const pagesBase = repository ? `/${repository}/` : '/'

  return {
    base: mode === 'public' ? pagesBase : '/',
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        '/api': 'http://127.0.0.1:4174',
      },
    },
  }
})
