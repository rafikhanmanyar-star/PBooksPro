import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Log environment variable during build (for debugging)
const adminApiUrl = process.env.VITE_ADMIN_API_URL || 'http://localhost:3000/api/admin';
console.log('🔧 Building with VITE_ADMIN_API_URL:', adminApiUrl);

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
  // Explicitly define environment variables
  define: {
    'import.meta.env.VITE_ADMIN_API_URL': JSON.stringify(adminApiUrl)
  }
});

