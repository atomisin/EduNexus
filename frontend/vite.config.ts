import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

const packageJson = require('./package.json')

export default defineConfig(({ mode }) => ({
  base: '/',
  plugins: [
    mode === 'development' && inspectAttr(),
    react()
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['node_modules', 'src/test/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        'src/test/e2e/',
        'src/generated/',
        '**/*.d.ts',
        '**/*.config.*',
      ]
    }
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: mode === 'production' 
          ? 'assets/[name]-[hash].js' 
          : 'assets/[name].js',
        chunkFileNames: mode === 'production' 
          ? 'assets/[name]-[hash].js' 
          : 'assets/[name].js',
        assetFileNames: mode === 'production' 
          ? 'assets/[name]-[hash][extname]' 
          : 'assets/[name][extname]',
      },
    },
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version || '1.0.0'),
    'import.meta.env.VITE_BUILD_TIMESTAMP': JSON.stringify(Date.now().toString()),
  },
}));
