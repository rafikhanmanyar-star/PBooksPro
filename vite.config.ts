
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync } from 'fs'
import { join } from 'path'

// Plugin to suppress sql.js Node.js module warnings
// These warnings are harmless - sql.js handles Node.js modules internally
const suppressSqlJsWarnings = () => {
  return {
    name: 'suppress-sqljs-warnings',
    enforce: 'pre' as const,
    resolveId(id, importer) {
      // If sql.js is trying to import Node.js modules, provide empty stubs
      if (importer && (importer.includes('sql.js') || importer.includes('sql-wasm.js'))) {
        if (id === 'fs' || id === 'path' || id === 'crypto') {
          // Return a virtual module ID that resolves to an empty module
          return `\0${id}-stub`;
        }
      }
      return null;
    },
    load(id) {
      // Provide empty stubs for Node.js modules when imported by sql.js
      if (id === '\0fs-stub' || id === '\0path-stub' || id === '\0crypto-stub') {
        return 'export default {};';
      }
      return null;
    }
  };
};

// https://vitejs.dev/config/
export default defineConfig({
  base: './', // CRITICAL: This ensures assets load correctly in Electron (file:// protocol)
  define: {
    // Expose environment variables to the client
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY || process.env.VITE_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || ''),
    'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY || process.env.VITE_API_KEY || ''),
  },
  assetsInclude: ['**/*.wasm'], // Include WASM files as assets
  optimizeDeps: {
    exclude: ['sql.js'], // Exclude sql.js from pre-bundling
  },
  resolve: {
    // Let Vite handle sql.js resolution naturally
    // Node.js modules (fs, path, crypto) are externalized by sql.js internally
  },
  // Handle CommonJS modules
  build: {
    commonjsOptions: {
      include: [/sql\.js/, /node_modules/],
      transformMixedEsModules: true,
      esmExternals: true
    },
    // Copy icon.ico to dist folder after build
    rollupOptions: {
      onwarn(warning, warn) {
        // Suppress specific warnings if needed
        if (warning.code === 'UNUSED_EXTERNAL_IMPORT') return
        warn(warning)
      }
    }
  },
  // Plugin to copy icon.ico to dist after build
  plugins: [
    react(), 
    suppressSqlJsWarnings(),
    {
      name: 'copy-icon',
      closeBundle() {
        // Copy icon.ico from build folder to dist folder
        const iconSource = join(process.cwd(), 'build', 'icon.ico')
        const iconDest = join(process.cwd(), 'dist', 'icon.ico')
        if (existsSync(iconSource)) {
          try {
            copyFileSync(iconSource, iconDest)
            console.log('✅ Copied icon.ico to dist folder')
          } catch (error) {
            console.warn('⚠️ Failed to copy icon.ico:', error)
          }
        }
      }
    }
  ],
  server: {
    fs: {
      // Allow serving files from node_modules
      allow: ['..']
    }
  }
})
