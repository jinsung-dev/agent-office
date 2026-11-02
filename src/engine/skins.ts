// Les skins : un personnage dessiné par quelqu'un d'autre (une image de face, parfois de dos et de
// profil) prend la place du robot d'un métier. L'image est ramenée à la taille d'un robot, puis
// chaque pose est fabriquée à partir d'elle : on la retourne, on la fait sautiller, on l'écrase un peu.
import type { Role, SkinInfo } from '../../shared/protocol.ts';
import { g2d, makeCanvas, mirror, outline, P } from './pixels.ts';
import type { Dir, Pose } from './robots.ts';

/** La place d'un personnage dans le sprite du robot (20 × 24, les pieds en y = 22). */
const BOX_W = 18;
const BOX_H = 20;
const FEET = 21;

interface Views { down: HTMLCanvasElement; up: HTMLCanvasElement; right: HTMLCanvasElement; left: HTMLCanvasElement }

const views = new Map<Role, Views>();
const loaded = new Map<string, Promise<HTMLCanvasElement | null>>();
let wanted = '';

/** Le personnage d'un métier, s'il a un skin prêt. */
export function skinViews(role: Role): Views | null {
  return views.get(role) ?? null;
}

/**
 * Applique les skins choisis : charge les images qui manquent, puis prévient (onChange) pour que
 * les sprites soient redessinés. Les métiers sans skin (ou dont l'image ne charge pas) gardent leur robot.
 */
export function applySkins(list: SkinInfo[], chosen: Partial<Record<Role, string>>, onChange: () => void) {
  const key = JSON.stringify([list, chosen]);
  if (key === wanted) return;
  wanted = key;
  loaded.clear();
  const byId = new Map(list.map((s) => [s.id, s]));
  const jobs = (Object.keys(chosen) as Role[]).map(async (role) => {
    const s = byId.get(chosen[role] ?? '');
    if (!s) return [role, null] as const;
    const [front, back, side] = await Promise.all([load(s.front), s.back ? load(s.back) : null, s.side ? load(s.side) : null]);
    if (!front) return [role, null] as const;
    const right = side ?? front;
    return [role, { down: front, up: back ?? shade(front), right, left: mirror(right) }] as const;
  });
  void Promise.all(jobs).then((done) => {
    if (key !== wanted) return;
    views.clear();
    for (const [role, v] of done) if (v) views.set(role, v);
    onChange();
  });
}

function load(url: string): Promise<HTMLCanvasElement | null> {
  let p = loaded.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(fit(img));
      img.onerror = () => resolve(null);
      img.src = url;
    });
    loaded.set(url, p);
  }
  return p;
}

/**
 * Ramène une image à la taille d'un robot : on coupe les bords vides, on réduit en faisant la
 * moyenne des pixels (ou on agrandit d'un nombre entier de fois une toute petite image), puis on
 * rend les bords nets (chaque pixel est plein ou vide, comme du pixel art).
 */
function fit(img: HTMLImageElement): HTMLCanvasElement | null {
  const sw = img.naturalWidth, sh = img.naturalHeight;
  if (!sw || !sh || sw > 2048 || sh > 2048) return null;
  const src = makeCanvas(sw, sh);
  const sg = src.getContext('2d', { willReadFrequently: true })!;
  sg.drawImage(img, 0, 0);
  const d = sg.getImageData(0, 0, sw, sh).data;
  let x0 = sw, y0 = sh, x1 = -1, y1 = -1;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (d[(y * sw + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  let scale = Math.min(BOX_W / w, BOX_H / h);
  if (scale >= 1) scale = Math.floor(scale);
  const tw = Math.max(1, Math.round(w * scale)), th = Math.max(1, Math.round(h * scale));
  const out = makeCanvas(tw, th);
  const og = out.getContext('2d', { willReadFrequently: true })!;
  const od = og.createImageData(tw, th);
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      // la zone de l'image d'origine que couvre ce pixel
      const ax = x0 + Math.floor(tx / scale), bx = Math.max(ax + 1, x0 + Math.floor((tx + 1) / scale));
      const ay = y0 + Math.floor(ty / scale), by = Math.max(ay + 1, y0 + Math.floor((ty + 1) / scale));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = ay; y < by && y < sh; y++) {
        for (let x = ax; x < bx && x < sw; x++) {
          const i = (y * sw + x) * 4, al = d[i + 3];
          r += d[i] * al; g += d[i + 1] * al; b += d[i + 2] * al; a += al; n++;
        }
      }
      const o = (ty * tw + tx) * 4;
      if (n && a / n >= 110) {
        od.data[o] = r / a; od.data[o + 1] = g / a; od.data[o + 2] = b / a; od.data[o + 3] = 255;
      }
    }
  }
  og.putImageData(od, 0, 0);
  return out;
}

/** Le dos, quand on n'a que la face : la même image, un peu plus sombre. */
function shade(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] *= 0.72; img.data[i + 1] *= 0.72; img.data[i + 2] *= 0.78;
  }
  g.putImageData(img, 0, 0);
  return c;
}

const SEATED: Pose[] = ['sit', 'type', 'read'];

/** Une pose du personnage, fabriquée à partir de sa vue de face, de dos ou de profil. */
export function skinSprite(v: Views, pose: Pose, dir: Dir, frame: number, w: number, h: number): HTMLCanvasElement {
  const img = v[dir];
  let dy = 0, sx = 0, sy = 0, dx = 0;
  const air = Math.min(2, FEET - img.height);
  switch (pose) {
    case 'walk': case 'carry':
      // un petit pas : on sautille, et on s'écrase un peu en posant le pied
      dy = frame % 2 ? -1 : 0;
      if (frame % 2 === 0) { sx = 1; sy = -1; }
      break;
    case 'cheer': case 'wave': case 'raise':
      if (frame % 2) dy = -air;
      else { sx = 1; sy = -1; }
      break;
    case 'type':
      dy = 2; dx = frame % 2 ? 1 : 0;
      break;
    case 'write': case 'think':
      dx = frame % 2 ? 1 : 0;
      break;
  }
  if (SEATED.includes(pose) && pose !== 'type') dy = 2;
  const c = makeCanvas(w, h);
  const g = g2d(c);
  const iw = img.width + sx, ih = img.height + sy;
  const x = Math.round((w - iw) / 2) + dx;
  g.drawImage(img, x, FEET + 1 - ih + dy, iw, ih);
  outline(c, P.ink);
  return c;
}
