// Les fenêtres par-dessus le bureau : la carte du rendu final, la lecture d'un fichier,
// les missions précédentes, les réglages, et les petites notifications.
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { getLang, LANGS, locale, tr } from '../../shared/i18n.ts';
import { ROLES } from '../../shared/activity.ts';
import type { Role, SkinInfo } from '../../shared/protocol.ts';
import { sfx } from '../audio/sfx.ts';
import { savePref, switchLang, useOffice } from '../state/store.ts';
import { applySound } from '../audio/sound.ts';
import { Avatar, FileList } from './Panel.tsx';
import { fmtDate, fmtDuration, plural, tilde } from './format.ts';
import { mdToHtml } from './md.ts';
import { tidy } from './tidy.ts';

/** La mission est rendue : Max te présente le travail de l'équipe. */
export function FinalCard() {
  const show = useOffice((s) => s.showFinal);
  const final = useOffice((s) => s.final);
  const mission = useOffice((s) => s.mission);
  const room = useOffice((s) => s.room);
  const stats = useOffice((s) => s.stats);
  const workMs = useOffice((s) => s.workMs);
  const files = useOffice((s) => s.files.length);
  const send = useOffice((s) => s.send);
  const replaying = useOffice((s) => s.replaying);
  const html = useMemo(() => (final?.text ? mdToHtml(tidy(final.text)) : ''), [final?.text]);
  if (!show || !final || !mission) return null;
  const close = () => useOffice.setState({ showFinal: false });
  return (
    <div className="final" role="dialog" aria-label={tr({ ko: '미션 결과물', en: 'Mission results' })}>
      <button className="close" onClick={close} aria-label={tr({ ko: '닫기', en: 'Close' })}>×</button>
      <div className="final-head">
        <span className="final-badge"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
        <div>
          <b>{tr({ ko: '미션 완료', en: 'Mission accomplished' })}</b>
          <span>{mission.title} · {fmtDuration(workMs)}</span>
        </div>
      </div>
      <div className="final-stats">
        <span>🤖 {plural(stats.agents, { ko: '에이전트 #명', en: ['agent', 'agents'] })}</span>
        <span>🔎 {plural(stats.searches, { ko: '검색 #번', en: ['search', 'searches'] })}</span>
        <span>🌐 {plural(stats.pages, { ko: '페이지 #개 읽음', en: ['page read', 'pages read'] })}</span>
        <span>📄 {plural(files, { ko: '결과물 #개', en: ['file', 'files'] })}</span>
      </div>
      {html && <div className="md final-text" dangerouslySetInnerHTML={{ __html: html }} />}
      {files > 0 && <FileList />}
      {!replaying && (
        <div className="final-actions">
          {!room && <button className="btn" onClick={() => send({ t: 'open', missionId: mission.id })}>{tr({ ko: '폴더 열기', en: 'Open the folder' })}</button>}
          <button className="btn" onClick={() => { close(); useOffice.setState({ draft: ' ' }); }}>{tr({ ko: '수정 부탁하기', en: 'Ask for a tweak' })}</button>
          <button className="btn primary" onClick={() => { sfx('click'); close(); send({ t: 'new' }); }}>{tr({ ko: '새 미션', en: 'New mission' })}</button>
        </div>
      )}
    </div>
  );
}

/** Lire un rendu (rapport, tableau…) sans quitter le bureau. */
export function Viewer() {
  const viewer = useOffice((s) => s.viewer);
  const send = useOffice((s) => s.send);
  const agents = useOffice((s) => s.agents);
  const versions = useOffice((s) => (s.viewer ? s.versions[`${s.viewer.missionId}|${s.viewer.file}`] : undefined));
  const html = useMemo(() => {
    if (!viewer?.text) return '';
    const ext = viewer.file.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'md' || ext === 'markdown') return mdToHtml(viewer.text);
    if (['html', 'htm', 'css', 'js', 'ts', 'py', 'json', 'svg'].includes(ext)) return '';
    if (ext === 'csv') {
      const sep = viewer.text.includes(';') && !viewer.text.split('\n')[0].includes(',') ? ';' : ',';
      const rows = viewer.text.trim().split('\n').slice(0, 200).map((r) => r.split(sep));
      const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!).replace(/^"|"$/g, '');
      return `<table>${rows.map((r, i) => `<tr>${r.map((c) => (i === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('')}</table>`;
    }
    return '';
  }, [viewer]);
  if (!viewer) return null;
  const close = () => useOffice.setState({ viewer: null });
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal viewer" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>{viewer.file}</b>
          <div className="row">
            {versions && versions.length > 1 && (
              <select
                className="versions"
                title={tr({ ko: '이 파일의 버전 기록', en: 'Version history of this file' })}
                value={viewer.version ?? ''}
                onChange={(e) => {
                  const v = e.target.value || undefined;
                  useOffice.setState({ viewer: { ...viewer, text: undefined, version: v } });
                  send({ t: 'read', missionId: viewer.missionId, file: viewer.file, version: v });
                }}
              >
                <option value="">{tr({ ko: '현재 버전', en: 'Current version' })}</option>
                {versions.slice(1).map((v, i) => (
                  <option key={v.id} value={v.id}>
                    v{versions.length - 1 - i} · {new Date(v.at).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })} · {v.by === 'chef' ? 'Max' : agents[v.by]?.name ?? tr({ ko: '팀', en: 'the team' })}
                  </option>
                ))}
              </select>
            )}
            <button className="btn small" onClick={() => send({ t: 'open', missionId: viewer.missionId, file: viewer.file })}>{tr({ ko: '앱으로 열기', en: 'Open in app' })}</button>
            <button className="close" onClick={close} aria-label={tr({ ko: '닫기', en: 'Close' })}>×</button>
          </div>
        </div>
        <div className="modal-body">
          {viewer.text === undefined ? <p className="muted">{tr({ ko: '여는 중…', en: 'Opening…' })}</p>
            : html ? <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
              : <pre className="plain">{viewer.text}</pre>}
          {viewer.truncated && <p className="small muted">{tr({ ko: '(긴 파일이라 앞부분만 보여요.)', en: '(Long file: only the beginning is shown.)' })}</p>}
        </div>
      </div>
    </div>
  );
}

/** Les missions précédentes : on peut les rejouer (pour filmer) ou ouvrir leur dossier. */
export function History() {
  const open = useOffice((s) => s.historyOpen);
  const missions = useOffice((s) => s.missions);
  const send = useOffice((s) => s.send);
  const connection = useOffice((s) => s.connection);
  if (!open) return null;
  const close = () => useOffice.setState({ historyOpen: false });
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal history" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><b>{tr({ ko: '지난 미션', en: 'Past missions' })}</b><button className="close" onClick={close} aria-label={tr({ ko: '닫기', en: 'Close' })}>×</button></div>
        <div className="modal-body">
          {connection !== 'live' && <p className="muted">{tr({ ko: '지난 미션을 보려면 Claude Code에 연결해 주세요(npm start).', en: 'Connect the app to Claude Code (npm start) to see your missions.' })}</p>}
          {connection === 'live' && !missions.length && <p className="muted">{tr({ ko: '아직 미션이 없어요. 화면 아래에서 첫 미션을 시작해 보세요.', en: 'No missions yet. Your first one is waiting at the bottom of the screen.' })}</p>}
          {missions.map((m) => (
            <div key={m.id} className="hist">
              <div className="hist-id">
                <b>{m.title}</b>
                <span className="small muted">
                  {fmtDate(m.createdAt)} · {fmtDuration(m.workMs)} · {plural(m.stats.agents, { ko: '에이전트 #명', en: ['agent', 'agents'] })} · {plural(m.files.length, { ko: '결과물 #개', en: ['file', 'files'] })}
                  {m.status === 'working' ? tr({ ko: ' · 진행 중', en: ' · running' }) : m.status === 'done' ? '' : m.status === 'stopped' ? tr({ ko: ' · 멈춤', en: ' · stopped' }) : tr({ ko: ' · 오류', en: ' · error' })}
                </span>
              </div>
              <div className="row">
                <button className="btn small" title={tr({ ko: '팀을 다시 부르지 않고 미션을 다시 재생해요. 촬영할 때 딱이에요.', en: 'Replays the mission (without running the team again): perfect for filming' })} onClick={() => { sfx('click'); close(); send({ t: 'replay', missionId: m.id }); }}>▶ {tr({ ko: '다시 보기', en: 'Replay' })}</button>
                <button className="btn small ghost" onClick={() => send({ t: 'open', missionId: m.id })}>{tr({ ko: '폴더', en: 'Folder' })}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const SONNET = tr({ ko: 'Sonnet (빠름, 추천)', en: 'Sonnet (fast, recommended)' });
const OPUS = tr({ ko: 'Opus (가장 똑똑함)', en: 'Opus (the sharpest)' });
const CHEF_MODELS: [string, string][] = [['sonnet', SONNET], ['opus', OPUS], ['fable', 'Fable'], ['haiku', tr({ ko: 'Haiku (번개처럼 빠름)', en: 'Haiku (lightning fast)' })], ['', tr({ ko: 'Claude Code 기본 모델', en: 'Claude Code’s default model' })]];
const TEAM_MODELS: [string, string][] = [['sonnet', SONNET], ['haiku', tr({ ko: 'Haiku (번개처럼 빠름, 절약형)', en: 'Haiku (lightning fast, thrifty)' })], ['opus', OPUS], ['fable', 'Fable'], ['inherit', tr({ ko: 'Max와 같은 모델', en: 'Same as Max' })]];

export function SettingsPanel() {
  const open = useOffice((s) => s.settingsOpen);
  const settings = useOffice((s) => s.settings);
  const send = useOffice((s) => s.send);
  const claude = useOffice((s) => s.claude);
  const dir = useOffice((s) => s.dir);
  const voiceOn = useOffice((s) => s.voiceOn);
  const cameraAuto = useOffice((s) => s.cameraAuto);
  if (!open) return null;
  const close = () => useOffice.setState({ settingsOpen: false });
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><b>{tr({ ko: '사무실 설정', en: 'Office settings' })}</b><button className="close" onClick={close} aria-label={tr({ ko: '닫기', en: 'Close' })}>×</button></div>
        <div className="modal-body">
          <label className="field">
            <span>{tr({ ko: '언어', en: 'Language' })}</span>
            <select value={getLang()} onChange={(e) => switchLang(e.target.value as 'ko' | 'en')}>
              {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{tr({ ko: 'Max(팀장)의 두뇌', en: 'Max’s brain (the boss)' })}</span>
            <select value={settings.chefModel} onChange={(e) => send({ t: 'settings', settings: { chefModel: e.target.value } })}>
              {CHEF_MODELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{tr({ ko: '팀의 두뇌', en: 'The team’s brain' })}</span>
            <select value={settings.teamModel} onChange={(e) => send({ t: 'settings', settings: { teamModel: e.target.value } })}>
              {TEAM_MODELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <div className="field">
            <span>{tr({ ko: '권한', en: 'Permissions' })}</span>
            <label className="radio"><input type="radio" checked={settings.permission === 'auto'} onChange={() => send({ t: 'settings', settings: { permission: 'auto' } })} /> {tr({ ko: '팀이 알아서 하고, 위험한 일만 손을 들어 물어봐요', en: 'The team decides on its own, and raises a hand for risky moves' })}</label>
            <label className="radio"><input type="radio" checked={settings.permission === 'ask'} onChange={() => send({ t: 'settings', settings: { permission: 'ask' } })} /> {tr({ ko: '명령을 실행할 때마다 물어봐요', en: 'It asks before every command' })}</label>
          </div>
          <SkinPicker />
          <div className="field">
            <span>{tr({ ko: '보는 재미', en: 'The show' })}</span>
            <label className="radio"><input type="checkbox" checked={voiceOn} onChange={(e) => { useOffice.setState({ voiceOn: e.target.checked }); savePref('voice', e.target.checked); applySound(useOffice.getState().sound); }} /> {tr({ ko: 'Max의 목소리 (음성 파일이 설치된 경우)', en: 'Max’s voice (if voice files are installed)' })}</label>
            <label className="radio"><input type="checkbox" checked={cameraAuto} onChange={(e) => { useOffice.setState({ cameraAuto: e.target.checked }); savePref('cameraAuto', e.target.checked); }} /> {tr({ ko: '촬영 모드에서 카메라가 알아서 움직임을 따라가요', en: 'In filming mode, the camera follows the action on its own' })}</label>
          </div>
          <p className="small muted">{tr({ ko: '설정은 다음 미션부터 적용돼요. 팀은 미션 폴더 안에서만 일하고, 사무실 밖에서는 묻지 않고 아무것도 실행하지 않아요.', en: 'Settings apply from the next mission. The team only works inside the mission folder, and never runs anything outside the office without asking you.' })}</p>
          {claude?.found && <p className="small muted">Claude Code {claude.version} · {tilde(dir)}</p>}
          <div className="keys">
            <b>{tr({ ko: '단축키', en: 'Shortcuts' })}</b>
            <span><kbd>V</kbd> {tr({ ko: '세로 화면 (릴스)', en: 'vertical frame (reel)' })}</span>
            <span><kbd>F</kbd> {tr({ ko: '촬영 모드', en: 'filming mode' })}</span>
            <span><kbd>C</kbd> {tr({ ko: '자동 카메라', en: 'auto camera' })}</span>
            <span><kbd>T</kbd> {tr({ ko: '둘러보기', en: 'guided tour' })}</span>
            <span><kbd>J</kbd> {tr({ ko: '주크박스', en: 'jukebox' })}</span>
            <span><kbd>N</kbd> {tr({ ko: '낮, 저녁, 밤', en: 'day, evening, night' })}</span>
            <span><kbd>M</kbd> {tr({ ko: '소리', en: 'sound' })}</span>
            <span><kbd>H</kbd> {tr({ ko: '지난 미션', en: 'past missions' })}</span>
            <span><kbd>Esc</kbd> {tr({ ko: '닫기, 촬영 모드 끝내기', en: 'close, exit filming mode' })}</span>
            <span>🥚 {tr({ ko: '비밀 코드가 있어요… (옛날 게임을 떠올려 보세요)', en: 'There’s a secret code… (think old video games)' })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Les métiers, dans l'ordre du bureau.
const SKIN_ROLES: Role[] = ['chef', 'recherche', 'code', 'design', 'redaction', 'analyse', 'renfort'];

/** Le personnage de chaque métier : le robot, ou un skin du dossier skins/. */
function SkinPicker() {
  const skins = useOffice((s) => s.skins);
  const chosen = useOffice(useShallow((s) => s.settings.skins ?? {}));
  const send = useOffice((s) => s.send);
  const packs = useMemo(() => {
    const m = new Map<string, SkinInfo[]>();
    for (const sk of skins) m.set(sk.pack, [...(m.get(sk.pack) ?? []), sk]);
    return [...m.entries()];
  }, [skins]);
  const pick = (role: Role, id: string) => send({ t: 'settings', settings: { skins: { [role]: id } } });
  return (
    <div className="field">
      <span>{tr({ ko: '캐릭터', en: 'Characters' })}</span>
      {skins.length === 0 ? (
        <p className="small muted">
          {getLang() === 'ko' ? (
            <>
              스킨 폴더에 캐릭터 이미지(PNG)나 zip을 넣으면 여기서 고를 수 있어요. 파일 이름이 캐릭터 이름이 돼요.
              앞모습만 있어도 되고, <code>이름.back.png</code>, <code>이름.side.png</code>가 있으면 같이 써요.
            </>
          ) : (
            <>
              Drop character images (PNG) or a zip into the skins folder and pick them here. The file name becomes the character’s name.
              A front view is enough; if there’s a <code>name.back.png</code> or <code>name.side.png</code>, it’s used too.
            </>
          )}
        </p>
      ) : (
        <div className="skin-grid">
          {SKIN_ROLES.map((role) => (
            <label key={role} className="skin-row">
              <Avatar role={role} size={30} />
              <b>{ROLES[role].label}{role === 'chef' ? ' (Max)' : ''}</b>
              <select value={chosen[role] ?? ''} onChange={(e) => pick(role, e.target.value)}>
                <option value="">{tr({ ko: '기본 로봇', en: 'Default robot' })}</option>
                {packs.map(([pack, list]) => (
                  <optgroup key={pack} label={pack || tr({ ko: '내 캐릭터', en: 'My characters' })}>
                    {list.map((sk) => <option key={sk.id} value={sk.id}>{sk.name}</option>)}
                  </optgroup>
                ))}
                {chosen[role] && !skins.some((sk) => sk.id === chosen[role]) && <option value={chosen[role]}>{tr({ ko: '(없어진 캐릭터)', en: '(missing character)' })}</option>}
              </select>
            </label>
          ))}
        </div>
      )}
      <button className="btn ghost small" onClick={() => send({ t: 'open_skins' })}>{tr({ ko: '스킨 폴더 열기', en: 'Open the skins folder' })}</button>
    </div>
  );
}

export function Toasts() {
  const toasts = useOffice((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
    </div>
  );
}
