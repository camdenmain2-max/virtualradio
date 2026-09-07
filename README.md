# VirtualTX — GitHub + Cloudflare

This package is structured for a Cloudflare Workers Git deployment.

## Repository layout

- `worker/index.js` — Worker entry point
- `public/index.html` — website
- `public/style.css` — styling
- `public/app.js` — browser radio client
- `wrangler.toml` — Cloudflare configuration

## Cloudflare

Use a Workers project connected to this GitHub repository.

Deploy command:
`npx wrangler deploy`

The important fix is that `wrangler.toml` points to `worker/index.js`, and that file is actually committed at the repository root.

## GitHub

Put the CONTENTS of this folder into the GitHub repository (do not put an extra `VirtualTX-GitHub-Cloudflare` folder around them).

## What it does

Virtual frequencies/stations, browser microphone input, internet-stream input, WebRTC audio, station discovery, tuning, modes, and a visual spectrum/waterfall.

This is a virtual radio system. It does not transmit RF.

Note: microphone access requires HTTPS. Internet audio streams may be blocked by their server's CORS/browser policies.
