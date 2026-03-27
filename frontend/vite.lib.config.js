import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Library build to be consumed by a host app (e.g. react_on_rails).
// Standalone Vite app build remains in `vite.config.js`.
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: './src/index.js',
      name: 'BidCollectionsUI',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'cjs' ? 'index.cjs' : 'index.js')
    },
    rollupOptions: {
      // Host provides these (avoid duplicate React copies).
      external: ['react', 'react-dom', 'react-router-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react-router-dom': 'ReactRouterDOM'
        }
      }
    }
  }
})

