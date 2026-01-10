import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path, { resolve } from 'path';
import { readFileSync } from 'fs';

// Read version from package.json (parent directory)
const packageJson = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));

// Get environment variable during build
// This will be replaced by Vite's built-in env variable replacement
const adminApiUrl = process.env.VITE_ADMIN_API_URL || 'http://localhost:3000/api/admin';
console.log('🔧 Building with VITE_ADMIN_API_URL:', adminApiUrl);
console.log('🔧 All env vars:', Object.keys(process.env).filter(k => k.startsWith('VITE_')));

export default defineConfig({
  plugins: [react()],
  root: __dirname, // Use admin directory as root
  publicDir: false, // Don't serve files from public directory
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    strictPort: false,
    host: true, // Allow external connections
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    emptyOutDir: true,
    // Add hash to filenames for cache busting
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  // Vite automatically replaces import.meta.env.VITE_* variables
  // But we'll also explicitly define it to ensure it works
  define: {
    'import.meta.env.VITE_ADMIN_API_URL': JSON.stringify(adminApiUrl),
    // Also try without the import.meta.env prefix (some Vite versions need this)
    'process.env.VITE_ADMIN_API_URL': JSON.stringify(adminApiUrl),
    // Inject application version at build time
    'import.meta.env.APP_VERSION': JSON.stringify(packageJson.version),
  }
});

