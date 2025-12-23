
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
    include: ['react', 'react-dom'], // Ensure React is pre-bundled and deduplicated
    esbuildOptions: {
      // Fix for React 19.2.x Activity error in Electron
      define: {
        global: 'globalThis',
      },
    },
  },
  resolve: {
    // Let Vite handle sql.js resolution naturally
    // Node.js modules (fs, path, crypto) are externalized by sql.js internally
    dedupe: ['react', 'react-dom'], // Ensure single React instance
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
      },
      output: {
        manualChunks: (id) => {
          // Split node_modules into separate chunks
          if (id.includes('node_modules')) {
            // React and React-DOM in their own chunk - ensure they're together
            // Match exact package names to avoid matching @react-pdf, @react-icons, react-router, etc.
            // Use regex to match exact package paths: node_modules/react/ or node_modules/react-dom/
            // This avoids false positives from packages like react-router, react-icons, @react-pdf, etc.
            if (/node_modules[\/\\]react[\/\\]/.test(id) && !/node_modules[\/\\]react-dom[\/\\]/.test(id) && !id.includes('@react')) {
              return 'react-vendor';
            }
            if (/node_modules[\/\\]react-dom[\/\\]/.test(id)) {
              return 'react-vendor'; // Keep react-dom with react
            }
            
            // SQL.js (WASM) in its own chunk - can be large
            if (id.includes('sql.js')) {
              return 'sqljs-vendor';
            }
            
            // Recharts (charting library) in its own chunk
            if (id.includes('recharts')) {
              return 'recharts-vendor';
            }
            
            // Excel handling library
            if (id.includes('xlsx')) {
              return 'xlsx-vendor';
            }
            
            // Google GenAI (AI library) - can be large
            if (id.includes('@google/genai')) {
              return 'genai-vendor';
            }
            
            // QR Code libraries
            if (id.includes('qrcode') || id.includes('html5-qrcode')) {
              return 'qrcode-vendor';
            }
            
            // Electron updater (only needed in Electron builds)
            if (id.includes('electron-updater')) {
              return 'electron-vendor';
            }
            
            // PeerJS (P2P library)
            if (id.includes('peerjs')) {
              return 'peerjs-vendor';
            }
            
            // Lucide React (icons) - can be large if tree-shaking isn't optimal
            if (id.includes('lucide-react')) {
              return 'icons-vendor';
            }
            
            // All other node_modules go into a vendor chunk
            return 'vendor';
          }
        }
      }
    },
    // Increase chunk size warning limit if needed (optional)
    // chunkSizeWarningLimit: 1000
  },
  // Plugin to copy icon.ico to dist after build
  plugins: [
    react(), 
    suppressSqlJsWarnings(),
    {
      name: 'remove-external-resources',
      transformIndexHtml(html) {
        // Remove importmap from production build - dependencies are bundled by Vite
        // Importmap is only needed for development with CDN imports
        let result = html.replace(
          /<script type="importmap">[\s\S]*?<\/script>/g,
          '<!-- Importmap removed in production build - dependencies are bundled -->'
        )
        
        // Remove Tailwind CDN script - Tailwind is bundled in index.css
        result = result.replace(
          /<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>/g,
          '<!-- Tailwind CDN removed in production build - bundled in CSS -->'
        )
        
        // Remove Tailwind config script (not needed in production)
        // Match multiline script with tailwind.config - use non-greedy match
        result = result.replace(
          /<script>[\s\S]*?tailwind\.config[\s\S]*?<\/script>/g,
          '<!-- Tailwind config removed in production build -->'
        )
        
        // Service worker registration is kept in the HTML for browser PWA support
        // PWAContext.tsx handles Electron detection at runtime and skips service worker logic in Electron
        // In Electron (file:// protocol), service worker registration will fail gracefully
        // In browsers (http/https), service worker will register successfully for PWA functionality
        // This allows the same build to work in both Electron and browser environments
        
        return result
      }
    },
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
