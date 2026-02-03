
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'

// Read version from package.json
const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));

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
  base: '/',
  define: {
    // Expose environment variables to the client
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY || process.env.VITE_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || ''),
    'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY || process.env.VITE_API_KEY || ''),
    // Inject application version at build time
    'import.meta.env.APP_VERSION': JSON.stringify(packageJson.version),
  },
  assetsInclude: ['**/*.wasm'], // Include WASM files as assets
  optimizeDeps: {
    exclude: ['sql.js'], // Exclude sql.js from pre-bundling
    include: ['react', 'react-dom', 'socket.io-client'], // Ensure React and socket.io-client are pre-bundled
    esbuildOptions: {
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
    cssCodeSplit: false,
    commonjsOptions: {
      include: [/sql\.js/, /socket\.io-client/, /node_modules/],
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
        // PERFORMANCE OPTIMIZATION: Manual chunk splitting for better caching and parallel loading
        manualChunks: (id) => {
          // Large vendors
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
            if (id.includes('sql.js')) return 'vendor-db';
            if (id.includes('xlsx')) return 'vendor-xlsx';
            if (id.includes('google/genai')) return 'vendor-ai';
            return 'vendor-base';
          }
        },
        // Optimize chunk size warnings
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
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
        // Only strip importmap since dependencies are bundled by Vite
        const result = html.replace(
          /<script type="importmap">[\s\S]*?<\/script>/g,
          '<!-- Importmap removed in production build - dependencies are bundled -->'
        )
        return result
      }
    },
    {
      name: 'copy-icons',
      closeBundle() {
        // Copy icon files and service worker to dist folder
        const filesToCopy = [
          { source: join(process.cwd(), 'build', 'icon.ico'), dest: join(process.cwd(), 'dist', 'icon.ico') },
          { source: join(process.cwd(), 'public', 'icon.svg'), dest: join(process.cwd(), 'dist', 'assets', 'icon.svg') },
          { source: join(process.cwd(), 'icon.svg'), dest: join(process.cwd(), 'dist', 'icon.svg') },
          { source: join(process.cwd(), 'sw.js'), dest: join(process.cwd(), 'dist', 'sw.js') }
        ];

        filesToCopy.forEach(({ source, dest }) => {
          if (existsSync(source)) {
            try {
              copyFileSync(source, dest);
              console.log(`✅ Copied ${source.split(/[/\\]/).pop()} to dist folder`);
            } catch (error) {
              // Silently ignore - icons are optional during testing
            }
          }
        });
      }
    },
  ],
  server: {
    host: true, // Listen on 0.0.0.0 so other devices on the network can connect
    fs: {
      // Allow serving files from node_modules
      allow: ['..']
    }
  }
})
