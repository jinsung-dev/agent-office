// Le panneau de droite : le plan de Max, l'équipe au travail (ce que chacun fait, son rapport),
// les rendus (les fichiers produits) et le fil de ce qui se passe. Sans mission : comment ça marche.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ROLES } from '../../shared/activity.ts';
import { getLang, tr } from '../../shared/i18n.ts';
import type { Role } from '../../shared/protocol.ts';
import { sfx } from '../audio/sfx.ts';
import { robotSprite } from '../engine/robots.ts';
import { teamList, useOffice, type AgentView } from '../state/store.ts';
import { EXAMPLES } from './Dialog.tsx';
import { fmtDate, fmtDuration, fmtTime, plural, tilde } from './format.ts';
import { mdToHtml } from './md.ts';
import { FileActions } from './Rooms.tsx';
import { tidy } from './tidy.ts';

export function Avatar({ role, size = 32 }: { role: Role; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const skinsVer = useOffice((s) => s.skinsVer);
  useEffect(() => {
    const g = ref.current!.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 20, 24);
    g.drawImage(robotSprite(role, 'stand', 'down', 0, 'open'), 0, 0);
  }, [role, skinsVer]);
  return <canvas ref={ref} width={20} height={24} className="avatar" style={{ width: size * (20 / 24), height: size }} />;
}

const STATUS: Record<AgentView['status'], string> = {
  working: tr({ ko: '일하는 중', en: 'Working' }),
  reporting: tr({ ko: '보고서 내는 중', en: 'Handing in the report' }),
  done: tr({ ko: '일을 마쳤어요', en: 'Work handed in' }),
  failed: tr({ ko: '끝내지 못했어요', en: 'Couldn’t finish' }),
};

export function Panel() {
  const mission = useOffice((s) => s.mission);
  return (
    <aside className="panel">
      {mission ? (
        <>
          <PlanSection />
          <TeamSection />
          <FilesSection />
          <FeedSection />
        </>
      ) : <Welcome />}
    </aside>
  );
}

function Welcome() {
  const missions = useOffice((s) => s.missions);
  const dir = useOffice((s) => s.dir);
  const send = useOffice((s) => s.send);
  const connection = useOffice((s) => s.connection);
  return (
    <>
      <section className="card">
        <h3>{tr({ ko: '이렇게 써요', en: 'How it works' })}</h3>
        {getLang() === 'ko' ? (
          <ol className="steps">
            <li><b>Max에게 원하는 걸 말해요.</b> 키보드로도, 말로도 돼요.</li>
            <li><b>Max가 계획을 세우고 팀을 불러요.</b> 각자 자리로 가요(리서치, 코드, 디자인, 글쓰기, 분석).</li>
            <li><b>팀이 일하는 걸 구경해요.</b> 말풍선은 에이전트가 지금 실제로 하는 일이에요.</li>
            <li><b>결과물을 받아요.</b> 파일은 “결과물”과 내 폴더에 들어와요.</li>
          </ol>
        ) : (
          <ol className="steps">
            <li><b>Tell Max what you want</b>, by typing or by voice.</li>
            <li><b>He makes a plan and calls in the team</b>: everyone heads to their desk (research, code, design, writing, analysis).</li>
            <li><b>Watch them work</b>, for real: each bubble is what that agent is doing right now.</li>
            <li><b>They hand you the work</b>: files show up in “Deliverables” and in your folder.</li>
          </ol>
        )}
        <p className="small muted">{tr({ ko: '진짜 Claude Code 에이전트들이 내 구독으로 일해요.', en: 'These are real Claude Code agents, running on your subscription.' })}</p>
      </section>
      <section className="card">
        <h3>{tr({ ko: '미션 아이디어', en: 'Mission ideas' })}</h3>
        <div className="chips col">
          {EXAMPLES.map((e) => <button key={e.label} className="chip" onClick={() => { sfx('click'); useOffice.setState({ draft: e.prompt }); }}>{e.label}</button>)}
        </div>
      </section>
      {connection === 'live' && (
        <section className="card">
          <h3>{tr({ ko: '내 사무실', en: 'Your office' })}</h3>
          <p className="small muted path">{tilde(dir)}</p>
          <div className="row">
            <button className="btn small" onClick={() => send({ t: 'open_root' })}>{tr({ ko: '폴더 열기', en: 'Open the folder' })}</button>
            <button className="btn small" onClick={() => send({ t: 'open_root', rules: true })}>{tr({ ko: '내 소개 (ABOUT-ME.md)', en: 'About me (ABOUT-ME.md)' })}</button>
          </div>
          <p className="small muted">{tr({ ko: 'ABOUT-ME.md에는 팀이 나에 대해 알아야 할 걸 적어요. Max가 미션마다 먼저 읽어요.', en: 'ABOUT-ME.md is what the team should know about you: Max reads it before every mission.' })}</p>
        </section>
      )}
      {missions.length > 0 && (
        <section className="card">
          <h3>{tr({ ko: '최근 미션', en: 'Recent missions' })}</h3>
          {missions.slice(0, 4).map((m) => (
            <div key={m.id} className="mini-mission">
              <div><b>{m.title}</b><span className="small muted">{fmtDate(m.createdAt)} · {fmtDuration(m.workMs)} · {plural(m.files.length, { ko: '결과물 #개', en: ['file', 'files'] })}</span></div>
              <div className="row">
                <button className="btn small" onClick={() => { sfx('click'); send({ t: 'replay', missionId: m.id }); }}>{tr({ ko: '다시 보기', en: 'Replay' })}</button>
                <button className="btn small ghost" onClick={() => send({ t: 'open', missionId: m.id })}>{tr({ ko: '폴더', en: 'Folder' })}</button>
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function PlanSection() {
  const plan = useOffice((s) => s.plan);
  if (!plan.length) return null;
  const done = plan.filter((p) => p.status === 'completed').length;
  return (
    <section className="card">
      <h3>{tr({ ko: '계획', en: 'The plan' })} <span className="count">{done}/{plan.length}</span></h3>
      <ul className="plan">
        {plan.map((p, i) => <li key={i} className={p.status}><i />{p.text}</li>)}
      </ul>
    </section>
  );
}

function TeamSection() {
  const team = useOffice(useShallow(teamList));
  const [open, setOpen] = useState<string | null>(null);
  if (!team.length) {
    return (
      <section className="card">
        <h3>{tr({ ko: '팀', en: 'The team' })}</h3>
        <p className="small muted">{tr({ ko: 'Max가 요청을 읽고 누구를 부를지 고르고 있어요…', en: 'Max is reading your request and picking who to call…' })}</p>
      </section>
    );
  }
  const active = team.filter((a) => a.status === 'working' || a.status === 'reporting').length;
  return (
    <section className="card">
      <h3>{tr({ ko: '팀', en: 'The team' })} <span className="count">{active ? tr({ ko: `${active}명 일하는 중`, en: `${active} working` }) : tr({ ko: `${team.length}명 다녀감`, en: `${team.length} came by` })}</span></h3>
      <div className="team">
        {team.map((a) => <AgentCard key={a.id} a={a} open={open === a.id} onToggle={() => { sfx('open'); setOpen(null); useOffice.setState({ modal: { kind: 'agent', id: a.id } }); }} />)}
      </div>
    </section>
  );
}

function AgentCard({ a, open, onToggle }: { a: AgentView; open: boolean; onToggle: () => void }) {
  const role = ROLES[a.role];
  const working = a.status === 'working' || a.status === 'reporting';
  const report = useMemo(() => (open && a.report ? mdToHtml(a.report) : ''), [open, a.report]);
  return (
    <div className={`agent ${a.status} ${open ? 'open' : ''}`} style={{ ['--c' as string]: role.color }}>
      <button className="agent-head" onClick={onToggle}>
        <Avatar role={a.role} size={30} />
        <div className="agent-id">
          <b>{a.name} <span>{role.icon} {role.label}</span></b>
          <span className="agent-task">{a.task}</span>
          <span className="agent-now">{working ? (a.act?.label ?? tr({ ko: '자리에 앉는 중…', en: 'Settling in at the desk…' })) : `${STATUS[a.status]}${a.leftAt ? ` · ${fmtDuration(a.leftAt - a.hiredAt)}` : ''}`}</span>
        </div>
        <span className={`agent-status ${a.status}`} />
      </button>
      {open && (
        <div className="agent-more">
          <h4>{tr({ ko: '맡은 일 (Max가 작성)', en: 'Their brief (written by Max)' })}</h4>
          <p className="brief">{a.prompt}</p>
          {a.acts.length > 0 && (
            <>
              <h4>{tr({ ko: '한 일', en: 'What they did' })}</h4>
              <ul className="acts">
                {a.acts.slice(-14).map((x) => <li key={x.id} title={x.detail}>{x.ok === false ? '⚠️ ' : ''}{x.label}</li>)}
              </ul>
            </>
          )}
          {report && (
            <>
              <h4>{tr({ ko: '보고서', en: 'Their report' })}</h4>
              <div className="md" dangerouslySetInnerHTML={{ __html: report }} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function FileList() {
  const files = useOffice((s) => s.files);
  const mission = useOffice((s) => s.mission);
  const send = useOffice((s) => s.send);
  const replaying = useOffice((s) => s.replaying);
  if (!mission) return null;
  return <FileActions files={files} missionId={mission.id} disabled={replaying} send={send} />;
}

function FilesSection() {
  const files = useOffice((s) => s.files.length);
  const mission = useOffice((s) => s.mission);
  const send = useOffice((s) => s.send);
  const replaying = useOffice((s) => s.replaying);
  const room = useOffice((s) => s.room);
  return (
    <section className="card">
      <h3>{tr({ ko: '결과물', en: 'Deliverables' })} <span className="count">{files}</span></h3>
      {files ? <FileList /> : <p className="small muted">{tr({ ko: '팀이 만든 파일이 여기(그리고 미션 폴더)에 들어와요.', en: 'The team’s files will show up here (and in the mission folder).' })}</p>}
      {mission && !replaying && !room && <button className="btn small ghost" onClick={() => send({ t: 'open', missionId: mission.id })}>{tr({ ko: '미션 폴더 열기', en: 'Open the mission folder' })}</button>}
    </section>
  );
}

function FeedSection() {
  const feed = useOffice((s) => s.feed);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [feed.length]);
  return (
    <section className="card">
      <h3>{tr({ ko: '실시간', en: 'Live' })}</h3>
      <div className="feed" ref={box}>
        {feed.slice(-60).map((l) => (
          <div key={l.id} className={`feed-line ${l.kind}`}>
            <span className="feed-time">{fmtTime(l.at)}</span>
            <b>{l.who}</b> {tidy(l.kind === 'chef' || l.kind === 'user' ? l.text.slice(0, 220) : l.text)}
          </div>
        ))}
      </div>
    </section>
  );
}
