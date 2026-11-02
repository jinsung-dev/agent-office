// Orca mode: one tab per Orca workspace (a « room »), plus our own office.
// A dot tells what the room is doing: working, waiting for permission, done or idle.
import { tr } from '../../shared/i18n.ts';
import type { RoomInfo } from '../../shared/protocol.ts';
import { sfx } from '../audio/sfx.ts';
import { useOffice } from '../state/store.ts';

const DOT: Record<RoomInfo['state'], string> = { working: '🟢', waiting: '✋', done: '⚪', idle: '⚪' };

const STATE: Record<RoomInfo['state'], string> = {
  working: tr({ ko: '일하는 중', en: 'working' }),
  waiting: tr({ ko: '허락을 기다려요', en: 'waiting for permission' }),
  done: tr({ ko: '끝났어요', en: 'done' }),
  idle: tr({ ko: '쉬는 중', en: 'idle' }),
};

export function RoomTabs() {
  const orca = useOffice((s) => s.orca);
  const rooms = useOffice((s) => s.rooms);
  const room = useOffice((s) => s.room);
  const openRoom = useOffice((s) => s.openRoom);
  if (!orca) return null;
  const pick = (id: string | null) => { if (id !== room) { sfx('click'); openRoom(id); } };
  return (
    <nav className="room-tabs" aria-label={tr({ ko: 'Orca 방', en: 'Orca rooms' })}>
      <button className={room === null ? 'on' : ''} onClick={() => pick(null)}>🏢 {tr({ ko: '내 사무실', en: 'My office' })}</button>
      {rooms.map((r) => (
        <button key={r.id} className={room === r.id ? 'on' : ''} onClick={() => pick(r.id)}
          title={`${r.name}${r.branch && r.branch !== r.name ? ` (${r.branch})` : ''} · ${r.agent} · ${STATE[r.state]}`}>
          <span className={`dot ${r.state}`}>{DOT[r.state]}</span> {r.name}
        </button>
      ))}
      {rooms.length === 0 && <span className="room-empty">{tr({ ko: 'Orca에서 돌고 있는 에이전트가 없어요 (Orca가 꺼져 있을 수도 있어요)', en: 'No agents running in Orca (Orca may be closed)' })}</span>}
    </nav>
  );
}
