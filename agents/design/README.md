# R-1 · Design proposal (awaiting owner approval, O-9)

Static mockups live in this folder, outside `src/`, so they never deploy. Open them in a browser (double-click the file); they load fonts and the real product photos from the internet. Resize the window or use your phone's width to see the mobile layout.

| File | What it shows |
|---|---|
| `a-home.html` | **Direction A (recommended)**: home / catalog |
| `a-product.html` | **Direction A**: product page (Demon Slayer Set, real bulk tiers; +/− and thumbnails work) |
| `b-alternative.html` | **Direction B (alternative)**: home + product on one page |
| `direction-a.css` | Direction A tokens and components (becomes `src/css/index.css` tokens in R-4) |

All names, prices, categories, counts and images come from the live products sheet (17 Nov 2026). Names are shown in Title Case ("Buds on Tree"); see question 3.

---

## Why change

The current site works but looks generic: a black navbar, beige everywhere, Inter for everything, and grey image boxes. The products are strongest where they're **graphic**: black silhouettes on light walls, black / white / **red** HueForge prints, a red Kanagawa sun. The redesign should get out of the way of the photos and borrow that red.

## Direction A: "Paper & Vermilion" (recommended)

Feels like a small print studio's gallery: warm paper background, black ink, one vermilion accent used sparingly (Buy now, sale tags, focus rings, logo dot).

**Palette**

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#F7F3EC` | page background |
| `--surface` | `#FFFFFF` | cards, panels, inputs |
| `--sunken` | `#EFE9DF` | image wells, delivery box, hover |
| `--line` | `#E3DACB` | borders, hairlines |
| `--ink` | `#1B1A17` | text, primary buttons, footer |
| `--ink-2` / `--ink-3` | `#57524A` / `#8A8377` | secondary / muted text |
| `--red` | `#C8321F` | Buy now, sale pill, focus, active nav (white text on it passes WCAG AA) |
| `--green` / soft | `#2F6B4F` / `#E6F0EA` | in stock, savings |
| `--amber` / soft | `#9A5B00` / `#FBF0DD` | "Only 1 left" |

**Type (Google Fonts):** *Bricolage Grotesque* 600/800 for headings and prices (a bit of hand-made character); *Inter* 400–700 for body and UI (kept, so text stays as readable as today).

**Shape and spacing:** 4-px spacing scale (4, 8, 12, 16, 24, 32, 48, 72). Radius 8 (inputs, thumbs) / 14 (cards, images) / 22 (hero, bands). Buttons are 48-px-tall pills: **ink** = Add to cart / main actions, **red** = Buy it now (one per screen), **outline** = secondary. Soft shadow only on floating things (add buttons, sticky bars).

**Tone:** short, warm and concrete. "Art you can hold. Printed for you." Numbers over adjectives ("Air 3–5 business days", "Bulk from ₹270"). No exclamation marks in UI text.

**Navbar:** light and sticky (blurred paper), wordmark with a red dot, links Shop ▾ (category menu) · Custom parts · Track order · About, a real search field on desktop, and account + cart icons. On mobile: logo, search, account, cart and menu icons, all 44 px touch targets. Replaces today's black bar.

**Product cards:** 4:5 photo with rounded corners; tags top-left (−17%, Bulk from ₹270, Only 1 left, Sold out); a round "+" quick-add bottom-right; category in small caps, name, price with the old price struck through. Two columns on phones, 3–4 on desktop. Sold-out cards fade the photo.

**Product page:** gallery (thumbs on the left on desktop, a full-bleed photo on phones), title, price + Save% + stock pill, bulk tiers as three tap-able boxes that light up with the quantity, stepper + Add to cart + Buy it now, a delivery box (approved Air/Surface wording + free-shipping thresholds from the shipping sheet), and Description / Details / Damaged-on-arrival folds. Phones get a sticky bottom bar with price + Add to cart.

**Checkout (no mockup yet, built in R-5):** one column on phones, two on desktop with a sticky order summary. Steps shown as numbered sections: 1 Sign in → 2 Address (saved-address cards, then the form) → 3 Shipping (radio cards rendered from the sheet, F-9, with free-shipping progress) → 4 Pay (one red "Pay ₹…" button, sticky on phones; Razorpay + "secure payment" note). Same tokens, no new logic.

## Direction B: "Layer Lines" (alternative)

Bolder, maker/tech look: off-white `#F2F1EC`, ink `#0E0E0C`, filament orange `#FF5B14`, lime highlight `#D9F24F`; *Space Grotesk* headings, *JetBrains Mono* labels, *Inter* body; 4-px corners, 1.5-px ink outlines, offset "pressed" shadows on buttons, spec boxes and a bordered bulk table. More distinctive and more "3D printing", but louder: it competes with the colourful HueForge photos, and the mono/uppercase style is harder to read for long text. I'd choose it if the shop leans toward custom engineering parts more than decor and gifts.

## R-3: one navbar and one footer (proposal)

Today the navbar and footer are copy-pasted into 16 pages (and have already drifted: F-14).

- **Recommended: build-time partials.** Put `src/partials/navbar.html` and `footer.html` in the repo and add a ~20-line plugin to `vite.config.js` (`transformIndexHtml`) that replaces `<!-- @include navbar -->` in each page while building. The output is plain HTML exactly as today: no flash, works without JavaScript, good for SEO, no new dependency. The active link comes from `<body data-page="shop">`.
- *Alternative:* `main.js` injects the HTML at runtime. Simpler, but the header appears after the script runs (layout jump) and is missing without JS.
- *Alternative:* the `vite-plugin-handlebars` package. Same result as the recommendation, plus a dependency.

R-3 also folds in F-14 (favicon, Track-order link everywhere, account footer, robots.txt) and the duplicated state `<select>`.

## What I need from you

1. **Direction:** approve **A**, choose **B**, or tell me what to change (colours, fonts, the red, copy). Then I do R-2 (`agents/DESIGN_TOKENS.md` for the email templates), R-3, R-4 and R-5 in that order.
2. **R-3 approach:** OK with build-time partials?
3. **Product names:** about 30 sheet names are file names (`buds_on_tree`, `tanjiro_3_color`). Either you rename them in the sheet (best for SEO and emails), or I add a display fallback that turns `snake_case` into Title Case on the site. Which?
4. **Sheet data to check (I didn't change it):** Hue-012 to Hue-015 have bulk tiers `1-2:100 | 3-5:449 | …`, so 1–2 cost ₹100 each but 3–5 cost ₹449 each (more than the ₹200 price). SCULP-001 "Wooman Sculpture" is ₹11 (was ₹99). Typos?
