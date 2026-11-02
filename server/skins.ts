// Les skins : des images de personnages qu'on dépose dans le dossier skins/ du bureau (en vrac,
// en dossiers, ou en .zip) et qu'on choisit ensuite pour chaque métier. Le serveur surveille le
// dossier, décompresse les .zip (seulement les PNG, à plat) et sert les images sous /skins/.
import { existsSync, watch, type FSWatcher } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import type { SkinInfo } from '../shared/protocol.ts';

const MAX_FILE = 4 * 1024 * 1024;
const MAX_ENTRIES = 500;
const MAX_TOTAL = 100 * 1024 * 1024;
const LOOSE = '_';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class Skins {
  readonly dir: string;
  list: SkinInfo[] = [];
  private watcher: FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;
  private onChange: (list: SkinInfo[]) => void;

  constructor(dir: string, onChange: (list: SkinInfo[]) => void) {
    this.dir = dir;
    this.onChange = onChange;
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
    await this.scan();
    try {
      this.watcher = watch(this.dir, { recursive: true }, () => {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.rescan(), 400);
      });
    } catch { /* pas de surveillance : la liste se met à jour au prochain lancement */ }
  }

  close() { this.watcher?.close(); }

  private async rescan() {
    const before = JSON.stringify(this.list);
    await this.scan();
    if (JSON.stringify(this.list) !== before) this.onChange(this.list);
  }

  async scan() {
    const top = await readdir(this.dir, { withFileTypes: true }).catch(() => []);
    for (const e of top) {
      if (e.isFile() && e.name.toLowerCase().endsWith('.zip')) await this.unzip(path.join(this.dir, e.name)).catch(() => {});
    }
    const found = new Map<string, SkinInfo>();
    // rel : le chemin du PNG depuis skins/ ; pack : son premier dossier (ou LOOSE pour une image en vrac)
    const add = (pack: string, rel: string) => {
      const m = /^(.*?)(?:\.(back|side))?\.png$/i.exec(path.basename(rel));
      if (!m || !m[1] || m[1].startsWith('.')) return;
      const inner = pack === LOOSE ? [] : rel.split(path.sep).slice(1, -1);
      const id = [pack, ...inner, m[1]].join('/');
      const s = found.get(id) ?? { id, pack: pack === LOOSE ? '' : pack, name: m[1], front: '' };
      const url = '/skins/' + rel.split(path.sep).map(encodeURIComponent).join('/');
      if (m[2]?.toLowerCase() === 'back') s.back = url;
      else if (m[2]?.toLowerCase() === 'side') s.side = url;
      else s.front = url;
      found.set(id, s);
    };
    for (const e of await readdir(this.dir, { withFileTypes: true }).catch(() => [])) {
      if (e.name.startsWith('.')) continue;
      if (e.isFile()) add(LOOSE, e.name);
      else if (e.isDirectory()) for (const rel of await pngs(this.dir, e.name, 0)) add(e.name, rel);
    }
    this.list = [...found.values()].filter((s) => s.front).sort((a, b) => a.pack.localeCompare(b.pack) || a.name.localeCompare(b.name));
  }

  /** Le fichier d'une image demandée sous /skins/, ou null (seulement des PNG du dossier skins/). */
  file(urlPath: string): string | null {
    let rel: string;
    try { rel = urlPath.split('/').slice(2).map((p) => decodeURIComponent(p)).join('/'); } catch { return null; }
    if (!rel.toLowerCase().endsWith('.png')) return null;
    const file = path.normalize(path.join(this.dir, rel));
    return file.startsWith(this.dir + path.sep) ? file : null;
  }

  /** Décompresse un .zip à côté de lui (dans un dossier du même nom), s'il est nouveau. */
  private async unzip(zip: string) {
    const out = zip.replace(/\.zip$/i, '');
    const zs = await stat(zip);
    if (existsSync(out) && (await stat(out)).mtimeMs >= zs.mtimeMs) return;
    if (zs.size > MAX_TOTAL) return;
    const files = readZip(await readFile(zip));
    await mkdir(out, { recursive: true });
    for (const [name, data] of files) await writeFile(path.join(out, name), data);
  }
}

/** Les PNG d'un dossier (et de ses sous-dossiers, sur 3 niveaux), en chemins relatifs à root. */
async function pngs(root: string, rel: string, depth: number): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(path.join(root, rel), { withFileTypes: true }).catch(() => [])) {
    if (e.name.startsWith('.') || e.name === '__MACOSX') continue;
    const r = path.join(rel, e.name);
    if (e.isFile() && e.name.toLowerCase().endsWith('.png')) out.push(r);
    else if (e.isDirectory() && depth < 3) out.push(...await pngs(root, r, depth + 1));
  }
  return out;
}

const utf8 = new TextDecoder('utf-8', { fatal: true });
const euckr = new TextDecoder('euc-kr');

/** Lit un .zip en mémoire : seulement les PNG, sans leur chemin, dans les limites de taille. */
export function readZip(buf: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  // la fin du répertoire central (signature 0x06054b50), cherchée depuis la fin
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return files;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  let total = 0;
  for (let n = 0; n < Math.min(count, MAX_ENTRIES) && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const raw = buf.subarray(p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    let full: string;
    if (flags & 0x800) full = raw.toString('utf8');
    else { try { full = utf8.decode(raw); } catch { full = euckr.decode(raw); } }
    full = full.replace(/\\/g, '/');
    const name = full.split('/').pop() ?? '';
    if (full.startsWith('__MACOSX/') || name.startsWith('.') || !name.toLowerCase().endsWith('.png')) continue;
    if (usize > MAX_FILE || csize > MAX_FILE || (total += usize) > MAX_TOTAL) continue;
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + csize);
    try {
      const out = method === 0 ? Buffer.from(data) : method === 8 ? inflateRawSync(data, { maxOutputLength: MAX_FILE }) : null;
      if (out && out.subarray(0, 8).equals(PNG_SIGNATURE) && !files.has(name)) files.set(name, out);
    } catch { /* fichier abîmé : on passe */ }
  }
  return files;
}
