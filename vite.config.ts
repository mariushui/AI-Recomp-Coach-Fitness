/// <reference types="vitest" />
import path from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// BASE_PATH wird beim Deployment auf GitHub Pages gesetzt (z. B. /AI-Recomp-Coach-Fitness/).
// Der KI-Key gehört NICHT hierher. Er liegt nur als Secret in Supabase (siehe docs/SETUP.md).
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  server: { port: 3000, host: '0.0.0.0' },
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: { include: ['tests/**/*.test.ts'] },
});
