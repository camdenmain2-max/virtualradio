# VirtualTX Worker Backend

This is the live signaling backend for the VirtualTX HTML/CSS/JS frontend.

It provides:
- WebSocket signaling at `/signal`
- Durable Object rooms
- Multiple receivers per virtual frequency/mode room
- Live broadcaster station metadata
- WebRTC offer/answer/ICE routing
- Station join/leave notifications
- `/health` health check

## Deploy with GitHub + Cloudflare

Push this folder/repository to GitHub, then import the repository from Cloudflare Workers & Pages as a Worker.

Wrangler should detect:
- Main file: `worker/index.js`
- Config: `wrangler.toml`

No npm build is required.

## Important frontend change

The current static frontend connects to `/signal` on the same hostname. That works if the HTML/CSS/JS frontend and this Worker are deployed under the same hostname.

If the frontend is hosted separately (for example, GitHub Pages), change its WebSocket URL from the relative `/signal` endpoint to the full Worker URL, e.g.:
`wss://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/signal?room=...`

The existing frontend currently sends the room in the WebSocket messages, while this backend also supports room routing by URL. For the simplest same-host deployment, the Worker can serve the frontend assets too.

## Limitations

This is virtual radio: it does not transmit RF/HD Radio over the air.

Browser microphone access requires HTTPS and user permission. Internet streams are subject to browser codec/CORS restrictions.
