# Agent Office: notes for Claude Code

You're working on an open-source app: a pixel-art office where you watch real Claude Code subagents work, with characters the
user can replace (skins) and a Korean/English interface. It's a fork of Le Bureau des agents (MIT, VibesMoney).
Read this file before changing the code. To install and run the office, follow the "For Claude Code" section of the README.
The plan for upcoming work is in `PRD.md`.

## Commands

- `npm start`: checks Node, builds the client, starts the server on http://localhost:4848 and opens the browser.
- `npm run orca`: same, in Orca mode (every Orca workspace becomes a room tab). `npm run dev -- --orca` for development.
- `npm run dev`: server + Vite with hot reload on http://localhost:5174.
- `npm run check`: types (client and server). `npm run build`: the build. Both must pass before a pull request.
- Useful variables: `PORT` (server port), `BUREAU_DIR` (the office folder, default `~/Documents/Agent Office`).

Node 22.18+ runs the server's TypeScript directly (type stripping): in `server/` and `shared/`, imports keep their `.ts` extension,
and nothing that needs real compilation (no `enum`, no `namespace`, no parameter properties).

## How it's built

- **`server/`**: `index.ts` (HTTP, WebSocket, security), `bureau.ts` (missions, files, versions, history, settings),
  `claude.ts` (runs `claude -p` in stream-json and turns its output into office events), `team.ts` (roles and prompts),
  `skins.ts` (watches `skins/`, unpacks zips, serves `/skins/`), `orca.ts` (Orca mode: polls `orca worktree ps`, follows
  Claude Code transcripts through the same `Normalizer`, sends messages with `orca terminal send`).
- **`shared/protocol.ts`**: every message between server and browser, and the events (`OfficeEvent`): `start`, `hire`, `act`,
  `report`, `leave`, `file`, `ask`, `end`… **`shared/activity.ts`**: roles, their tools, the bubble texts.
  **`shared/i18n.ts`**: languages and `tr()`.
- **`src/state/store.ts`** (zustand) stores each event, then hands it to the engine (`src/state/bus.ts` → `src/engine/world.ts`).
- **`src/engine/`**: the world (`world.ts`: robots, A* movement, chat, party mode), drawing (`render.ts`, `room.ts`, `furniture.ts`,
  `robots.ts`: all the pixel art is drawn in code on a 352 × 256 image), skins (`skins.ts`: fits an image to the robot size and
  makes every pose from a front view), the camera and its director (`camera.ts`), clicks (`hits.ts`).
- **`src/ui/`**: the React interface. `Office.tsx` (canvas, bubbles, animation loop), `Dialog.tsx` (Max and the input box),
  `Rooms.tsx` (windows opened by clicking), `Modals.tsx` (settings, character picker…), `interact.ts` (what each click does).
- **`src/audio/`**: ZzFX sound effects, jukebox (`public/music/`), Max's voice (`public/voice/<lang>/`, optional).
- **`public/demo/mission.json`**: a recorded mission, replayed when the server isn't there (`scripts/make-demo.ts`).

## Testing without spending the subscription

A recorded mission replays exactly (`H`, then "Replay"), and without a server the office runs as a demo. In the browser console,
`window.__bureau` gives access to the store, the world, the camera and `playReplay(mission, log, speed)`.
To film the office frame by frame, `window.__CAPTURE` makes every frame draw and provides the music's beat (see the loop in `Office.tsx`).

## Rules

- **Korean and English, short sentences** in everything the user reads: every visible text is written with
  `tr({ ko: '…', en: '…' })`. Korean uses 해요체; English is casual, second person. The office is made for beginners.
  In the browser the language is fixed at page load (switching reloads), so `tr()` is fine in module constants. On the server it
  follows the settings: call `tr()` when the text is needed, never in a module constant.
- **Canvas pixel text** (`font.ts`) only has Latin uppercase: signs drawn on the canvas stay in English.
- **Agent prompts** are written in English with a language line (`langDirective()` in `team.ts`).
- **Never show a full path or a user name on screen**: `tidy()` (`src/ui/tidy.ts`) and `tilde()` (`src/ui/format.ts`).
- **Light**: the loop draws at most 24 frames per second during a mission, 8 at rest, nothing when the tab is hidden; about one
  millisecond per frame. No 3D, no heavy library.
- **Security**: the server only listens on 127.0.0.1 and checks the WebSocket origin; the team runs `--restricted`, with only
  its role's tools; websites the team builds are shown under `/apercu/` in a sandbox (CSP `sandbox`). Skins: PNG only, served
  only from `skins/`, zips unpacked flat with size limits.
- **zustand**: a selector that returns a new array or object goes through `useShallow`, or React loops.
- **No external images in the office**: new furniture is drawn in code in `furniture.ts`, placed in `layout.ts` and, if clickable,
  gets an entry in `hits.ts` and `interact.ts`. The only exception is skins: PNGs the user puts in their own `skins/` folder.
  **Never add third-party characters to the repository.**
- **Music and voice**: only files we're allowed to share, with their origin in the README.
- Code comments inherited from the original project are in French; new comments can be in English.
