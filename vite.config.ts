
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
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

const isElectronBuild = process.env.VITE_ELECTRON_BUILD === 'true';

// Relative base so `dist/` loads from file:// in Electron when using `electron .` or loadFile().
// Plain `npm run build` must not emit `/assets/...` (breaks file://). Use VITE_BASE=/ or VITE_BASE=/subpath/
// when your host requires absolute public paths.
const base = isElectronBuild ? './' : (process.env.VITE_BASE || './');

// https://vitejs.dev/config/
export default defineConfig({
  base,
  esbuild: {
    // Strip console.log/warn/debug/info from production builds.
    // Keeps console.error for real error reporting.
    pure: process.env.NODE_ENV === 'production'
      ? ['console.log', 'console.warn', 'console.debug', 'console.info']
      : [],
  },
  define: {
    // Expose environment variables to the client
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY || process.env.VITE_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || ''),
    'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY || process.env.VITE_API_KEY || ''),
    // Inject application version at build time
    'import.meta.env.APP_VERSION': JSON.stringify(packageJson.version),
  },
  assetsInclude: isElectronBuild ? [] : ['**/*.wasm'],
  optimizeDeps: {
    exclude: isElectronBuild ? [] : ['sql.js'],
    include: ['react', 'react-dom'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    cssCodeSplit: true,
    commonjsOptions: {
      include: isElectronBuild ? [/node_modules/] : [/sql\.js/, /node_modules/],
      transformMixedEsModules: true,
      esmExternals: true
    },
    rollupOptions: {
      // In Electron builds, externalize sql.js (loaded separately). Do not externalize socket.io-client:
      // AppContext/useRecordLock import core/socket; a bare "socket.io-client" import breaks in the renderer.
      external: isElectronBuild ? ['sql.js'] : [],
      onwarn(warning, warn) {
        if (warning.code === 'UNUSED_EXTERNAL_IMPORT') return
        warn(warning)
      },
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
            if (!isElectronBuild && id.includes('sql.js')) return 'vendor-db';
            if (id.includes('xlsx')) return 'vendor-xlsx';
            if (id.includes('google/genai')) return 'vendor-ai';
            return 'vendor-base';
          }
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
  },
  plugins: [
    react(),
    ...(isElectronBuild ? [] : [suppressSqlJsWarnings()]),
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
      name: 'write-env-config',
      closeBundle() {
        const distDir = join(process.cwd(), 'dist');
        if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });
        const apiUrl = process.env.VITE_API_URL || '';
        const isStaging = process.env.VITE_STAGING === 'true' || apiUrl.includes('-staging') || apiUrl.includes('staging.onrender.com');
        writeFileSync(
          join(distDir, 'env-config.json'),
          JSON.stringify({ apiUrl, isStaging }, null, 2)
        );
        console.log(`✅ Wrote env-config.json (isStaging=${isStaging})`);
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
    port: 5174,
    host: true, // Listen on 0.0.0.0 so other devices on the network can connect
    fs: {
      // Allow serving files from node_modules
      allow: ['..']
    }
  }
})
