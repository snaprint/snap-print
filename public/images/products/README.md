# Product Images

Place your product images in this folder. They'll be included in the Cloudflare Pages build automatically.

## Naming Convention
Use the product ID as the filename prefix for easy matching:
- `TOY-001.jpg` → Dragon Figurine
- `TOY-002.jpg` → Chibi Fox
- `DEC-001.jpg` → Moon Phase Lamp

For multiple images per product, add a suffix:
- `TOY-001-1.jpg` (main)
- `TOY-001-2.jpg` (alternate angle)
- `TOY-001-3.jpg` (detail)

## Google Sheet `image_urls` Column
In your Products Google Sheet, use paths like:
```
/images/products/TOY-001.jpg
```
For multiple images (comma-separated):
```
/images/products/TOY-001-1.jpg,/images/products/TOY-001-2.jpg,/images/products/TOY-001-3.jpg
```

These relative paths will automatically resolve to `https://snaprint.in/images/products/TOY-001.jpg` when the site is deployed.
