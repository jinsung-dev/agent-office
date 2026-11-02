// Qu'y a-t-il sous la souris ? Un robot, le chat, un meuble, le tableau, l'horloge… Le plus en avant gagne.
import { ROLES } from '../../shared/activity.ts';
import { tr } from '../../shared/i18n.ts';
import type { Role } from '../../shared/protocol.ts';
import { textWidth } from './font.ts';
import { furniturePlacement } from './furniture.ts';
import { BOARD, CLOCK, DOOR, FURNITURE, NEON, POSTER, T, WINDOWS, ZONES } from './layout.ts';
import type { World } from './world.ts';

export type Hit =
  | { kind: 'actor'; id: string; label: string }
  | { kind: 'cat'; label: string }
  | { kind: 'object'; id: string; label: string; role?: Role };

function furnitureLabel(id: string, kind: string, role?: Role): string {
  switch (kind) {
    case 'desk': return tr({ ko: `${ROLES[role ?? 'renfort'].label} 코너의 책상`, en: `A desk in the ${ROLES[role ?? 'renfort'].label} corner` });
    case 'chair': return tr({ ko: `${ROLES[role ?? 'renfort'].label} 코너의 자리`, en: `A seat in the ${ROLES[role ?? 'renfort'].label} corner` });
    case 'chefDesk': return tr({ ko: 'Max의 책상: 팀의 보고서가 모여요', en: 'Max’s desk: the team’s reports' });
    case 'chefChair': return tr({ ko: 'Max의 의자', en: 'Max’s chair' });
    case 'rack': return tr({ ko: '서버: Claude Code와 내 구독', en: 'The server: Claude Code and your subscription' });
    case 'printer': return tr({ ko: '프린터: 미션 결과물', en: 'The printer: what the mission made' });
    case 'cooler': return tr({ ko: '정수기', en: 'The water cooler' });
    case 'easel': return tr({ ko: '디자인 스튜디오의 이젤', en: 'The design studio easel' });
    case 'plantBig': case 'plantTall': case 'plantSmall': return tr({ ko: '화분 (간지럽히는 걸 좋아해요)', en: 'A plant (it likes being tickled)' });
    case 'sofa': return tr({ ko: '소파 (고양이가 제일 좋아하는 자리)', en: 'The sofa (the cat’s favorite spot)' });
    case 'tableLow': return tr({ ko: '낮은 탁자', en: 'The coffee table' });
    case 'lamp': return tr({ ko: '스탠드 조명 (클릭하면 꺼져요)', en: 'A floor lamp (click to turn it off)' });
    case 'shelf': return tr({ ko: '기록 보관함: 지난 미션들', en: 'The archives: past missions' });
    case 'coffee': return tr({ ko: '커피 머신', en: 'The coffee machine' });
    case 'bin': return tr({ ko: '휴지통', en: 'The trash bin' });
    case 'jukebox': return tr({ ko: '주크박스', en: 'The jukebox' });
  }
  return id;
}

const placed = FURNITURE.map((f) => {
  const p = furniturePlacement(f);
  return { f, x: p.x, y: p.y, w: p.s.c.width, h: p.s.c.height, sortY: p.sortY };
}).sort((a, b) => b.sortY - a.sortY);

const inRect = (x: number, y: number, r: { x: number; y: number; w: number; h: number }) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

export function hitAt(world: World, x: number, y: number): Hit | null {
  // les robots (le plus en avant d'abord)
  const actors = [...world.actors.values()].sort((a, b) => (b.seated && b.seat ? b.seat.y : b.y) - (a.seated && a.seat ? a.seat.y : a.y));
  for (const a of actors) {
    const ay = a.seated && a.seat ? a.seat.y : a.y;
    if (a.alpha > 0.3 && x >= a.x - 7 && x <= a.x + 7 && y >= ay - 21 && y <= ay + 1) {
      return { kind: 'actor', id: a.id, label: a.id === 'chef' ? tr({ ko: '팀장 Max', en: 'Max, the team lead' }) : `${a.name} · ${ROLES[a.role].label}` };
    }
  }
  if (world.cat.hit(x, y)) return { kind: 'cat', label: tr({ ko: '사무실 고양이 Pixel', en: 'Pixel, the office cat' }) };
  // les meubles
  for (const p of placed) {
    if (!inRect(x, y, { x: p.x + 1, y: p.y + 1, w: p.w - 2, h: p.h - 2 })) continue;
    // un pixel transparent du dessin ne compte pas : on regarde le meuble suivant
    return { kind: 'object', id: p.f.id, label: furnitureLabel(p.f.id, p.f.kind, p.f.role), role: p.f.role };
  }
  // le mur du fond et le sol
  if (inRect(x, y, { x: BOARD.x - 2, y: BOARD.y - 2, w: BOARD.w + 4, h: BOARD.h + 6 })) return { kind: 'object', id: 'board', label: tr({ ko: '화이트보드: Max의 계획', en: 'The whiteboard: Max’s plan' }) };
  if (inRect(x, y, { x: CLOCK.x - 1, y: CLOCK.y - 1, w: 16, h: 16 })) return { kind: 'object', id: 'clock', label: tr({ ko: '시계', en: 'The clock' }) };
  if (inRect(x, y, { x: NEON.x, y: NEON.y - 3, w: 26, h: 26 })) return { kind: 'object', id: 'neon', label: tr({ ko: '네온사인 (클릭하면 색이 바뀌어요)', en: 'The neon sign (click to change its color)' }) };
  if (inRect(x, y, POSTER)) return { kind: 'object', id: 'poster', label: tr({ ko: '목표 포스터', en: 'The goals poster' }) };
  for (const w of WINDOWS) if (inRect(x, y, { x: w.x - 3, y: w.y - 3, w: w.w + 6, h: w.h + 8 })) return { kind: 'object', id: 'window', label: tr({ ko: '창문 (낮, 저녁, 밤)', en: 'The window (day, evening or night)' }) };
  if (inRect(x, y, DOOR)) return { kind: 'object', id: 'door', label: tr({ ko: '문: 팀원들이 여기로 들어와요', en: 'The door: this is where the team comes in' }) };
  for (const z of ZONES) {
    const w = textWidth(z.sign) + 10;
    const sx = z.x * T + 4, sy = z.role === 'chef' ? (z.y + z.h) * T - 12 : z.y * T + 3;
    if (inRect(x, y, { x: sx, y: sy, w, h: 9 })) return { kind: 'object', id: `zone:${z.role}`, label: tr({ ko: `${ROLES[z.role].label} 코너: 누가 어떤 도구로 일하는지`, en: `The ${ROLES[z.role].label} corner: who works here, with which tools` }), role: z.role };
  }
  return null;
}
