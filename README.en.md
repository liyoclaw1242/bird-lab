# A Bird in the Hand (一鳥在手)

English · [繁體中文](README.md)

A bird in the hand is worth two in the bush. Shake a tree once a day to meet a real bird from somewhere in the world, then take three of your birds to face a very serious-looking boss.

I made this little game for my young nephew, so he can play a bit each day and get to know the world's birds along the way. That is why every bird is a real photo, and its name, weight, diet and habitat come from public ornithology data. For anyone who wants to dig deeper, each card links out to eBird, xeno-canto and Wikipedia.

Live site: <https://bird-lab-three.vercel.app>

## How to play

- Shake one tree a day and a bird you haven't met yet drops out. The pool has over 10,000 species, each shown with a real photo from Wikimedia Commons or iNaturalist. Birds without a usable photo yet are set aside and can't be drawn.
- Each day has one boss. Fight it for 5 rounds with the 3 birds on your scarecrow and earn 0 to 3 stars based on damage. Win or lose, you get bonus trees to shake: 1 for trying, plus 1 per star. The server replays every fight to check the result.
- "The Woods" shows the birds you've collected, with a meat / plant / mixed diet filter. Open a bird to see its numbers, how it lives, and "Want to know this bird better?" links: range map, calls, more photos, diet and nesting.
- You can share the bird you drew today with friends through a link; rarer birds can be claimed by fewer people.
- Draws have pity and catch-up odds, shown in the game. The design notes are in [docs/gacha-research/ODDS.md](docs/gacha-research/ODDS.md) (Chinese).

## Architecture

| Part | Location | Service |
|---|---|---|
| Front end (plain JS, no build step) | `public/` | Vercel static files |
| API (one function, routed by `?op=`) | `api/gacha.js`, `server/` | Vercel Functions |
| Database | `server/schema.sql` | Supabase Postgres (Tokyo) |
| Bird photos | `stickers/` (old folder name) | Cloudflare Workers static assets |
| Daily health check | `.github/workflows/health.yml` | GitHub Actions |

Game rules and odds live in `public/engine.js` and `public/data.js`, shared by browser and server. The server decides every draw and fight result.

## Local development

Requires Node.js 20.6 or later.

```sh
npm install
npm run dev    # http://localhost:5298/, data in .data/, never touches production
npm test
```

To try the Google sign-in flow locally, run `GACHA_FAKE_GOOGLE=1 GOOGLE_CLIENT_ID=x npm run dev`; the credential is used as the account id. Local use only.

## Configuration

Copy `.env.example` to `.env.local` and fill it in; it explains how to get each token. `npm run check-env` checks the settings without printing them.

`.env.local` deliberately has no `DATABASE_URL`, so local development can't reach the production database. Production variables are set in Vercel.

## Deployment

**Pushing to `main` deploys straight to production.**

When the database schema changes, set `DATABASE_URL` and `DATABASE_CA` and run `npm run seed`. It is safe to rerun: it creates tables and updates the card pool.

## Backups

The database is not backed up. The card pool can be reloaded with `npm run seed`; player data lives only in Supabase and can't be recovered if the database is lost.

## Languages

Traditional Chinese and English; all strings are in `public/i18n.js`. The language comes from the `?lang=` URL parameter, then the saved setting, then the browser language: Chinese browsers get Traditional Chinese, everything else gets English.

To add a language, add an entry to `DICT` and extend `detect` and the language switch. Missing strings fall back to Traditional Chinese, and `server/test/i18n.test.js` checks that the keys match.

Not translated yet: the home page's social preview (OG) and the PWA name, since static files can't switch language. Share-link previews follow the sharer's language (links shared from the English UI carry `?lang=en`).

The privacy and credits pages each have an English version (`privacy-en.html`, `credits-en.html`). Change both together and keep the license details identical.

## Wallpaper

`/wallpaper.html` is a standalone animated wallpaper, "Rainy treehouse", which loops seamlessly every 120 seconds; the bird on the balcony follows the day's boss. Rain and fire sounds are synthesized; the music slot is `TRACKS` in `public/wallpaper-sound.js`, currently empty. URL parameters: `?sound=1` starts with sound, `?boss=` picks a boss, `?t=` freezes the frame.

## Security

- Every table has RLS enabled with no policies; the game only reaches the database through the server, never through the Supabase Data API.
- Security headers and CSP are in `vercel.json`. Update them when adding external resources.
- The server stores only hashes of sign-in credentials, and only the id of a Google account.

## License and assets

The code is released under the MIT license; see [LICENSE](LICENSE). Bird photos, bird data and the background sound are not covered by MIT and keep their own licenses: summary in [NOTICE](NOTICE), full credits in [public/credits-en.html](public/credits-en.html).

- Birds are shown with real photos (`tools/build-photos.py`): the Wikidata image on Wikimedia Commons when it is filed under the species, otherwise a CC BY or CC0 photo from a research-grade iNaturalist observation. Photos are only resized and framed, never cropped or flipped. Birds without a photo are frozen: they can't be drawn and don't count toward the collection, and players who already have one see a silhouette.
- Photos are served from `stickers/dist/photos/`. After changing photos, deploy the photo site and bump `STICKER_VERSION` in `public/game.js`, then run `tools/gacha-photo-json.py` to update `server/data/photos.json`; the server uses that file to decide which birds have photos, so the production database doesn't change.
- The card pool's species and stats are fixed (`server/data/cards.json.gz`); rebuilding it would make players' birds disappear or change stats, so only text and photos are updated. Names, order, family and notes are rebuilt by `tools/gacha-primary-text.py` from the IOC 15.2 multilingual list, AVONET and AviList v2025 into `server/data/cardtext.json`, which the server applies on top of the database when it returns cards.
- Before any commercial use, IUCN data licensing needs sorting out, and Vercel's Hobby plan is non-commercial only.

Development notes and known issues: [docs/gacha-research/HANDOFF.md](docs/gacha-research/HANDOFF.md) (Chinese).

Contact: <liyoclaw1242@gmail.com>
