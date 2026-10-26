# Radia — real-world proximity

A static PWA. No build step, no bundler, no `package.json`: plain HTML, CSS and
ES5-style modules loaded with `<script>` tags.

## Run it

```bash
python3 -m http.server 3000
# open http://localhost:3000
```

Any static server works. Geolocation requires `https://` or `localhost` — a
`file://` open will not get a GPS fix.

## The map needs no API key

Earlier builds pointed at `basemaps.cartocdn.com`, which now answers **HTTP 200
with an "API KEY REQUIRED" watermark image**. The map looked broken while every
request reported success. Radia now uses free tiles that actually render:

| Style    | Source                        | Key? |
| -------- | ----------------------------- | ---- |
| Daylight | Esri World Street Map         | no   |
| Vivid    | OpenStreetMap                 | no   |
| Calm     | OpenStreetMap + gray tint     | no   |
| Terrain  | Esri World Topographic        | no   |
| Evening  | OpenStreetMap + inverted tint | no   |

**Optional:** if you want MapTiler's higher-fidelity styles, paste a key in
**Settings → Map → Optional: MapTiler API key** and press Save. It is stored in
that browser's `localStorage` only. To ship a default key with the app, set
`maptilerKey` in `js/config.js` instead (client-side keys are public by
definition — never put a secret there).

Changing the style does not require a reload: `_applyTileProvider()` swaps the
tile layer and re-applies the CSS tint class.

## Demo world

`RadiaConfig.demoMode` (Settings → Demo world, or `js/config.js`) is **off by
default**. When off you get only real data: no invented neighbours, no invented
hubs, no seeded insights, no synthetic AI synthesis. Turning it on paints a
sample world so you can preview an active map.

## Nearby people (presence)

Radia ships a transport-agnostic presence layer in `js/presence.js`. Pick one in
**Settings → Nearby people**:

| Driver | What it does | Setup |
| --- | --- | --- |
| Off | Only you on the map | none |
| This browser | Real presence between tabs/windows on one machine, via `BroadcastChannel` | none — open two tabs |
| Hosted | Real presence across devices via Supabase Realtime | paste project URL + anon key |

Every driver publishes `{ id, name, lat, lng, ts }` and emits
`RADIA_PRESENCE_PEERS`; the map engine owns rendering. To add Ably, Liveblocks
or your own WebSocket, implement that same four-line contract.

**Supabase setup (free tier is enough for an MVP):**

1. Create a project at supabase.com.
2. Project Settings → API → copy the **project URL** and the **anon public key**.
3. Paste both into Settings → Nearby people → Hosted → Save and connect.

Presence is sharded into a geohash cell at precision 6 (~1.2 km), so two people
in different cells never share a channel. The anon key is public by design; never
paste a service-role key into a browser app. There is no authentication yet —
anyone who knows the URL and key can join a cell. Auth and row-level rules are
the next backend step, not something this MVP pretends to have.

Known limitation: two people on opposite sides of a cell boundary get different
channels. A production version subscribes to the 8 neighbouring cells.

## What is real vs. not yet built

- **Real:** GPS positioning and centreing, walk distance and credits, map, radius
  calibration, encrypted local vault (AES-GCM via Web Crypto), insight capture,
  exports, and nearby-presence (local + hosted drivers).
- **Not yet built:** authentication, moderation, blocking at the network level,
  and multi-cell presence. Without auth, hosted presence is a demo, not a
  product — anyone with the anon key can join a cell.
- **Placeholder:** the "AI" synthesis is computed locally from your own notes.
  It is not an LLM call; wire a server-side key before presenting it as one.

## Files

| File            | Responsibility                                      |
| --------------- | --------------------------------------------------- |
| `js/config.js`  | runtime config: map provider, optional key, demo mode |
| `js/proximity.js` | map engine, GPS, radius, peers, walk tracking     |
| `js/app.js`     | views, settings, modal flows, insight graph         |
| `js/storage.js` | encrypted local vault, reflections, exports         |
| `js/prompts.js` | conversation prompt library                         |
| `js/gamification.js` | credits, goals, achievements                   |
| `js/audio.js`   | chimes and haptics                                  |
| `js/peer-sync.js` | WebRTC (PeerJS) peer transport                    |
| `js/presence.js` | nearby-presence transports (local + Supabase)     |
| `css/radar-v2.css` | the calm map HUD (loads after `radar.css`)       |
| `css/theme.css` | the whole-app visual system, including the Activity and Settings panels |
| `css/void.css`  | the insight sky: dark stage, orbits, selected-insight sheet |
| `DESIGN.md`     | the design contract: palette, type, motion, banned tells |

## Screens

- **Map** — full-bleed tiles, one availability control, one radius control, two
  bottom actions. No demo switches on the consumer surface.
- **Graph** — a dark sky with one star at the top. Every insight is a small star
  on a single orbit beneath it, joined by a thread that carries a pulse of light
  back into the centre. Tapping one brightens only that thread and opens one
  sheet; everything else dims. With no insights the sky holds the lone star and
  says so.
- **Activity** — standing and credits, today's goals, distance milestones, then a
  single Collection disclosure for cosmetics and badges.
- **Collection** — four cosmetic slots (Marker, Trail, Radius, Aura), 22 items
  priced in credits. Buying equips immediately; choices persist locally and
  repaint real map layers: the medallion skin, the walked polyline, the radius
  circle (including an animated dash current) and a particle field around you.
- **Settings** — You, Appearance, Map, People nearby, Conversation, Privacy.
  Every control persists locally as before.

## Known gaps

- `cdn.tailwindcss.com`, Leaflet, Lucide and PeerJS load from CDNs. Before
  shipping, vendor them so the app is offline-capable and version-pinned.
- The insight graph shows one label at a time by design; there is no persistent
  legend or per-star list until the journal is opened.
- The map avatar is a canvas-free CSS beacon (compass star, ember core, sonar
  rings) plus the equipped aura field. Its heading tick is retired because it
  read as a second marker.
- Cosmetics are local-only for now: the app owns no account, so another device
  cannot see what you are wearing.
- Hosted presence still has no auth or moderation (see above).
