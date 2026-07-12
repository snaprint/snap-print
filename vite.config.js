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
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
