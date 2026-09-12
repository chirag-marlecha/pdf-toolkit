# PDF Toolkit

A free, private, installable PDF editor that runs entirely in your browser. No uploads, no accounts,
no server — your files never leave your device. Works offline once installed, and is designed for
one-thumb use on a phone.

## Features

- **Open & merge** — pick multiple PDFs (and images) at once; they all land in one page grid
- **Reorder / delete / duplicate / rotate** pages via drag-and-drop and a thumb-friendly toolbar
- **Split** — export selected pages as one PDF, or every page as a separate PDF in a `.zip`
- **Annotate** — place text, freehand ink, and drawn signatures directly on any page
- **Compress** — rasterize and re-encode to shrink file size, with Low/Medium/High presets
- **Convert** — PDF pages → images (`.png`/`.jpg`), or images → a new PDF
- **Fill forms** — detects text fields, checkboxes, and dropdowns and lets you fill and download
- **Installable PWA** — add it to your phone's home screen; the app shell works offline and your
  in-progress document is auto-saved to the browser's local storage (IndexedDB)

## Tech stack

- **React + TypeScript + Tailwind CSS** (Vite build)
- **pdf-lib** for all editing/merging/splitting/forms
- **pdf.js** for rendering pages to thumbnails and full-page previews
- **@dnd-kit** for touch-friendly drag reordering
- **vite-plugin-pwa** for the installable, offline-capable app shell
- Everything else (`jszip`, `file-saver`, `idb-keyval`) is small and MIT-licensed

No paid APIs, no backend. The whole app is static files.

## Run it locally

Requires [Node.js](https://nodejs.org) 18+.

```bash
npm install
npm run dev
```

Open the printed `http://localhost:5173` URL. On your phone, open the same URL from your computer's
LAN IP (Vite prints one, or run `npm run dev -- --host`) to test on a real device.

Build a production bundle:

```bash
npm run build
npm run preview   # serve the built dist/ folder locally to double check
```

## Deploy for free

The build output (`dist/`) is 100% static — any static host works. Pick whichever you already have
an account with:

### Vercel
```bash
npm install -g vercel
vercel
```
Accept the defaults (framework: Vite, build command: `npm run build`, output dir: `dist`).

### Netlify
```bash
npm install -g netlify-cli
netlify deploy --build --prod
```
Or connect the repo in the Netlify dashboard with build command `npm run build` and publish
directory `dist`.

### GitHub Pages
1. In `vite.config.ts`, set `base: '/<your-repo-name>/'` inside `defineConfig({...})`.
2. Build and push `dist/` to a `gh-pages` branch (e.g. with the `gh-pages` npm package, or a GitHub
   Actions workflow that runs `npm run build` and deploys `dist/`).
3. Enable Pages for that branch in the repo settings.

All three are free for a small personal app like this one.

## Install it on your phone (Add to Home Screen)

Once it's deployed (must be served over **https**, which all three hosts above give you by default):

**Android (Chrome):**
1. Open the deployed URL in Chrome.
2. Tap the banner at the bottom of the app ("Install PDF Toolkit…") — or tap the ⋮ menu → **Install app**.
3. Confirm. The app icon appears on your home screen and opens full-screen, without browser chrome.

**iPhone/iPad (Safari):**
1. Open the deployed URL in Safari (must be Safari, not Chrome, for this to work on iOS).
2. Tap the **Share** icon in the toolbar.
3. Scroll down and tap **Add to Home Screen**, then **Add**.

After installing, the app shell loads instantly and works offline; opening/editing/exporting PDFs
always works offline since it's all local processing. (Fetching a brand-new deploy of the app
itself still needs a connection the first time, same as any app update.)

## Notes on privacy & limits

- Every PDF operation (merge, split, rotate, annotate, compress, form-fill) runs on-device using
  pdf-lib/pdf.js — files are never uploaded anywhere.
- Your in-progress document autosaves to the browser's IndexedDB so a reload or a dropped connection
  doesn't lose your work. "Clear in-progress document" on the home screen wipes it.
- Very large PDFs (hundreds of pages, huge scans) are limited by your device's memory, since
  everything is held in memory — this is a client-side tool, not a server with more RAM to throw at it.
