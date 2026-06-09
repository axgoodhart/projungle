import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Electron loads the production build over file:// (win.loadFile(dist/index.html)).
// Vite tags the emitted <script type=module> and <link> with `crossorigin`, which
// forces CORS mode and fails under file:// — a classic Electron+Vite boot error.
// Strip it so the built renderer loads from disk.
function stripCrossorigin() {
  return {
    name: 'keeper-strip-crossorigin',
    transformIndexHtml(html) {
      return html.replace(/\s+crossorigin\b/g, '');
    },
  };
}

// Keeper renderer build.
// - root is the Preact renderer; the legacy canvas (src/app.js, src/styles.css)
//   lives one level up and is pulled in by the Canvas tab without modification.
// - base './' keeps asset URLs relative so the built dist/ loads under file://.
export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [preact(), stripCrossorigin()],
  server: {
    port: 5173,
    strictPort: true,
    // Allow importing the legacy canvas files that live outside the renderer root.
    fs: { strict: false },
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    // Avoid Vite's inline modulepreload polyfill (extra inline script; unneeded here).
    modulePreload: { polyfill: false },
  },
});
