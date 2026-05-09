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
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          const normalizedId = id.replace(/\\/g, '/');
          if (normalizedId.includes('/node_modules/livekit-client/')) return 'livekit-client-vendor';
          if (
            normalizedId.includes('/node_modules/@livekit/components-react/') ||
            normalizedId.includes('/node_modules/@livekit/components-styles/')
          ) return 'livekit-components-vendor';
          if (normalizedId.includes('/node_modules/@livekit/')) return 'livekit-core-vendor';
          if (
            normalizedId.includes('/node_modules/recharts/') ||
            normalizedId.includes('/node_modules/d3-')
          ) return 'charts-vendor';
          if (
            normalizedId.includes('/node_modules/katex/') ||
            normalizedId.includes('/node_modules/react-markdown/') ||
            normalizedId.includes('/node_modules/micromark') ||
            normalizedId.includes('/node_modules/remark') ||
            normalizedId.includes('/node_modules/rehype') ||
            normalizedId.includes('/node_modules/unified/')
          ) return 'academic-rendering-vendor';
          if (
            normalizedId.includes('/node_modules/@radix-ui/') ||
            normalizedId.includes('/node_modules/cmdk/') ||
            normalizedId.includes('/node_modules/vaul/') ||
            normalizedId.includes('/node_modules/embla-carousel')
          ) return 'ui-vendor';
          if (normalizedId.includes('/node_modules/lucide-react/')) return 'icons-vendor';
          if (
            normalizedId.includes('/node_modules/react/') ||
            normalizedId.includes('/node_modules/react-dom/') ||
            normalizedId.includes('/node_modules/scheduler/')
          ) return 'react-vendor';
          if (normalizedId.includes('/node_modules/react-router')) return 'router-vendor';
          if (normalizedId.includes('/node_modules/framer-motion/')) return 'motion-vendor';
          if (
            normalizedId.includes('/node_modules/@tanstack/') ||
            normalizedId.includes('/node_modules/react-hook-form/') ||
            normalizedId.includes('/node_modules/@hookform/') ||
            normalizedId.includes('/node_modules/zod/')
          ) return 'forms-query-vendor';
          if (normalizedId.includes('/node_modules/date-fns/')) return 'date-vendor';
          if (
            normalizedId.includes('/node_modules/clsx/') ||
            normalizedId.includes('/node_modules/class-variance-authority/') ||
            normalizedId.includes('/node_modules/tailwind-merge/') ||
            normalizedId.includes('/node_modules/sonner/') ||
            normalizedId.includes('/node_modules/next-themes/')
          ) return 'ui-utils-vendor';
          return undefined;
        },
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
