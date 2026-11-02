// Le pont entre le bureau et Claude Code. Il sert le bureau (dossier dist/) et ouvre une connexion
// WebSocket sur /ws. Il n'écoute que sur ton ordinateur (127.0.0.1), et refuse toute page qui ne vient
// pas du bureau lui-même : un site web ne peut pas lancer ton équipe à ta place.
//
//   node server/index.ts            le bureau sur http://localhost:4848
//   node server/index.ts --open     … et l'ouvre dans le navigateur
//   node server/index.ts --dev      seulement le pont (le bureau est servi par Vite, port 5174)
import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../shared/protocol.ts';
import { tr } from '../shared/i18n.ts';
import { Bureau } from './bureau.ts';
import { findClaude } from './claude.ts';
import { findOrca, OrcaHub, type Viewer } from './orca.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const args = new Set(process.argv.slice(2));
const DEV = args.has('--dev');
const ORCA = args.has('--orca') || process.env.BUREAU_ORCA === '1';
const PORT = Number(process.env.PORT ?? 4848);
const HOST = '127.0.0.1';
const DEV_PORT = 5174;

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self' data:", "media-src 'self' blob: data:", "worker-src 'self' blob:",
  `connect-src 'self' ws://localhost:${PORT} ws://127.0.0.1:${PORT}`, "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'",
].join('; ');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg',
  '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.csv': 'text/plain; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

// L'aperçu des sites faits par l'équipe : servis à part, dans un bac à sable (origine opaque) :
// leurs scripts tournent, mais ils ne peuvent ni lire le bureau, ni se connecter au pont.
const PREVIEW_CSP = "sandbox allow-scripts allow-forms allow-popups allow-modals; frame-ancestors 'self'";

const claude = await findClaude();
// la version du bureau compilé : un onglet resté ouvert se recharge quand elle change
const BUILD = (() => { try { return String(Math.round(statSync(path.join(DIST, 'index.html')).mtimeMs)); } catch { return 'dev'; } })();
const clients = new Set<WebSocket>();

function broadcast(m: ServerMsg) {
  const s = JSON.stringify(m);
  for (const c of clients) if (c.readyState === c.OPEN) c.send(s);
}

const bureau = new Bureau(claude, broadcast, process.env.BUREAU_DIR);
await bureau.init();

// le mode Orca : chaque espace de travail d'Orca devient une pièce du bureau
const orcaBin = ORCA ? await findOrca() : null;
const orca = orcaBin ? new OrcaHub(orcaBin, (m) => broadcast(m as ServerMsg)) : null;
await orca?.start();

// ── Le serveur web (le bureau compilé) ──
const server = http.createServer(async (req, res) => {
  const url0 = new URL(req.url ?? '/', 'http://x');
  if (url0.pathname.startsWith('/apercu/')) { await preview(url0, res); return; }
  if (url0.pathname.startsWith('/skins/')) { await skin(url0, res); return; }
  if (DEV) { res.writeHead(404).end(tr({ ko: `개발 모드예요. 사무실은 http://localhost:${DEV_PORT} 에 있어요.`, en: `Dev mode: the office is at http://localhost:${DEV_PORT}` })); return; }
  try {
    const url = url0;
    let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)));
    if (file !== DIST && !file.startsWith(DIST + path.sep)) { res.writeHead(403).end(); return; }
    if (!existsSync(file) || file === DIST || file.endsWith(path.sep)) file = path.join(DIST, 'index.html');
    const body = await readFile(file);
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': TYPES[ext] ?? 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      // aucun script venu d'ailleurs : même un lien piégé dans un rapport ne peut rien exécuter
      ...(ext === '.html' ? { 'Content-Security-Policy': CSP } : {}),
    });
    res.end(body);
  } catch {
    res.writeHead(500).end(tr({ ko: '사무실이 아직 빌드되지 않았어요. "npm start"를 실행해 주세요.', en: 'The office isn’t built yet. Run "npm start".' }));
  }
});

/** /apercu/<mission>/<chemin> : un fichier de la mission, dans le bac à sable. */
async function preview(url: URL, res: http.ServerResponse) {
  try {
    const parts = url.pathname.split('/').slice(2).map((p) => decodeURIComponent(p));
    const missionId = parts.shift() ?? '';
    let rel = parts.join('/');
    if (!rel || rel.endsWith('/')) rel += 'index.html';
    const file = bureau.previewPath(missionId, rel);
    if (!file) { res.writeHead(404, { 'Content-Security-Policy': PREVIEW_CSP }).end(tr({ ko: '미션 폴더에서 찾을 수 없어요.', en: 'Not found in the mission folder.' })); return; }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Security-Policy': PREVIEW_CSP,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(500, { 'Content-Security-Policy': PREVIEW_CSP }).end();
  }
}

/** /skins/<chemin> : une image du dossier des skins (seulement des PNG). */
async function skin(url: URL, res: http.ServerResponse) {
  const file = bureau.skins.file(url.pathname);
  try {
    if (!file) throw new Error();
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}

// ── La connexion avec le bureau ──
// Seul le bureau lui-même peut se connecter (et, en développement, la page servie par Vite).
const allowedOrigins = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`, ...(DEV ? [`http://localhost:${DEV_PORT}`, `http://127.0.0.1:${DEV_PORT}`] : [])]);
const wss = new WebSocketServer({ noServer: true, maxPayload: 1_000_000 });

server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin ?? '';
  if (new URL(req.url ?? '/', 'http://x').pathname !== '/ws' || !allowedOrigins.has(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

const viewers = new WeakMap<WebSocket, Viewer>();

wss.on('connection', (ws) => {
  clients.add(ws);
  const send = (m: ServerMsg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));
  viewers.set(ws, { send: (m) => send(m as ServerMsg) });
  ws.on('close', () => { clients.delete(ws); orca?.forget(viewers.get(ws)!); });
  send({ ...bureau.hello(), orca: !!orca, rooms: orca?.rooms ?? [], build: BUILD } as ServerMsg);
  ws.on('message', async (data) => {
    let m: ClientMsg;
    try { m = JSON.parse(String(data)); } catch { return; }
    try {
      await handle(m, send, viewers.get(ws)!);
    } catch (e) {
      send({ t: 'toast', kind: 'error', text: e instanceof Error ? e.message : String(e) });
    }
  });
});

const str = (v: unknown, max = 20000) => (typeof v === 'string' ? v.slice(0, max) : '');

async function handle(m: ClientMsg, send: (m: ServerMsg) => void, viewer: Viewer) {
  switch (m.t) {
    case 'room': {
      const id = typeof m.id === 'string' ? str(m.id, 40) : null;
      const r = orca ? await orca.watch(viewer, id) : null;
      if (r) { send({ t: 'room_open', room: id, mission: r.mission, log: r.log }); break; }
      // son propre bureau (ou une pièce qui n'existe plus)
      const c = bureau.current;
      send({ t: 'room_open', room: null, mission: c?.mission ?? null, log: c?.log ?? [] });
      break;
    }
    case 'room_say':
      if (!orca) break;
      await orca.say(viewer, str(m.text));
      send({ t: 'toast', kind: 'info', text: tr({ ko: '에이전트에게 보냈어요.', en: 'Sent to the agent.' }) });
      break;
    case 'start':
      await bureau.start(str(m.prompt));
      break;
    case 'say':
      bureau.say(str(m.text));
      break;
    case 'stop':
      bureau.stop();
      break;
    case 'answer':
      bureau.answer(str(m.requestId, 100), m.allow === true);
      break;
    case 'new':
      bureau.close();
      break;
    case 'open':
      bureau.open(str(m.missionId, 40), m.file ? str(m.file, 1000) : undefined);
      break;
    case 'open_root':
      bureau.openRoot(m.rules === true);
      break;
    case 'open_skins':
      bureau.openSkins();
      break;
    case 'read': {
      const file = str(m.file, 1000);
      const version = m.version ? str(m.version, 120) : undefined;
      const { text, truncated } = await bureau.readText(str(m.missionId, 40), file, version);
      send({ t: 'file_text', missionId: m.missionId, file, text, truncated, version });
      break;
    }
    case 'versions': {
      const file = str(m.file, 1000);
      send({ t: 'versions', missionId: m.missionId, file, list: await bureau.versions(str(m.missionId, 40), file) });
      break;
    }
    case 'team_history':
      send({ t: 'team_history', entries: await bureau.teamHistory() });
      break;
    case 'replay': {
      const { mission, log } = await bureau.replay(str(m.missionId, 40));
      send({ t: 'replay', mission, log });
      break;
    }
    case 'settings':
      bureau.setSettings(m.settings ?? {});
      break;
  }
}

function listen(port: number) {
  server.once('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE') {
      console.error(tr({ ko: `  ${port}번 포트가 이미 쓰이고 있어요. 사무실이 벌써 켜져 있을 수도 있어요 (http://localhost:${port}).`, en: `  Port ${port} is already taken. The office may already be running (http://localhost:${port}).` }));
      process.exit(1);
    }
    throw e;
  });
  server.listen(port, HOST, () => {
    const url = `http://localhost:${port}`;
    console.log('');
    console.log('  🏢  Agent Office');
    console.log(`  ➜  ${DEV ? tr({ ko: `연결 준비 완료 (사무실: http://localhost:${DEV_PORT})`, en: `Bridge ready (the office: http://localhost:${DEV_PORT})` }) : url}`);
    console.log(`  📁  ${tr({ ko: '미션 폴더', en: 'Missions' })}: ${bureau.missionsDir}`);
    console.log(claude ? `  ✓  Claude Code ${claude.version} (${claude.path})` : tr({ ko: '  ✗  Claude Code를 찾을 수 없어요. 데모 모드로 실행할게요.', en: '  ✗  Claude Code not found: the office will run in demo mode.' }));
    if (ORCA) {
      console.log(orca
        ? tr({ ko: `  ✓  Orca 모드: 방 ${orca.rooms.length}개`, en: `  ✓  Orca mode: ${orca.rooms.length} rooms` })
        : tr({ ko: '  ✗  Orca CLI를 찾을 수 없어요. 평소 모드로 실행할게요.', en: '  ✗  Orca CLI not found: running in normal mode.' }));
    }
    console.log(tr({ ko: '  ⏹  끄려면: Ctrl + C', en: '  ⏹  To stop: Ctrl + C' }));
    console.log('');
    if (args.has('--open') && !DEV) {
      const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
      execFile(opener, [url], () => {});
    }
  });
}

listen(PORT);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    bureau.shutdown();
    orca?.stop();
    setTimeout(() => process.exit(0), 300);
  });
}
