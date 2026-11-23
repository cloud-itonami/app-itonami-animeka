import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Tauri frontendDist is ../dist. Vite builds Svelte 5 + TS (views copied
// verbatim from appview/.../svelte/src/views, only the shell + XRPC base
// are animeka-app specific). No SvelteKit: App.svelte is a client-side
// single-page router (history.pushState + popstate), so plain Vite suffices.
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
});
