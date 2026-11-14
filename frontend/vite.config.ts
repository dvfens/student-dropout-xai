import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Fail loudly if 5173 is taken instead of silently moving to another port.
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
