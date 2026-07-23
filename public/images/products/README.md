# Product Images

Place your product images in this folder in **WebP format**. They'll be included in the Cloudflare Pages build automatically.

## Naming Convention
Use the product ID as the filename prefix for easy matching:
- `TOY-001.webp` → Dragon Figurine
- `TOY-002.webp` → Chibi Fox
- `DEC-001.webp` → Moon Phase Lamp

For multiple images per product, add a suffix:
- `TOY-001-1.webp` (main)
- `TOY-001-2.webp` (alternate angle)
- `TOY-001-3.webp` (detail)

## Google Sheet `image_urls` Column
In your Products Google Sheet, use paths like:
```
/images/products/TOY-001.webp
```
For multiple images (comma-separated):
```
/images/products/TOY-001-1.webp,/images/products/TOY-001-2.webp,/images/products/TOY-001-3.webp
```

These relative paths will automatically resolve to `https://snaprint.in/images/products/TOY-001.webp` when the site is deployed.

## PNG Originals
Original PNG files are backed up locally in `../products_png/` (gitignored, never pushed to GitHub).
To re-convert, run `node scripts/convert-images.js` from the project root.
