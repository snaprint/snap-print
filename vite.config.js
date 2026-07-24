import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
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
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
