import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Fail loudly if 5173 is taken instead of silently moving to another port.
  server: { port: 5173, strictPort: true },
  // A production build calls the API on its own origin, so `npm run preview` forwards it to the local backend.
  preview: {
    port: 4173,
    strictPort: true,
    proxy: { '/api': 'http://localhost:8000', '/static': 'http://localhost:8000' },
  },
});
