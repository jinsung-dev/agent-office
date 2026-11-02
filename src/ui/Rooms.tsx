// Les fenêtres qu'on ouvre en cliquant dans le bureau. Tout y vient de Claude Code, pour de vrai :
// la fiche d'un agent (sa mission, chacune de ses actions, son rapport), le plan de Max et son
// historique, l'équipe et ses outils, la machine, les rendus et l'aperçu des sites créés.
import { useEffect, useMemo, useState } from 'react';
import { ROLE_TOOLS, ROLES, TOOL_INFO } from '../../shared/activity.ts';
import { locale, tr } from '../../shared/i18n.ts';
import type { PlanItem, Role } from '../../shared/protocol.ts';
import { jukebox, TRACKS } from '../audio/music.ts';
import { sfx } from '../audio/sfx.ts';
import { world } from '../engine/instance.ts';
import { savePref, teamList, useOffice, type ActView, type Tod } from '../state/store.ts';
import { useShallow } from 'zustand/react/shallow';
import { fileIcon, fmtClock, fmtDate, fmtDuration, fmtSize, fmtTime, plural, readable, tilde } from './format.ts';
import { party } from './interact.ts';
import { mdToHtml } from './md.ts';
import { Avatar } from './Panel.tsx';
import { tidy } from './tidy.ts';

const ICON: Record<string, string> = {
  search: '🔎', web: '🌐', read: '📖', write: '✍️', edit: '✏️', bash: '💻', plan: '📋', skill: '🎓', mcp: '🔌', other: '⚙️',
};

function Shell({ title, sub, wide, children, onClose }: { title: React.ReactNode; sub?: React.ReactNode; wide?: boolean; children: React.ReactNode; onClose?: () => void }) {
  const close = onClose ?? (() => useOffice.setState({ modal: null }));
  return (
    <div className="modal-back" onClick={close}>
      <div className={`modal room ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="room-title"><b>{title}</b>{sub && <span>{sub}</span>}</div>
          <button className="close" onClick={close} aria-label={tr({ ko: '닫기', en: 'Close' })}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Les fenêtres du bureau (une seule ouverte à la fois). */
export function Rooms() {
  const modal = useOffice((s) => s.modal);
  if (!modal) return null;
  switch (modal.kind) {
    case 'agent': return <AgentRoom id={modal.id} />;
    case 'board': return <BoardRoom />;
    case 'clock': return <ClockRoom />;
    case 'machine': return <MachineRoom />;
    case 'jukebox': return <JukeboxRoom />;
    case 'team': return <TeamRoom role={modal.role} />;
    case 'files': return <FilesRoom />;
    case 'preview': return <PreviewRoom missionId={modal.missionId} file={modal.file} />;
  }
}

// ── La fiche d'un agent ──
function AgentRoom({ id }: { id: string }) {
  const a = useOffice((s) => s.agents[id]);
  const live = world.actors.get(id);
  const html = useMemo(() => (a?.report ? mdToHtml(tidy(a.report)) : ''), [a?.report]);
  if (!a) return <Shell title={tr({ ko: '이 에이전트는 이제 없어요', en: 'This agent is gone' })}>{tr({ ko: '사무실을 떠났어요.', en: 'They left the office.' })}</Shell>;
  const role = ROLES[a.role];
  const working = a.status === 'working' || a.status === 'reporting';
  return (
    <Shell title={<>{a.name}</>} sub={`${role.icon} ${role.label} · ${a.task}`}>
      <div className="agent-hero" style={{ ['--c' as string]: role.color }}>
        <Avatar role={a.role} size={72} />
        <div>
          <span className={`pill-status ${a.status}`}>{working ? (live?.seated ? tr({ ko: '일하는 중', en: 'Working' }) : tr({ ko: '가는 중', en: 'On the way' })) : a.status === 'done' ? tr({ ko: '일을 마쳤어요', en: 'Work handed in' }) : tr({ ko: '끝내지 못했어요', en: 'Couldn’t finish' })}</span>
          <p className="now">{working && a.act ? <><i>{ICON[a.act.kind]}</i>{a.act.label}</> : a.status === 'done' ? tr({ ko: '보고서가 Max의 책상 위에 있어요.', en: 'Their report is on Max’s desk.' }) : working ? tr({ ko: '자리에 앉는 중…', en: 'Settling in at the desk…' }) : ''}</p>
          <p className="small muted">{tr({ ko: `진짜 Claude Code 하위 에이전트(“${role.type || 'renfort'}”)예요. 자기 도구가 따로 있어요: ${ROLE_TOOLS[a.role].join(', ') || 'Max와 같은 도구'}.`, en: `A real Claude Code subagent (“${role.type || 'renfort'}”), with its own tools: ${ROLE_TOOLS[a.role].join(', ') || 'the same as Max'}.` })}</p>
        </div>
      </div>
      <section className="room-sec">
        <h4>{tr({ ko: '맡은 일 (Max가 작성)', en: 'Their brief, written by Max' })}</h4>
        <p className="brief">{tidy(a.prompt)}</p>
      </section>
      {a.acts.length > 0 && (
        <section className="room-sec">
          <h4>{tr({ ko: '한 일', en: 'What they did' })} <span className="count">{plural(a.acts.length, { ko: '#개', en: ['action', 'actions'] })}</span></h4>
          <ActList acts={a.acts} />
        </section>
      )}
      {html && (
        <section className="room-sec">
          <h4>{tr({ ko: '보고서', en: 'Their report' })}</h4>
          <div className="md report" dangerouslySetInnerHTML={{ __html: html }} />
        </section>
      )}
      {a.leftAt && (
        <p className="small muted">{tr({ ko: `${fmtDuration(a.leftAt - a.hiredAt)} 일함`, en: `${fmtDuration(a.leftAt - a.hiredAt)} of work` })}{a.tools ? ` · ${plural(a.tools, { ko: '도구 #번 사용', en: ['tool used', 'tools used'] })}` : ''}{a.tokens ? ` · ${plural(a.tokens, { ko: '토큰 #개', en: ['token', 'tokens'] })}` : ''}</p>
      )}
    </Shell>
  );
}

function ActList({ acts }: { acts: ActView[] }) {
  return (
    <ul className="act-list">
      {acts.slice(-40).map((x) => (
        <li key={x.id} className={x.ok === false ? 'fail' : ''}>
          <i>{ICON[x.kind]}</i>
          <div>
            <span>{x.label}</span>
            {x.detail && x.detail !== x.label && <code>{(() => { const d = tidy(x.detail); return d.length > 160 ? d.slice(0, 159) + '…' : d; })()}</code>}
          </div>
          <time>{fmtTime(x.at)}</time>
        </li>
      ))}
    </ul>
  );
}

// ── Le tableau : le plan, qui fait quoi, et l'historique du plan ──
function planChanges(prev: PlanItem[] | null, next: PlanItem[]): string[] {
  if (!prev) return [tr({ ko: `Max가 계획을 세워요: ${next.length}단계`, en: `Max writes the plan: ${plural(next.length, { ko: '', en: ['step', 'steps'] })}` })];
  const out: string[] = [];
  for (const it of next) {
    const before = prev.find((p) => p.text === it.text);
    if (!before) out.push(`+ ${it.text}`);
    else if (before.status !== it.status && it.status === 'completed') out.push(`✓ ${it.text}`);
    else if (before.status !== it.status && it.status === 'in_progress') out.push(`▶ ${it.text}`);
  }
  return out;
}

function BoardRoom() {
  const plan = useOffice((s) => s.plan);
  const history = useOffice((s) => s.planHistory);
  const team = useOffice(useShallow(teamList));
  const done = plan.filter((p) => p.status === 'completed').length;
  const steps = useMemo(() => history.map((h, i) => ({ at: h.at, lines: planChanges(i ? history[i - 1].items : null, h.items) })).filter((x) => x.lines.length), [history]);
  return (
    <Shell title={tr({ ko: 'Max의 보드', en: 'Max’s board' })} sub={plan.length ? tr({ ko: `${plan.length}단계 중 ${done}단계 완료`, en: `${done} of ${plan.length} step${plan.length === 1 ? '' : 's'} done` }) : tr({ ko: '미션 계획과 누가 뭘 하는지', en: 'The mission plan, and who does what' })}>
      {plan.length > 0 ? (
        <>
          <div className="progress"><i style={{ width: `${(done / plan.length) * 100}%` }} /></div>
          <ul className="plan big">{plan.map((p, i) => <li key={i} className={p.status}><i />{p.text}</li>)}</ul>
        </>
      ) : <p className="muted">{tr({ ko: '아직 계획이 없어요. 미션에 단계가 여러 개면 Max가 바로 계획을 적어요.', en: 'No plan yet: Max writes one as soon as a mission has several steps.' })}</p>}
      <section className="room-sec">
        <h4>{tr({ ko: '누가 뭘 하나요', en: 'Who does what' })} <span className="count">{plural(team.length, { ko: '에이전트 #명', en: ['agent', 'agents'] })}</span></h4>
        {team.length ? (
          <div className="who">
            {team.map((a) => (
              <button key={a.id} className={`who-row ${a.status}`} style={{ ['--c' as string]: ROLES[a.role].color }} onClick={() => { sfx('open'); useOffice.setState({ modal: { kind: 'agent', id: a.id } }); }}>
                <Avatar role={a.role} size={26} />
                <b>{a.name}</b>
                <span className="who-task">{a.task}</span>
                <span className="who-state">{a.status === 'done' ? tr({ ko: '✓ 보고 완료', en: '✓ report in' }) : a.status === 'failed' ? tr({ ko: '✕ 못 끝냄', en: '✕ not finished' }) : a.status === 'reporting' ? tr({ ko: '📄 보고하는 중', en: '📄 handing in the report' }) : tr({ ko: '… 일하는 중', en: '… working' })}</span>
              </button>
            ))}
          </div>
        ) : <p className="muted small">{tr({ ko: '아직 아무도 없어요.', en: 'Nobody yet.' })}</p>}
      </section>
      {steps.length > 0 && (
        <section className="room-sec">
          <h4>{tr({ ko: '계획 기록', en: 'Plan history' })}</h4>
          <ol className="timeline">
            {steps.map((s, i) => (
              <li key={i}>
                <time>{fmtTime(s.at)}</time>
                <div>{s.lines.map((l, j) => <span key={j}>{l}</span>)}</div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </Shell>
  );
}

// ── L'horloge ──
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return now;
}

const TODS: [Tod, string][] = [
  ['auto', tr({ ko: '내 컴퓨터처럼', en: 'Like your computer' })], ['day', tr({ ko: '☀️ 낮', en: '☀️ Day' })], ['evening', tr({ ko: '🌇 저녁', en: '🌇 Evening' })], ['night', tr({ ko: '🌙 밤', en: '🌙 Night' })],
];

function ClockRoom() {
  const now = useClock();
  const tod = useOffice((s) => s.tod);
  const busySince = useOffice((s) => s.busySince);
  const workMs = useOffice((s) => s.workMs);
  const mission = useOffice((s) => s.mission);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return (
    <Shell title={tr({ ko: '사무실 시계', en: 'The office clock' })} sub={now.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}>
      <div className="big-clock"><span>{hh}</span><i>:</i><span>{mm}</span><small>{ss}</small></div>
      {mission && (busySince
        ? <p className="center">{tr({ ko: '미션 진행 시간', en: 'Mission running for' })} <b>{fmtClock(workMs + (now.getTime() - busySince))}</b> · {mission.title}</p>
        : <p className="center">{tr({ ko: '지난 미션 작업 시간', en: 'Last mission: worked for' })} <b>{fmtClock(workMs)}</b> · {mission.title}</p>)}
      <p className="center muted small">{tr({ ko: '팀은 잠들지 않아요. 새벽 3시에도 낮 12시처럼 일해요.', en: 'Your team never sleeps: it works at 3 a.m. just like at noon.' })}</p>
      <div className="seg">
        {TODS.map(([v, l]) => (
          <button key={v} className={tod === v ? 'on' : ''} onClick={() => { sfx('click'); useOffice.setState({ tod: v }); savePref('tod', v); }}>{l}</button>
        ))}
      </div>
    </Shell>
  );
}

// ── La machine (le serveur) : Claude Code, le modèle, l'abonnement ──
function MachineRoom() {
  const claude = useOffice((s) => s.claude);
  const settings = useOffice((s) => s.settings);
  const mission = useOffice((s) => s.mission);
  const quota = useOffice((s) => s.quota);
  const dir = useOffice((s) => s.dir);
  const connection = useOffice((s) => s.connection);
  const rows: [string, React.ReactNode][] = [
    ['Claude Code', claude?.found ? `${claude.version} · ${tilde(claude.path ?? '')}` : connection === 'demo' ? tr({ ko: '데모 (실제 미션 다시 보기)', en: 'Demo (replay of a real mission)' }) : tr({ ko: '찾을 수 없음', en: 'not found' })],
    [tr({ ko: '연결', en: 'Connection' }), tr({ ko: '내 Claude 구독 (API 키 없음, 사용량 과금 없음)', en: 'your Claude subscription (no API key, no pay-per-use billing)' })],
    [tr({ ko: 'Max의 두뇌', en: 'Max’s brain' }), mission?.model ? tr({ ko: `${mission.model} (설정: ${settings.chefModel || '기본값'})`, en: `${mission.model} (setting: ${settings.chefModel || 'default'})` }) : settings.chefModel || tr({ ko: '기본값', en: 'default' })],
    [tr({ ko: '팀의 두뇌', en: 'The team’s brain' }), settings.teamModel === 'inherit' ? tr({ ko: 'Max와 같은 모델', en: 'same as Max' }) : settings.teamModel],
    [tr({ ko: '권한', en: 'Permissions' }), settings.permission === 'auto' ? tr({ ko: '자동: 위험한 일만 손을 들어 물어봐요', en: 'automatic: the agent raises a hand for risky moves' }) : tr({ ko: '명령마다 물어봐요', en: 'asked before every command' })],
    [tr({ ko: '에너지 (5시간)', en: 'Energy (5 h)' }), quota ? tr({ ko: `${Math.round(quota.fiveHour * 100)}% 사용`, en: `${Math.round(quota.fiveHour * 100)}% used` }) + (quota.resetsAt ? tr({ ko: `, ${new Date(quota.resetsAt * 1000).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}에 충전`, en: `, recharges at ${new Date(quota.resetsAt * 1000).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}` }) : '') : tr({ ko: '아직 측정 안 됨', en: 'not measured yet' })],
    [tr({ ko: '사무실 폴더', en: 'Office folder' }), dir ? tilde(dir) : '—'],
    [tr({ ko: '진행 중인 미션', en: 'Current mission' }), mission ? tilde(mission.folder) : tr({ ko: '없음', en: 'none' })],
  ];
  return (
    <Shell title={tr({ ko: '머신', en: 'The machine' })} sub={tr({ ko: '사무실 뒤에서 돌아가는 것들', en: 'What runs behind the office' })}>
      <dl className="kv">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <section className="room-sec">
        <h4>{tr({ ko: '어떻게 돌아가나요', en: 'How it works' })}</h4>
        <p className="small">{tr({
          ko: 'Max는 진짜 Claude Code 세션이에요. 창 없이 미션 폴더 안에서 실행돼요. 팀원들은 진짜 Claude Code 하위 에이전트이고, 각자 지시사항과 자기 역할에 맞는 도구만 가지고 있어요. 에이전트가 도구를 쓸 때마다(검색, 웹페이지 읽기, 파일 쓰기) Claude Code가 사무실에 알려 주고, 사무실은 바로 보여 줘요. 타자 치는 로봇, 말풍선, 팀장 책상 위의 보고서처럼요.',
          en: 'Max is a real Claude Code session, running without a window inside the mission folder. His team are real Claude Code subagents, each with its own instructions and only the tools for its job. Every time an agent uses a tool (a search, a page read, a file written), Claude Code tells the office, which shows it right away: a robot typing, a bubble, a report dropped on the boss’s desk.',
        })}</p>
        <p className="small muted">{tr({ ko: '제한 모드: 팀은 미션 폴더 밖으로 절대 나가지 않고, 내 설정이나 다른 에이전트도 사무실에 끼어들지 않아요.', en: 'Restricted mode: the team never leaves the mission folder, and neither your settings nor your other agents get into the office.' })}</p>
      </section>
    </Shell>
  );
}

// ── Le jukebox ──
function JukeboxRoom() {
  const music = useOffice((s) => s.music);
  const track = TRACKS[music.index];
  return (
    <Shell title={tr({ ko: '주크박스', en: 'The jukebox' })} sub={tr({ ko: '일할 때 듣는 하우스 음악 (퇴근 후 파티에도)', en: 'House music to work to (or for the after-work party)' })}>
      <div className="now-playing">
        <div className={`vinyl ${music.playing ? 'spin' : ''}`}><i /></div>
        <div>
          <b>{track.title}</b>
          <span>{track.mood}</span>
          <div className="row">
            <button className="btn small" onClick={() => jukebox.prev()} aria-label={tr({ ko: '이전 곡', en: 'Previous track' })}>⏮</button>
            <button className="btn primary small" onClick={() => jukebox.toggle()}>{music.playing ? tr({ ko: '⏸ 일시정지', en: '⏸ Pause' }) : tr({ ko: '▶ 재생', en: '▶ Play' })}</button>
            <button className="btn small" onClick={() => jukebox.next()} aria-label={tr({ ko: '다음 곡', en: 'Next track' })}>⏭</button>
          </div>
        </div>
      </div>
      <label className="field volume">
        <span>{tr({ ko: '볼륨', en: 'Volume' })}</span>
        <input type="range" min={0} max={1} step={0.01} value={music.volume} onChange={(e) => jukebox.setVolume(Number(e.target.value))} />
      </label>
      <ul className="tracks">
        {TRACKS.map((t, i) => (
          <li key={t.id}>
            <button className={i === music.index ? 'on' : ''} onClick={() => jukebox.play(i)}>
              <span>{i === music.index && music.playing ? '♪' : i + 1}</span>
              <b>{t.title}</b>
              <em>{t.mood}</em>
            </button>
          </li>
        ))}
      </ul>
      <div className="row">
        <button className="btn" onClick={() => { useOffice.setState({ modal: null }); party(); }}>🪩 {tr({ ko: '파티 모드', en: 'Party mode' })}</button>
        <span className="small muted">{tr({ ko: '이 사무실을 위해 ElevenLabs Music과 Google Lyria로 만든 오리지널 곡이에요.', en: 'Original tracks, made for the office with ElevenLabs Music and Google Lyria.' })}</span>
      </div>
    </Shell>
  );
}

// ── Toute l'équipe : les métiers et leurs outils, la mission en cours, l'historique ──
function TeamRoom({ role }: { role?: Role }) {
  const [tab, setTab] = useState<'roles' | 'now' | 'history'>(role ? 'roles' : 'now');
  const team = useOffice(useShallow(teamList));
  const settings = useOffice((s) => s.settings);
  const history = useOffice((s) => s.teamHistory);
  const send = useOffice((s) => s.send);
  const connection = useOffice((s) => s.connection);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { if (tab === 'history' && connection === 'live') send({ t: 'team_history' }); }, [tab, connection, send]);
  const working = (r: Role) => [...world.actors.values()].filter((a) => a.role === r && a.seated).length;
  const roles: Role[] = ['chef', 'recherche', 'code', 'design', 'redaction', 'analyse'];
  const missions = useMemo(() => {
    const m = new Map<string, { title: string; at: number; entries: NonNullable<typeof history> }>();
    for (const e of history ?? []) {
      if (!m.has(e.missionId)) m.set(e.missionId, { title: e.missionTitle, at: e.at, entries: [] });
      m.get(e.missionId)!.entries.push(e);
    }
    return [...m.entries()];
  }, [history]);
  return (
    <Shell title={tr({ ko: '팀 전체', en: 'The whole team' })} sub={tr({ ko: '진짜 Claude Code 에이전트들이에요. 각자 역할과 도구가 있어요.', en: 'Real Claude Code agents, each with a job and its tools' })} wide>
      <div className="seg tabs">
        <button className={tab === 'now' ? 'on' : ''} onClick={() => setTab('now')}>{tr({ ko: '이번 미션', en: 'This mission' })}</button>
        <button className={tab === 'roles' ? 'on' : ''} onClick={() => setTab('roles')}>{tr({ ko: '역할', en: 'Roles' })}</button>
        <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>{tr({ ko: '기록', en: 'History' })}</button>
      </div>
      {tab === 'now' && (team.length ? (
        <div className="who">
          {team.map((a) => (
            <button key={a.id} className={`who-row ${a.status}`} style={{ ['--c' as string]: ROLES[a.role].color }} onClick={() => { sfx('open'); useOffice.setState({ modal: { kind: 'agent', id: a.id } }); }}>
              <Avatar role={a.role} size={26} />
              <b>{a.name}</b>
              <span className="who-task">{ROLES[a.role].icon} {a.task}</span>
              <span className="who-state">{a.status === 'done' ? tr({ ko: '✓ 보고 완료', en: '✓ report in' }) : a.status === 'failed' ? tr({ ko: '✕ 못 끝냄', en: '✕ not finished' }) : a.act ? a.act.label : tr({ ko: '… 일하는 중', en: '… working' })}</span>
            </button>
          ))}
        </div>
      ) : <p className="muted">{tr({ ko: '아직 사무실에 아무도 없어요. Max에게 미션을 주면 알맞은 에이전트를 불러올 거예요.', en: 'Nobody in the office yet. Give Max a mission: he’ll call in the right agents.' })}</p>)}
      {tab === 'roles' && (
        <div className="roles">
          {roles.map((r) => (
            <div key={r} className={`role-card ${role === r ? 'focus' : ''}`} style={{ ['--c' as string]: ROLES[r].color }}>
              <div className="role-head"><Avatar role={r} size={34} /><div><b>{ROLES[r].icon} {ROLES[r].label}</b><span>{r === 'chef' ? 'Max' : tr({ ko: `“${ROLES[r].type}” 에이전트`, en: `“${ROLES[r].type}” agent` })} · {tr({ ko: '두뇌', en: 'brain' })}: {r === 'chef' ? settings.chefModel || tr({ ko: '기본값', en: 'default' }) : settings.teamModel === 'inherit' ? tr({ ko: 'Max와 같음', en: 'same as Max' }) : settings.teamModel}</span></div>{working(r) > 0 && <em>{tr({ ko: `${working(r)}명 일하는 중`, en: `${working(r)} working` })}</em>}</div>
              <p>{ROLES[r].what}</p>
              <div className="tools">{ROLE_TOOLS[r].map((t) => <span key={t} title={TOOL_INFO[t] ?? t}>{t}<small>{TOOL_INFO[t] ?? ''}</small></span>)}</div>
            </div>
          ))}
        </div>
      )}
      {tab === 'history' && (
        connection !== 'live' ? <p className="muted">{tr({ ko: '기록은 내 컴퓨터에 있어요. Claude Code와 함께 앱을 실행하면 볼 수 있어요.', en: 'The history lives on your computer: run the app with Claude Code to see it.' })}</p>
          : !history ? <p className="muted">{tr({ ko: '불러오는 중…', en: 'Loading…' })}</p>
            : !missions.length ? <p className="muted">{tr({ ko: '아직 기록이 없어요.', en: 'No history yet.' })}</p>
              : (
                <div className="hist-team">
                  {missions.map(([id, m]) => (
                    <section key={id}>
                      <h4>{m.title} <span className="count">{fmtDate(m.at)}</span></h4>
                      {m.entries.map((e) => (
                        <div key={e.id} className={`hist-row ${e.status}`} style={{ ['--c' as string]: ROLES[e.role].color }}>
                          <button onClick={() => setOpen(open === e.id ? null : e.id)}>
                            <Avatar role={e.role} size={22} />
                            <b>{e.name}</b>
                            <span>{ROLES[e.role].label} · {e.task}</span>
                            <em>{e.status === 'done' ? '✓' : e.status === 'failed' ? '✕' : '…'} {e.ms ? fmtDuration(e.ms) : ''}</em>
                          </button>
                          {open === e.id && e.report && <div className="md small" dangerouslySetInnerHTML={{ __html: mdToHtml(tidy(e.report)) }} />}
                        </div>
                      ))}
                    </section>
                  ))}
                </div>
              )
      )}
    </Shell>
  );
}

// ── L'imprimante : les rendus de la mission ──
function FilesRoom() {
  const files = useOffice((s) => s.files);
  const mission = useOffice((s) => s.mission);
  const send = useOffice((s) => s.send);
  const replaying = useOffice((s) => s.replaying);
  if (!mission || !files.length) {
    return <Shell title={tr({ ko: '결과물', en: 'Deliverables' })} sub={tr({ ko: '사무실 프린터', en: 'The office printer' })}><p className="muted">{tr({ ko: '아직 인쇄된 게 없어요. 팀이 만든 파일이 여기로 와요.', en: 'Nothing printed yet: the team’s files will show up here.' })}</p></Shell>;
  }
  return (
    <Shell title={tr({ ko: '결과물', en: 'Deliverables' })} sub={`${plural(files.length, { ko: '파일 #개', en: ['file', 'files'] })} · ${mission.title}`}>
      <FileActions files={files} missionId={mission.id} disabled={replaying} send={send} />
    </Shell>
  );
}

export function FileActions({ files, missionId, disabled, send }: { files: ReturnType<typeof useOffice.getState>['files']; missionId: string; disabled: boolean; send: ReturnType<typeof useOffice.getState>['send'] }) {
  const agents = useOffice((s) => s.agents);
  return (
    <div className="files">
      {files.map((f) => (
        <div key={f.path} className="file">
          <span className="file-icon">{fileIcon(f.ext)}</span>
          <div className="file-id">
            <b title={f.path}>{f.name}</b>
            <span className="small muted">{fmtSize(f.size)} · {tr({ ko: '만든 이', en: 'by' })} {f.by === 'chef' ? 'Max' : agents[f.by]?.name ?? tr({ ko: '팀', en: 'the team' })}</span>
          </div>
          {!disabled && (f.ext === 'html' || f.ext === 'htm') && (
            <button className="btn small primary" onClick={() => { sfx('open'); useOffice.setState({ modal: { kind: 'preview', missionId, file: f.path } }); }}>{tr({ ko: '사이트 보기', en: 'View site' })}</button>
          )}
          {!disabled && readable(f.ext) && (
            <button className="btn small" onClick={() => { sfx('open'); useOffice.setState({ modal: null, viewer: { missionId, file: f.path } }); send({ t: 'read', missionId, file: f.path }); send({ t: 'versions', missionId, file: f.path }); }}>{tr({ ko: '읽기', en: 'Read' })}</button>
          )}
          {!disabled && <button className="btn small ghost" onClick={() => send({ t: 'open', missionId, file: f.path })}>{tr({ ko: '열기', en: 'Open' })}</button>}
        </div>
      ))}
    </div>
  );
}

// ── L'aperçu d'un site fait par l'équipe, dans un écran (bac à sable : il ne peut rien toucher) ──
function PreviewRoom({ missionId, file }: { missionId: string; file: string }) {
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const [nonce, setNonce] = useState(0);
  const send = useOffice((s) => s.send);
  const src = `/apercu/${encodeURIComponent(missionId)}/${file.split('/').map(encodeURIComponent).join('/')}`;
  const close = () => useOffice.setState({ modal: null });
  return (
    <div className="modal-back" onClick={close}>
      <div className="monitor" onClick={(e) => e.stopPropagation()}>
        <div className="monitor-bar">
          <span className="dots"><i /><i /><i /></span>
          <span className="addr">🔒 {file}</span>
          <div className="seg small">
            <button className={device === 'desktop' ? 'on' : ''} onClick={() => setDevice('desktop')}>💻 {tr({ ko: '컴퓨터', en: 'Desktop' })}</button>
            <button className={device === 'phone' ? 'on' : ''} onClick={() => setDevice('phone')}>📱 {tr({ ko: '휴대폰', en: 'Phone' })}</button>
          </div>
          <button className="btn small" onClick={() => setNonce((n) => n + 1)} title={tr({ ko: '새로고침', en: 'Reload' })}>↻</button>
          <button className="btn small" title={tr({ ko: '페이지 코드와 버전 기록', en: 'The page’s code, and its versions' })} onClick={() => { useOffice.setState({ modal: null, viewer: { missionId, file } }); send({ t: 'read', missionId, file }); send({ t: 'versions', missionId, file }); }}>&lt;/&gt; {tr({ ko: '코드와 버전', en: 'Code & versions' })}</button>
          <button className="btn small" onClick={() => send({ t: 'open', missionId, file })}>{tr({ ko: '브라우저에서 열기', en: 'Open in browser' })}</button>
          <button className="close" onClick={close} aria-label={tr({ ko: '닫기', en: 'Close' })}>×</button>
        </div>
        <div className={`monitor-screen ${device}`}>
          <iframe key={nonce} title={file} src={src} sandbox="allow-scripts allow-forms allow-popups allow-modals" referrerPolicy="no-referrer" />
        </div>
      </div>
    </div>
  );
}
