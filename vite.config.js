import { resolve } from 'path';
import { rm } from 'fs/promises';
import { readFileSync } from 'fs';
import { defineConfig } from 'vite';

// F-17: raw/source image folders that live inside public/ on the owner's
// machine (git-ignored; scripts/convert-images.js reads them) must never be
// deployed. Vite copies all of public/ into dist/, so drop them after build.
const RAW_IMAGE_DIRS = [
  'images/products_png',
  'images/hero_png',
  'images/raw_downloaded_images',
  'images/raw_images_nano_banana_automated',
];
function dropRawImages() {
  return {
    name: 'snaprint-drop-raw-images',
    apply: 'build',
    async closeBundle() {
      for (const dir of RAW_IMAGE_DIRS) {
        await rm(resolve(__dirname, 'dist', dir), { recursive: true, force: true });
      }
    },
  };
}

// R-3: one source for the shared page shell. A page writes
// `<!-- @include navbar -->` and the build (and dev server) replaces it with
// src/partials/navbar.html. Output is plain HTML, so no flash and no JS needed.
const PARTIALS_DIR = resolve(__dirname, 'src/partials');
function htmlPartials() {
  return {
    name: 'snaprint-html-partials',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(/<!--\s*@include\s+([\w-]+)\s*-->/g, (_, name) =>
          readFileSync(resolve(PARTIALS_DIR, `${name}.html`), 'utf8').trimEnd());
      },
    },
    handleHotUpdate({ file, server }) {
      if (file.startsWith(PARTIALS_DIR.replace(/\\/g, '/')) || file.startsWith(PARTIALS_DIR)) {
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
}

export default defineConfig({
  plugins: [htmlPartials(), dropRawImages()],
  root: 'src',
  // F-21: read .env from the project root, not from `root` (src/). Without
  // this, local builds/dev got no VITE_* values and silently used sample data.
  // Cloudflare builds use real environment variables, which always win.
  envDir: __dirname,
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        product: resolve(__dirname, 'src/product.html'),
        cart: resolve(__dirname, 'src/cart.html'),
        checkout: resolve(__dirname, 'src/checkout.html'),
        quote: resolve(__dirname, 'src/quote.html'),
        'thank-you': resolve(__dirname, 'src/thank-you.html'),
        about: resolve(__dirname, 'src/about.html'),
        'track-order': resolve(__dirname, 'src/track-order.html'),
        'refund-policy': resolve(__dirname, 'src/refund-policy.html'),
        'shipping-policy': resolve(__dirname, 'src/shipping-policy.html'),
        terms: resolve(__dirname, 'src/terms.html'),
        'privacy-policy': resolve(__dirname, 'src/privacy-policy.html'),
        'seller-login': resolve(__dirname, 'src/seller-login.html'),
        'seller-dashboard': resolve(__dirname, 'src/seller-dashboard.html'),
        'cancel-order': resolve(__dirname, 'src/cancel-order.html'),
        faq: resolve(__dirname, 'src/faq.html'),
        contact: resolve(__dirname, 'src/contact.html'),
        account: resolve(__dirname, 'src/account.html'),
        notfound: resolve(__dirname, 'src/404.html'),
      },
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
        },
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
