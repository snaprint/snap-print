Absolutely. If you're building an **AI agent that will process dozens or hundreds of HueForged products**, I would avoid prompts tied to specific styles like Japanese interiors, waves, samurai, etc.

Instead, create a **library of generic scene prompts**. Your agent can randomly/selectively use them for any uploaded artwork.

The key is: **the uploaded product is fixed; only the photography environment changes.**

---

# 1. Universal product-preservation instruction

Put this at the beginning of **every image-generation prompt**:

```text
Use the uploaded product image as the exact reference for the physical product.

The product itself is locked and must remain unchanged. Preserve its exact:
- artwork/design
- geometry
- dimensions and proportions (Physical product scale: maximum 18cm × 18cm / 7in × 7in compact 3D art piece)
- shape and corners
- 3D relief and raised texture
- surface details
- colors and painted areas
- orientation

Maintain realistic physical scale: The product has maximum dimensions of 18cm × 18cm (approx 7 in × 7 in). It must be rendered in accurate proportion to surrounding everyday objects (books, mugs, hands, desks, shelves) and should not look like a massive wall painting or oversized poster.

Do not redesign, reinterpret, redraw, simplify, enhance, or invent details.

Treat the uploaded image as a photograph of a real manufactured product that is being photographed in a new environment.

Only change the surroundings, lighting, camera angle, composition, and environment as requested.

The product must remain the primary subject of the photograph.
```

Then append one of the scene prompts below.

---

# 2. General lifestyle scene prompts

### 01 — Minimalist home

```text
Place the product in a clean, minimalist contemporary home with neutral walls, simple furniture, subtle decorative objects, and natural materials.

Use soft natural daylight and realistic shadows.

Create a premium but understated home-decor photograph.
```

### 02 — Modern living room

```text
Place the product naturally in a modern living room with a sofa, coffee table, plants, books, and tasteful decorative objects.

Use realistic interior proportions and soft ambient daylight.

The background should remain slightly out of focus.
```

### 03 — Bedroom

```text
Place the product in a calm, elegant bedroom.

Include subtle bedding, a bedside table, soft curtains, plants, and understated decor.

Use warm natural morning light and realistic shadows.
```

### 04 — Study / reading room

```text
Place the product in a sophisticated home study or reading corner.

Include a wooden desk or bookshelf, books, a small plant, and subtle stationery.

Use soft window light and a calm, intellectual atmosphere.
```

### 05 — Creative workspace

```text
Place the product in a tasteful creative workspace or artist's studio.

Include a wooden work surface, art supplies, plants, books, and a few carefully arranged objects.

Keep the environment organized rather than cluttered.
```

### 06 — Office

```text
Place the product in a premium modern office environment.

Use a clean desk, laptop, books, subtle plants, and contemporary furniture.

Natural daylight, realistic shadows, professional interior photography.
```

### 07 — Dining area

```text
Place the product in a sophisticated dining area.

Use a wooden dining table, neutral walls, subtle ceramics, plants, and warm natural light.

Create an elegant lifestyle photograph rather than a staged advertisement.
```

### 08 — Entryway

```text
Place the product in a stylish home entryway.

Include a narrow console table, mirror, plant, ceramic decor, and tasteful storage elements.

Use soft daylight and realistic interior shadows.
```

### 09 — Shelf display

```text
Display the product on a carefully styled bookshelf or floating shelf.

Surround it with books, small plants, ceramics, candles, and a few decorative objects.

Maintain visual hierarchy so the product remains the focal point.
```

### 10 — Console table

```text
Place the product on a wooden console table against a neutral wall.

Add a small vase, plant, books, and understated decorative objects.

Use warm natural side lighting and shallow depth of field.
```

---

# 3. More visually diverse environments

These are useful so your website doesn't end up with 50 images that all look like the same room.

### 11 — Rustic interior

```text
Place the product in a warm rustic interior featuring natural wood, textured walls, handmade ceramics, linen, and plants.

Use soft afternoon sunlight and authentic natural materials.

Keep the styling sophisticated rather than overly rustic.
```

### 12 — Japandi

```text
Place the product in a refined Japandi-inspired interior.

Use natural wood, neutral colors, simple furniture, ceramics, plants, and generous negative space.

Use soft diffused daylight and subtle shadows.
```

### 13 — Scandinavian

```text
Place the product in a bright Scandinavian-style interior with pale wood, neutral textiles, simple furniture, plants, and minimal decoration.

Use clean natural daylight and an airy atmosphere.
```

### 14 — Industrial

```text
Place the product in a tasteful industrial interior with concrete, dark metal, wood, exposed textures, and subtle greenery.

Use directional natural light with realistic shadows.

Keep the overall appearance premium and contemporary.
```

### 15 — Luxury interior

```text
Place the product in an elegant luxury interior featuring premium furniture, natural stone, wood, subtle metallic accents, and sophisticated decorative objects.

Use controlled warm lighting and realistic reflections.

Avoid excessive ornamentation.
```

### 16 — Bohemian

```text
Place the product in a tasteful contemporary bohemian interior.

Include plants, woven textures, ceramics, books, natural wood, and soft textiles.

Use warm natural sunlight and a relaxed atmosphere.
```

### 17 — Dark moody interior

```text
Place the product in a sophisticated darker interior with charcoal walls, dark wood, subtle plants, and warm accent lighting.

Create strong but natural contrast while keeping the product clearly visible.

Premium editorial interior photography.
```

### 18 — Bright sunlit interior

```text
Place the product in a bright room filled with natural sunlight.

Use large windows, soft curtains, plants, pale furniture, and neutral surfaces.

Create realistic sunlight patterns and soft shadows.
```

---

# 4. Outdoor / natural environments

These are particularly useful for variety.

### 19 — Garden

```text
Place the product on a small outdoor table in a beautiful garden.

Surround it with natural greenery and subtle flowers.

Use soft morning daylight and realistic outdoor shadows.

The product must remain clean and clearly visible.
```

### 20 — Balcony

```text
Place the product on a stylish apartment balcony with plants, wooden furniture, and a softly blurred city or natural background.

Use natural daylight and realistic atmospheric depth.
```

### 21 — Terrace

```text
Place the product on a tasteful rooftop or terrace setting with plants, natural stone, and minimal furniture.

Use warm golden-hour sunlight and realistic shadows.
```

### 22 — Nature-inspired setting

```text
Place the product on a natural wooden surface surrounded by subtle greenery, stones, branches, and other organic materials.

Use soft diffused daylight.

Create a premium nature-inspired product photograph.
```

---

# 5. Product-focused images

These should be part of your automated set because they show the actual product better than lifestyle scenes.

### 23 — Straight-on product shot

```text
Create a professional straight-on product photograph.

Place the product against a clean neutral background with soft studio lighting.

Show the entire product clearly with minimal perspective distortion.

Use realistic soft shadows.
```

### 24 — Three-quarter view

```text
Create a professional three-quarter-angle product photograph.

Show the front artwork as well as the physical thickness and 3D relief of the product.

Use soft directional lighting that reveals the depth of the raised texture.
```

### 25 — Texture close-up

```text
Create a detailed close-up photograph of the product focusing on its raised 3D texture.

Use directional light from the side to emphasize the physical relief, depth, edges, and surface details.

Maintain realistic material appearance.
```

### 26 — Edge/detail shot

```text
Create a close product photograph emphasizing the physical thickness, edges, corners, and raised surface of the artwork.

Use shallow depth of field and soft directional lighting.

The image should clearly communicate that this is a physical 3D object rather than a flat printed image.
```

### 27 — Handheld scale reference

```text
Show the product naturally held by an adult hand.

The hand should hold the product from an edge without covering important artwork.

Use a realistic everyday environment and natural lighting.

The composition should clearly communicate the physical size of the product.
```

---

# 6. Display/use-case prompts

### 28 — Desk decoration

```text
Show the product being used as decorative artwork on a desk.

Include subtle workspace elements such as books, stationery, a lamp, and a plant.

Keep the scene clean and realistic.
```

### 29 — Bedside decor

```text
Show the product displayed on a bedside table beside books, a small lamp, and subtle decorative objects.

Use warm evening or morning natural light.
```

### 30 — Bookshelf collection

```text
Show the product displayed among books and small decorative objects on a bookshelf.

Create a realistic curated home-decor arrangement.

The product should remain visually prominent.
```

### 31 — Gallery wall

```text
Show the product mounted as part of a tasteful gallery wall.

Surround it with a small number of complementary artworks of different sizes.

Keep the uploaded product clearly identifiable and visually dominant.
```

### 32 — Gift / presentation setting

```text
Present the product in an elegant gift-oriented setting with tasteful wrapping materials, a wooden surface, subtle greenery, and soft natural lighting.

Do not add text, logos, ribbons across the artwork, or graphic elements that obscure the product.
```

---

# 7. Color-options image

For your HueForged concept, I recommend having **one standardized color-options image for every product**.

### General version

```text
Use the uploaded product as the exact design reference.

Create a single clean product photograph showing 6 versions of the exact same 3D-printed artwork, each painted using a different color palette.

The geometry, shape, proportions, relief, and artwork design must be identical in every version.

ONLY the paint colors may change.

Show these six color approaches:

1. Original / vibrant
2. Warm / sunset
3. Cool / ocean
4. Earthy / natural
5. Soft pastel
6. Monochrome

Make the paint follow the existing raised 3D texture and naturally defined areas of the artwork.

Arrange the six products in a clean 2 × 3 composition.

Use consistent scale, perspective, and lighting.

Do not add text, labels, color names, logos, icons, borders, or promotional graphics.

The result should look like a premium product photography image demonstrating different ways a customer could paint the same blank 3D artwork.
```

---

# 8. More interesting color-option variations

You don't necessarily have to use the same six palettes every time.

### Palette Set A — Safe / mainstream

```text
Classic, Sunset, Ocean, Forest, Pastel, Monochrome
```

### Palette Set B — Artistic

```text
Terracotta, Indigo, Sage, Lavender, Mustard, Charcoal
```

### Palette Set C — Bold

```text
Crimson, Electric Blue, Emerald, Purple, Orange, Black
```

### Palette Set D — Elegant

```text
Ivory, Sand, Olive, Deep Navy, Burgundy, Charcoal
```

I'd probably use **Palette Set A as the default** for your website because it gives customers an immediate understanding of the possibilities without making the images look like different products.

---

# 9. "Paint it yourself" image

You could also automate one special image occasionally:

```text
Use the uploaded product as the exact reference.

Create a realistic photograph showing the white, unpainted 3D-printed artwork being painted by hand.

Show only the hands, paintbrush, small palette, and the physical artwork.

The raised 3D texture should be clearly visible and should naturally guide the painting.

Some portions may be painted while other portions remain white.

Use natural daylight and a clean creative workspace.

The product design must remain exactly identical to the reference.

No text, logos, or graphic elements.
```

This could be particularly effective for explaining your **HueForged concept**.

---

# 10. A useful prompt for "premium hero" images

```text
Create a premium editorial product photograph of the uploaded artwork.

Place it in a beautifully styled but realistic environment that complements the artwork without competing with it.

Use sophisticated composition, natural materials, subtle decor, realistic depth of field, soft directional lighting, and natural shadows.

The product should occupy approximately 40–60% of the visual frame and remain the clear focal point.

The image should feel suitable for the hero section of a premium home-decor website.

Do not add text or graphic elements.
```

---

## Recommended automated image set

If you're processing **hundreds of products**, I wouldn't generate 20 images per product. I'd standardize it:

**For each product:**

1. **Hero** — premium lifestyle
2. **Wall display** — mounted in interior
3. **Shelf/table display** — tabletop
4. **Texture close-up** — emphasizes 3D printing
5. **Handheld** — establishes scale
6. **Color options** — six possible paint schemes

Then randomly select from your environment library so that, for example, Product #1 isn't always in a living room and Product #2 isn't always on a shelf.

### The agent logic could effectively be:

```text
PRODUCT
   ↓
LOCK PRODUCT DESIGN
   ↓
Generate:
   ├── Hero → random lifestyle environment
   ├── Wall → random interior
   ├── Shelf → random display environment
   ├── Close-up → texture-focused
   ├── Handheld → scale reference
   └── Color Options → standardized 6 palettes
```

This gives you a **consistent visual identity across the entire HueForged catalog**, while preventing hundreds of product pages from looking like copies of the same photograph.
