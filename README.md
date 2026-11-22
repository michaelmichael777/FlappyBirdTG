# Pixel Flap: Telegram Mini App (detailed guide)

A retro pixel-art, one-button arcade game that runs inside Telegram. Files in this project:

| File | What it does |
|---|---|
| `index.html` | Page structure: canvas, menu, game-over card, buttons |
| `style.css` | Retro look: pixel font, hard-edged cards and buttons, pixelated canvas scaling |
| `game.js` | Game logic, pixel art drawn in code, 8-bit sounds, Telegram integration (JavaScript) |

> **JavaScript vs Java:** they are different languages. The Mini App itself (what runs
> inside Telegram) must be HTML + CSS + **JavaScript**. Java is only relevant if you later
> write a *backend server* (e.g. Spring Boot) for leaderboards. See section 9.

---

## 0. How Mini Apps work (the 60-second version)

1. A Mini App is a normal website served over **HTTPS**.
2. A Telegram **bot** points at that website's URL.
3. When a user taps the bot's button/link, Telegram opens your site in an in-app browser
   (a WebView) and injects `window.Telegram.WebApp`, an object that lets your page talk to Telegram
   (theme colours, user info, haptics, storage, sharing, payments).
4. You need **no server** for a simple game. A static host is enough.

## 1. Prerequisites

- A Telegram account (phone app recommended for testing).
- A text editor (VS Code is free and good).
- A free static host account: GitHub, Netlify, Vercel or Cloudflare.
- Optional: Python or Node.js for a local test server.

## 2. Project setup

1. Create a folder `pixel-flap/`.
2. Put `index.html`, `style.css`, `game.js` in it (same folder).
3. Open `game.js` and find `CONFIG.SHARE_LINK`. You will change it in step 6.

## 3. Test locally

**Quickest:** double-click `index.html`. The game runs in the browser. Tap/click/Space to flap.
Telegram-specific features are skipped automatically (it falls back to `localStorage`).

**Local server (closer to reality):**
```bash
cd pixel-flap
python3 -m http.server 8000      # then open http://localhost:8000
```

**Test on your phone before hosting** (needs an HTTPS URL, so use a tunnel):
```bash
# Cloudflare quick tunnel (free, no account):
cloudflared tunnel --url http://localhost:8000
# prints something like https://random-words.trycloudflare.com
```
You can paste that temporary URL into BotFather (step 5) while developing.

## 4. Host it (permanent HTTPS URL)

**GitHub Pages**
1. Create a public repo, upload the three files.
2. Settings → Pages → Source: *Deploy from a branch* → `main` / root → Save.
3. Wait about a minute. Your URL is `https://<user>.github.io/<repo>/`.

**Netlify Drop**: go to app.netlify.com/drop, drag the folder in, copy the URL.

Open the URL on your phone and check the game loads.

## 5. Create the bot and attach the Mini App

1. In Telegram open **@BotFather**.
2. `/newbot` → choose a name and a username ending in `bot`.
3. Attach the app in either (or both) of these ways:

**a) Menu button**
`/mybots` → your bot → **Bot Settings** → **Menu Button** → **Configure menu button** →
send your HTTPS URL, then a title like `Play`.
The button appears next to the message field in the bot chat.

**b) Direct link (recommended for sharing)**
`/newapp` → pick your bot → send title, description, a 640×360 picture
(optional GIF), then your URL, then a short name (e.g. `pixelflap`).
Your shareable link becomes `https://t.me/<YourBotUsername>/pixelflap`.

## 6. Wire up the Share button

In `game.js` set:
```js
SHARE_LINK: 'https://t.me/<YourBotUsername>/pixelflap',
```
Re-upload the file. Share opens Telegram's contact picker with a ready message.

## 7. Test inside Telegram

Checklist:
- [ ] Game opens full height.
- [ ] Menu shows your best score; Play starts the game.
- [ ] Phone vibrates on flap/score/crash.
- [ ] Swiping down does not close the app mid-game.
- [ ] Best score survives closing and reopening (CloudStorage).
- [ ] Switching to another app pauses the game.
- [ ] Share opens the Telegram share sheet.
- [ ] Dark mode: card colours follow the Telegram theme.

**Debugging**
- Desktop (Windows/Linux): Settings → Advanced → Experimental → *Enable webview inspection*, then
  right-click the Mini App → *Inspect*.
- Android: enable *WebView debug* in Telegram settings, connect USB, open `chrome://inspect`.
- iOS (macOS Safari): enable Web Inspector in iOS Safari settings, then Develop menu → your device.
- **Stale version?** Telegram caches. Change the URL in BotFather to `.../?v=2`.
- **Test Telegram environment:** BotFather-created bots can also be made on the test server
  (see core.telegram.org/bots/webapps) if you want a sandbox.

## 8. Code walkthrough

**Telegram integration (`game.js`, section 2)**
- `tg.ready()` tells Telegram the page finished loading.
- `tg.expand()` makes the Mini App full height.
- `tg.disableVerticalSwipes()` stops swipe-to-close (Bot API 7.7+).
- `tg.HapticFeedback.*` gives vibration feedback.
- `tg.CloudStorage` saves the best score to the user's Telegram account (API 6.9+).
- `tg.openTelegramLink()` opens a `t.me` share link.
- CSS variables like `--tg-theme-bg-color` are filled in by Telegram automatically.

**Game loop**
- Physics advances in fixed 1/60-second steps (`update()`), while drawing happens every frame.
  This keeps the speed identical on 60 Hz and 120 Hz phones.
- Each frame: gravity changes the bird's vertical speed, speed changes position,
  pipes scroll left, collisions are checked with circle-vs-rectangle math.

**Difficulty** (`CONFIG`): speed rises and the gap shrinks slowly with score, capped by
`SPEED_MAX` and `GAP_MIN`.

**Pixel-art rendering**: the game draws on a tiny 180x320 canvas and CSS scales it 2x with
`image-rendering: pixelated`, so every game pixel is a crisp square on any screen. There are
no image files: the bird is a text grid (`BIRD_GRID`, one letter per pixel, colours in `BIRD_PAL`),
the sky is six colour bands with dithered seams, and hills/pipes/ground are plain rectangles.
Positions are rounded to whole pixels when drawing, which keeps the retro look.

**Customize quickly**
| Want | Change |
|---|---|
| Easier game | raise `GAP_START`, lower `GRAVITY` |
| Floatier bird | lower `GRAVITY` (e.g. 0.35) |
| Different colours | edit `PAL` and `BIRD_PAL` in `game.js`, and `:root` in `style.css` |
| New bird look | edit the letters in `BIRD_GRID` (14x10); each letter maps to a colour in `BIRD_PAL` |
| Bigger pixels | lower `W`/`H` in `CONFIG` and the canvas `width`/`height` in `index.html` (keep a 9:16 ratio) |
| Medal thresholds | `medalFor()` |
| Daily course reset time | `utcDay()` / `timeToReset()` (currently midnight UTC) |

## Daily challenge

The menu has a **DAILY** button next to PLAY. Daily mode works like this:

- **Same pipes for everyone.** The pipe heights come from a seeded random generator
  (`seededRandom(hashString('pixelflap-' + utcDay()))` in `game.js`). The seed is today's UTC date, so every
  player sees the identical layout, and it changes at 00:00 UTC. Retrying re-seeds, so every attempt that day is the same course.
- **Daily best and streak.** One small JSON value (`daily`) is saved in Telegram CloudStorage
  (`localStorage` outside Telegram): `{ date, best, streak, last }`. Your streak goes up by one for each consecutive
  UTC day you finish a daily run, and resets if you skip a day.
- **Countdown.** The menu shows "NEW IN HH:MM" until the next daily course.
- **Separate from endless mode.** Daily scores never touch your endless-mode best.
- **Share text** mentions the date, so friends know they are comparing the same course.

Limits to know about: the daily best and streak live on the player's device/account, so they can be edited
by a determined cheater. For a real daily leaderboard, send `tg.initData` and the score to a server and verify it
(section 9). The server can also store the day's seed and replay or sanity-check scores.
Players whose clock is wrong could see a different day; the game uses the device clock, so a server-provided date
is the fix if that matters.

## 9. Next level: leaderboard (needs a backend)

Anything stored only on the client can be faked, so a leaderboard needs a server that **verifies**
Telegram's signed `initData`.

**Flow**
1. Client sends `{ initData: tg.initData, score }` to your server over HTTPS.
2. Server validates the signature with your bot token.
3. Server stores the score per `user.id` and returns the top N.

**Validation algorithm (Node.js example)**
```js
import crypto from 'node:crypto';

export function validateInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return calc === hash;   // also reject if auth_date is too old (e.g. > 1 hour)
}
```
Backend options: Node/Express, Python/FastAPI, Cloudflare Workers + D1/KV, Supabase, or **Java**
(Spring Boot) if you prefer. The same HMAC steps apply in any language.
Even with validation, a determined cheater can still send fake scores, so also sanity-check
(max plausible score per second) or have the server run the pipe RNG.

## 10. Common problems

| Symptom | Likely cause / fix |
|---|---|
| Blank page in Telegram | URL not HTTPS, or JS error. Use the inspector |
| `Telegram is undefined` | SDK script tag missing or blocked; it must come before `game.js` |
| Best score not saved | Old Telegram client (<6.9). Falls back to localStorage |
| No vibration | Device/OS setting or desktop client; not an error |
| No sound | Browsers need a tap first; unmute with the 🔊 button |
| Old version still showing | Cache: add `?v=N` to the URL set in BotFather |
| Game too fast/slow | You edited the timestep; keep `STEP = 1000/60` |
| Font looks like plain monospace | Press Start 2P could not load (offline); harmless fallback |

## 11. Launch checklist

- [ ] Real name, description, picture for the bot and app (BotFather: `/setdescription`, `/setuserpic`).
- [ ] `SHARE_LINK` points to your final app link.
- [ ] Tested on iOS and Android, light and dark theme.
- [ ] Server-side validation in place if you added scores or payments.
- [ ] Optional: monetization with Telegram Stars (`tg.openInvoice`), needs a backend.
- [ ] Read Telegram's Mini App guidelines before promoting publicly.

## Useful docs
- https://core.telegram.org/bots/webapps (official Mini Apps reference)
- https://core.telegram.org/bots/features#botfather (BotFather commands)
