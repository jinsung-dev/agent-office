// La barre du haut : le nom du bureau, la mission en cours et son chrono, les compteurs (agents,
// recherches, pages lues, rendus), l'énergie de ton abonnement, et les réglages d'affichage.
import { useEffect, useState } from 'react';
import { tr } from '../../shared/i18n.ts';
import { sfx } from '../audio/sfx.ts';
import { applySound } from '../audio/sound.ts';
import { replaySpeed, stopReplay } from '../net/link.ts';
import { savePref, useOffice, type Tod } from '../state/store.ts';
import { fmtClock } from './format.ts';
import { startTour } from './tour.ts';

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <span className="logo" style={{ width: size, height: size }} aria-hidden="true">
      <span className="logo-visor"><i /><i /></span>
    </span>
  );
}

function useTick(on: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setN((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [on]);
}

const TOD_NEXT: Record<Tod, Tod> = { auto: 'day', day: 'evening', evening: 'night', night: 'auto' };
const TOD_ICON: Record<Tod, string> = { auto: '🕒', day: '☀️', evening: '🌇', night: '🌙' };
const TOD_LABEL: Record<Tod, string> = {
  auto: tr({ ko: '내 컴퓨터 시간', en: 'Your computer’s time' }), day: tr({ ko: '낮', en: 'Day' }), evening: tr({ ko: '저녁', en: 'Evening' }), night: tr({ ko: '밤', en: 'Night' }),
};

export function TopBar() {
  const mission = useOffice((s) => s.mission);
  const busySince = useOffice((s) => s.busySince);
  const workMs = useOffice((s) => s.workMs);
  const stats = useOffice((s) => s.stats);
  const files = useOffice((s) => s.files.length);
  const plan = useOffice((s) => s.plan);
  const quota = useOffice((s) => s.quota);
  const replaying = useOffice((s) => s.replaying);
  const connection = useOffice((s) => s.connection);
  const final = useOffice((s) => s.final);
  const vertical = useOffice((s) => s.vertical);
  const filming = useOffice((s) => s.filming);
  const sound = useOffice((s) => s.sound);
  const tod = useOffice((s) => s.tod);
  const musicOn = useOffice((s) => s.music.playing);
  useTick(busySince !== null);
  const elapsed = workMs + (busySince ? Date.now() - busySince : 0);
  const done = plan.filter((p) => p.status === 'completed').length;
  const current = plan.find((p) => p.status === 'in_progress') ?? plan.find((p) => p.status === 'pending');

  const status = !mission ? null : busySince ? 'live' : final?.ok ? 'done' : mission.status === 'error' ? 'error' : 'stopped';
  const toggle = (k: 'vertical' | 'filming' | 'sound') => {
    sfx('click');
    const v = !useOffice.getState()[k];
    useOffice.setState({ [k]: v });
    if (k !== 'filming') savePref(k, v);
    if (k === 'sound') applySound(v);
  };

  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <div>
          <b>Agent Office</b>
          {connection === 'demo' && <span>{tr({ ko: '데모', en: 'Demo' })}</span>}
        </div>
      </div>

      <div className="mission-head">
        {mission ? (
          <>
            <span className={`dot ${status}`} />
            <span className="mission-title" title={mission.prompt}>{mission.title}</span>
            <span className="timer">{fmtClock(elapsed)}</span>
          </>
        ) : <span className="muted">{tr({ ko: '진행 중인 미션이 없어요', en: 'No mission running' })}</span>}
        {mission && plan.length > 0 && (
          <span className="plan-step" title={current?.text ?? ''}>📋 {done}/{plan.length}{current && busySince ? ` · ${current.text}` : ''}</span>
        )}
      </div>

      {mission && (
        <div className="stats">
          <span title={tr({ ko: '불러온 에이전트', en: 'Agents called in' })}>🤖 {stats.agents}</span>
          <span title={tr({ ko: '인터넷 검색', en: 'Web searches' })}>🔎 {stats.searches}</span>
          <span title={tr({ ko: '읽은 웹페이지', en: 'Web pages read' })}>🌐 {stats.pages}</span>
          <span title={tr({ ko: '완성된 파일', en: 'Files delivered' })}>📄 {files}</span>
        </div>
      )}

      {replaying && (
        <div className="replay-bar">
          <span>{tr({ ko: '다시 보기', en: 'Replay' })}</span>
          {[1, 2, 4].map((x) => <button key={x} onClick={() => replaySpeed(x)}>×{x}</button>)}
          {connection !== 'demo' && <button onClick={() => { sfx('click'); stopReplay(); }}>{tr({ ko: '나가기', en: 'Exit' })}</button>}
        </div>
      )}

      <div className="tools">
        {quota && (
          <span className="energy" title={tr({ ko: `5시간 구독 사용량: ${Math.round(quota.fiveHour * 100)}% 사용`, en: `Your 5-hour subscription window: ${Math.round(quota.fiveHour * 100)}% used` })}>
            <span className="energy-label">{tr({ ko: '에너지', en: 'Energy' })}</span>
            <span className="energy-bar"><i style={{ width: `${Math.max(3, 100 - quota.fiveHour * 100)}%` }} /></span>
          </span>
        )}
        <button className="icon-btn" title={tr({ ko: '둘러보기: Max가 사무실을 소개해요 (T)', en: 'Guided tour: Max shows you around (T)' })} onClick={() => void startTour()}>🎤</button>
        <button className="icon-btn" title={tr({ ko: '팀 전체: 역할, 도구, 기록', en: 'The whole team: roles, tools, history' })} onClick={() => { sfx('open'); useOffice.setState({ modal: { kind: 'team' } }); }}>👥</button>
        <button className={`icon-btn ${musicOn ? 'on' : ''}`} title={tr({ ko: '주크박스 (J)', en: 'The jukebox (J)' })} onClick={() => { sfx('open'); useOffice.setState({ modal: { kind: 'jukebox' } }); }}>{musicOn ? '🎶' : '🎵'}</button>
        <button className="icon-btn" title={tr({ ko: '지난 미션 (H)', en: 'Past missions (H)' })} onClick={() => { sfx('open'); useOffice.setState({ historyOpen: true }); }}>🗂️</button>
        <button className="icon-btn" title={tr({ ko: `사무실 시간: ${TOD_LABEL[tod]} (N)`, en: `Office time: ${TOD_LABEL[tod]} (N)` })} onClick={() => { sfx('click'); const n = TOD_NEXT[tod]; useOffice.setState({ tod: n }); savePref('tod', n); }}>{TOD_ICON[tod]}</button>
        <button className="icon-btn" title={sound ? tr({ ko: '소리 끄기 (M)', en: 'Mute (M)' }) : tr({ ko: '소리 켜기 (M)', en: 'Unmute (M)' })} onClick={() => toggle('sound')}>{sound ? '🔊' : '🔇'}</button>
        <button className={`icon-btn ${vertical ? 'on' : ''}`} title={tr({ ko: '세로 화면 9:16, 릴스 촬영용 (V)', en: 'Vertical 9:16 frame, for filming a reel (V)' })} onClick={() => toggle('vertical')}>📱</button>
        <button className={`icon-btn ${filming ? 'on' : ''}`} title={tr({ ko: '촬영 모드: 사무실과 Max만 보여요 (F)', en: 'Filming mode: just the office and Max (F)' })} onClick={() => toggle('filming')}>🎬</button>
        <button className="icon-btn" title={tr({ ko: '설정', en: 'Settings' })} onClick={() => { sfx('open'); useOffice.setState({ settingsOpen: true }); }}>⚙️</button>
      </div>
    </header>
  );
}
