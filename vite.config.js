import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
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
