# Uncapped

**Scan real-world UPCs. Turn everyday beverages into collectible cards. Build the deck that tells your story.**

Uncapped is a mobile-first collectible beverage card app. Scan the UPC on a drink package, identify the product, mint a collectible card, and grow a personal collection you can show or share with friends.

Phase 1 intentionally supports **all beverage categories** — energy drinks, soda, coffee, tea, water, sports drinks, juice, beer, and more — rather than being limited to beer.

## Phase 1 MVP

- Camera UPC/barcode scanning
- Manual UPC entry fallback
- Product lookup through Open Food Facts
- Automatic collectible card creation
- Stable rarity assigned from the UPC
- Personal collection stored on the device
- Duplicate scan tracking
- Search and rarity/category filters
- Card sharing through the device share sheet
- PWA support for a phone-like experience
- GitHub Pages deployment workflow

## Important gameplay rule

The collection is based on **scanning packaging**, not on how much someone drinks. Repeated scans do not increase rarity.

## Run locally

Because camera access requires a secure context, use HTTPS or localhost.

A simple local server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Product data

Uncapped currently uses the public Open Food Facts API. Products not found there can still be added manually.

## Roadmap

Possible next phases include accounts, cloud sync, friends, trades, challenges, richer card art, verified product data, and shared collections.
