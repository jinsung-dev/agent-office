// En bas de l'écran, comme dans un jeu de rôle : Max te parle (son texte s'écrit lettre par lettre),
// et tu lui réponds : au clavier ou à la voix. C'est le seul endroit où taper : une demande, et l'équipe s'y met.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ROLES } from '../../shared/activity.ts';
import { getLang, tr } from '../../shared/i18n.ts';
import { sfx } from '../audio/sfx.ts';
import { world } from '../engine/instance.ts';
import { robotSprite } from '../engine/robots.ts';
import { useOffice } from '../state/store.ts';
import { tidy } from './tidy.ts';
import { dictationHelp, useDictation } from './voice.ts';

export const EXAMPLES: { label: string; prompt: string }[] = [
  {
    label: tr({ ko: '🔎 경쟁사 분석', en: '🔎 Analyze my competitors' }),
    prompt: tr({
      ko: '내 주요 경쟁사 5곳을 분석해 줘. 각 회사의 상품, 가격, 고객들의 평가를 알려 줘. 경쟁사마다 리서처를 한 명씩 붙이고, 마지막에 비교표와 나를 차별화할 구체적인 아이디어 3개를 줘.',
      en: 'Analyze my top 5 competitors: for each one, their offer, their prices and what their customers say. Put one researcher on each competitor, then give me a comparison table and 3 concrete ideas to stand out.',
    }),
  },
  {
    label: tr({ ko: '📰 이번 주 AI 소식', en: '📰 My AI news roundup' }),
    prompt: tr({
      ko: '이번 주 AI 소식을 정리해 줘. 사업하는 사람에게 중요한 새 소식 5개(도구, 발표, 활용법)를 골라서, 각각 나한테 뭐가 달라지는지 한 문장과 출처 링크를 붙여 줘.',
      en: 'Put together my AI news for the week: the 5 updates that matter for a business owner (tools, announcements, use cases), each with one sentence on what it changes for me and a link to the source.',
    }),
  },
  {
    label: tr({ ko: '🌐 판매 페이지 만들기', en: '🌐 My sales page' }),
    prompt: tr({
      ko: '내 상품의 판매 페이지를 만들어 줘. 파일 하나로 된 세련된 웹페이지로, 강한 제목, 장점, 나중에 채울 후기 섹션, 행동 유도 버튼을 넣어 줘. 글쓰기 담당에게 검토도 받아 줘.',
      en: 'Build the sales page for my offer: a modern single-file web page with a strong headline, the benefits, a testimonials section to fill in later and a call-to-action button. Have a writer proofread it.',
    }),
  },
  {
    label: tr({ ko: '✍️ 링크드인 글 3개', en: '✍️ 3 LinkedIn posts' }),
    prompt: tr({
      ko: '내 일에 대한 링크드인 글 3개를 써 줘. 글마다 첫 문장을 다르게 하고, 셋 중 가장 좋은 글로 HTML 인용 이미지도 하나 만들어 줘.',
      en: 'Write me 3 LinkedIn posts about my business, each with a different hook, and make an HTML quote graphic for the best of the three.',
    }),
  },
];

const stripMd = (s: string) =>
  tidy(s).replace(/```[\s\S]*?```/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]+/g, '').replace(/^\s*[-•]\s+/gm, '• ').replace(/\n{2,}/g, '\n').trim();

/** Le texte de Max, qui s'écrit lettre par lettre, avec un petit « bip » (comme dans les vieux jeux). */
function useTypewriter(text: string, cps = 55) {
  const [n, setN] = useState(0);
  const shown = useRef('');
  useEffect(() => {
    // si le nouveau texte prolonge celui qui s'affiche, on continue ; sinon on recommence
    if (!text.startsWith(shown.current)) setN(0);
  }, [text]);
  useEffect(() => {
    if (n >= text.length) return;
    const t = setTimeout(() => {
      const step = text.length - n > 260 ? 8 : 2;
      setN((x) => Math.min(text.length, x + step));
      if (n % 6 === 0) sfx('blip', 0.85 + Math.random() * 0.3);
    }, (1000 / cps) * 2);
    return () => clearTimeout(t);
  }, [n, text, cps]);
  const out = text.slice(0, Math.min(n, text.length));
  shown.current = out;
  return { out, done: n >= text.length };
}

/** Le visage de Max, en grand, qui cligne des yeux (et sourit quand c'est fini). */
function Portrait({ happy }: { happy: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = ref.current!.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    let blink = 0;
    const draw = () => {
      const chef = world.chef;
      const eyes = happy ? 'happy' : blink > 0 ? 'blink' : chef.eyes === 'blink' ? 'open' : chef.eyes === 'happy' ? 'happy' : chef.eyes;
      g.clearRect(0, 0, 64, 64);
      g.drawImage(robotSprite('chef', 'stand', 'down', 0, eyes), 2, 0, 16, 16, 0, 0, 64, 64);
      if (blink > 0) blink--;
      else if (Math.random() < 0.02) blink = 2;
    };
    draw();
    const t = setInterval(draw, 120);
    return () => clearInterval(t);
  }, [happy]);
  return <canvas ref={ref} width={64} height={64} className="portrait" />;
}

export function Dialog() {
  const connection = useOffice((s) => s.connection);
  const claude = useOffice((s) => s.claude);
  const mission = useOffice((s) => s.mission);
  const busy = useOffice((s) => s.busySince !== null);
  const replaying = useOffice((s) => s.replaying);
  const roomInfo = useOffice((s) => (s.room ? s.rooms.find((r) => r.id === s.room) ?? null : null));
  const chef = useOffice((s) => s.chef);
  const final = useOffice((s) => s.final);
  const tour = useOffice((s) => s.tour);

  let text: string;
  if (tour) text = tour.text;
  else if (connection === 'offline') text = tr({ ko: 'Claude Code에 연결되어 있지 않아요. 앱 폴더에서 “npm start”를 실행하면 바로 일을 시작할게요.', en: 'I’m not connected to Claude Code. Run “npm start” in the app folder and we’ll get to work.' });
  else if (claude && !claude.found) text = tr({ ko: '이 컴퓨터에서 Claude Code를 못 찾았어요. 설치하고(claude.com/claude-code) 로그인한 다음, 앱을 다시 실행해 주세요.', en: 'I can’t find Claude Code on this computer. Install it (claude.com/claude-code), log in, then restart the app.' });
  else if (!mission) text = tr({ ko: '안녕하세요! 저는 이 사무실의 팀장 Max예요. 필요한 걸 말해 주세요. 제가 팀을 꾸려서 눈앞에서 바로 일할게요.', en: 'Hi! I’m Max, the boss of this office. Tell me what you need: I’ll build the team, and we’ll get to work right in front of you.' });
  else if (chef.typing) text = stripMd(chef.typing);
  else if (final && !busy) text = stripMd(final.text) || (final.ok ? tr({ ko: '다 됐어요!', en: 'All done!' }) : tr({ ko: '미션을 멈췄어요.', en: 'Mission stopped.' }));
  else if (chef.say) text = stripMd(chef.say);
  else text = busy ? tr({ ko: '요청을 읽고 있어요…', en: 'Reading your request…' }) : '';

  const { out } = useTypewriter(text);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [out]);

  return (
    <footer className="dialog">
      <div className="dialog-box">
        <div className="dialog-face"><Portrait happy={!!final?.ok && !busy} /></div>
        <div className="dialog-main">
          <div className="dialog-name">{roomInfo ? <>{roomInfo.name} <span>{roomInfo.agent}</span></> : <>Max <span>{tr({ ko: '팀장', en: 'team lead' })}</span></>}{replaying && <em className="pill replay">{tr({ ko: '다시 보기', en: 'Replay' })}</em>}</div>
          <div className="dialog-text" ref={box}>{out}<span className="caret" /></div>
        </div>
      </div>
      <Composer />
    </footer>
  );
}

export function AskBar() {
  const asks = useOffice(useShallow((s) => Object.values(s.asks)));
  const agents = useOffice((s) => s.agents);
  const send = useOffice((s) => s.send);
  const a = asks[0];
  if (!a) return null;
  const who = a.who === 'chef' ? 'Max' : agents[a.who]?.name ?? tr({ ko: '에이전트', en: 'An agent' });
  const role = a.who === 'chef' ? 'chef' : agents[a.who]?.role ?? 'renfort';
  const answer = (allow: boolean) => { sfx(allow ? 'yes' : 'no'); send({ t: 'answer', requestId: a.requestId, allow }); };
  return (
    <div className="askbar">
      <div className="askbar-head">🙋 <b style={{ color: ROLES[role].color }}>{who}</b>{getLang() === 'ko'
        ? `님이 허락을 구해요${asks.length > 1 ? ` (외 ${asks.length - 1}건)` : ''}`
        : ` is asking for permission${asks.length > 1 ? ` (and ${asks.length - 1} more)` : ''}`}</div>
      <div className="askbar-label">{a.label}</div>
      {!a.full && a.detail && <pre className="askbar-detail">{a.detail}</pre>}
      <div className="askbar-actions">
        <button className="btn primary" onClick={() => answer(true)}>{tr({ ko: '허락하기', en: 'Allow' })}</button>
        <button className="btn" onClick={() => answer(false)}>{tr({ ko: '거절하기', en: 'Deny' })}</button>
      </div>
    </div>
  );
}

function Composer() {
  const mission = useOffice((s) => s.mission);
  const busy = useOffice((s) => s.busySince !== null);
  const replaying = useOffice((s) => s.replaying);
  const send = useOffice((s) => s.send);
  const draft = useOffice((s) => s.draft);
  const demo = useOffice((s) => s.connection === 'demo');
  const [text, setText] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef(text);
  textRef.current = text;

  // un exemple choisi ailleurs (ou « demander une retouche ») remplit la zone de texte
  useEffect(() => {
    if (!draft) return;
    setText(draft === ' ' ? '' : draft);
    useOffice.setState({ draft: '' });
    setTimeout(() => area.current?.focus(), 30);
  }, [draft]);

  const getBase = useCallback(() => textRef.current, []);
  const dict = useDictation(getBase, setText);

  const room = useOffice((s) => s.room);
  const mode: 'new' | 'steer' | 'retouch' = !mission ? 'new' : busy ? 'steer' : 'retouch';
  const placeholder = room
    ? tr({ ko: '이 방의 에이전트에게 보낼 말… (Orca 터미널로 바로 가요)', en: 'Message for this room’s agent… (goes straight to its Orca terminal)' })
    : mode === 'new'
    ? tr({ ko: 'Max에게 원하는 걸 말해 주세요… (예: 경쟁사 5곳 분석해 줘)', en: 'Tell Max what you want… (for example: analyze my 5 competitors)' })
    : mode === 'steer' ? tr({ ko: 'Max에게 덧붙일 말이 있나요? 다음 단계 전에 읽을게요.', en: 'Something to add for Max? He’ll read it between steps.' }) : tr({ ko: 'Max에게 수정을 부탁하거나… 새 미션을 시작해 보세요.', en: 'Ask Max for a tweak… or start a new mission.' });

  const submit = () => {
    const t = text.trim();
    if (!t || replaying) return;
    if (dict.listening) dict.stop();
    sfx('send');
    if (room) send({ t: 'room_say', text: t });
    else if (mode === 'new') send({ t: 'start', prompt: t });
    else send({ t: 'say', text: t });
    setText('');
  };

  return (
    <div className="composer">
      <div className={`composer-row ${dict.listening ? 'listening' : ''}`}>
        <textarea
          ref={area}
          value={text}
          rows={2}
          placeholder={demo ? tr({ ko: '데모예요. 진짜 버전은 내 컴퓨터에서 Claude Code로 돌아가요.', en: 'This is a demo: the real thing runs on your computer, with Claude Code.' }) : replaying ? tr({ ko: '다시 보는 중…', en: 'Replay in progress…' }) : placeholder}
          disabled={replaying}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
          }}
        />
        <button
          className={`mic ${dict.listening ? 'on' : ''}`}
          title={dict.listening ? tr({ ko: '받아쓰기 멈추기', en: 'Stop dictation' }) : tr({ ko: '말로 입력하기 (한국어)', en: 'Dictate (in English)' })}
          aria-label={tr({ ko: '말로 입력하기', en: 'Dictate' })}
          disabled={replaying}
          onClick={() => (dict.listening ? dict.stop() : dict.start())}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" /></svg>
        </button>
        {busy && !replaying ? (
          <>
            {text.trim() && <button className="btn primary send" onClick={submit}>{tr({ ko: '보내기', en: 'Send' })}</button>}
            {!room && <button className="btn stop" onClick={() => { sfx('click'); send({ t: 'stop' }); }}>■ {tr({ ko: '멈추기', en: 'Stop' })}</button>}
          </>
        ) : (
          <button className="btn primary send" disabled={!text.trim() || replaying} onClick={submit}>
            {mode === 'new' ? tr({ ko: '시작하기', en: 'Let’s go' }) : tr({ ko: '보내기', en: 'Send' })} <span aria-hidden="true">➜</span>
          </button>
        )}
        {mode === 'retouch' && !replaying && (
          <button className="btn ghost" title={tr({ ko: '이 미션을 정리하고 처음부터 다시 시작해요', en: 'Put this mission away and start fresh' })} onClick={() => { sfx('click'); send({ t: 'new' }); }}>＋ {tr({ ko: '새 미션', en: 'New mission' })}</button>
        )}
      </div>
      {dict.problem && (
        <div className="hint" onClick={dict.clearProblem}>🎙️ {dictationHelp(dict.problem)}</div>
      )}
    </div>
  );
}
