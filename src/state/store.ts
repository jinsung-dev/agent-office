// La mémoire du bureau, côté navigateur : la mission en cours, l'équipe, le plan, les rendus, ce que
// dit Max. Chaque événement venu du pont est rangé ici, puis transmis au moteur du jeu (les robots).
import { create } from 'zustand';
import { countStats, emptyStats } from '../../shared/activity.ts';
import type {
  ActKind, ClaudeInfo, ClientMsg, FileInfo, MissionInfo, MissionStats, OfficeEvent, PlanItem, Quota, Role, RoomInfo, ServerMsg, Settings, SkinInfo, TeamEntry, VersionInfo,
} from '../../shared/protocol.ts';
import { sfx } from '../audio/sfx.ts';
import { say } from '../audio/voice.ts';
import { getLang, tr, type Lang } from '../../shared/i18n.ts';
import { clearSprites } from '../engine/robots.ts';
import { applySkins } from '../engine/skins.ts';
import { bus } from './bus.ts';

export interface ActView { id: string; kind: ActKind; label: string; detail: string; at: number; ok?: boolean }

export interface AgentView {
  id: string;
  role: Role;
  name: string;
  task: string;
  prompt: string;
  status: 'working' | 'reporting' | 'done' | 'failed';
  act: ActView | null;
  acts: ActView[];
  say: string;
  sayAt: number;
  report: string;
  hiredAt: number;
  leftAt?: number;
  tokens: number;
  tools: number;
}

export interface ChefView {
  say: string;
  sayAt: number;
  typing: string;
  thinkingAt: number;
  act: ActView | null;
  acts: ActView[];
}

export interface AskView { requestId: string; who: string; tool: string; label: string; detail: string; full: boolean; at: number }

export interface FeedLine { id: number; at: number; who: string; text: string; kind: 'user' | 'chef' | 'hire' | 'act' | 'report' | 'file' | 'ask' | 'end' | 'error' }

export interface Toast { id: number; kind: 'info' | 'error'; text: string }

export type Tod = 'auto' | 'day' | 'evening' | 'night';

/** Les fenêtres qu'on ouvre en cliquant sur le bureau (un robot, le tableau, l'horloge…). */
export type Modal =
  | { kind: 'agent'; id: string }
  | { kind: 'board' }
  | { kind: 'clock' }
  | { kind: 'machine' }
  | { kind: 'jukebox' }
  | { kind: 'team'; role?: Role }
  | { kind: 'files' }
  | { kind: 'preview'; missionId: string; file: string };

interface S {
  connection: 'connecting' | 'live' | 'offline' | 'demo';
  claude: ClaudeInfo | null;
  dir: string;
  settings: Settings;
  /** les personnages trouvés dans le dossier skins/ */
  skins: SkinInfo[];
  /** change quand les sprites des skins sont prêts (pour redessiner les avatars) */
  skinsVer: number;
  /** mode Orca : les espaces de travail d'Orca, et celui qu'on regarde (null = son propre bureau) */
  orca: boolean;
  rooms: RoomInfo[];
  room: string | null;
  openRoom: (id: string | null) => void;
  quota: Quota | null;
  missions: MissionInfo[];
  mission: MissionInfo | null;
  /** vrai pendant une rediffusion (ou la démo) */
  replaying: boolean;
  chef: ChefView;
  agents: Record<string, AgentView>;
  order: string[];
  plan: PlanItem[];
  files: FileInfo[];
  asks: Record<string, AskView>;
  stats: MissionStats;
  feed: FeedLine[];
  final: { ok: boolean; text: string; ms: number; stopped?: boolean; at: number } | null;
  /** quand l'équipe s'est mise au travail (pour le chrono) ; null = au repos */
  busySince: number | null;
  workMs: number;
  // l'interface
  showFinal: boolean;
  viewer: { missionId: string; file: string; text?: string; truncated?: boolean; version?: string } | null;
  modal: Modal | null;
  /** les versions de chaque rendu (clé : mission|fichier) */
  versions: Record<string, VersionInfo[]>;
  teamHistory: TeamEntry[] | null;
  /** chaque version du plan, dans l'ordre (le tableau garde l'historique) */
  planHistory: { at: number; items: PlanItem[] }[];
  music: { playing: boolean; index: number; volume: number };
  /** la voix de Max (fichiers de public/voice/<langue>/, s'ils sont là) */
  voiceOn: boolean;
  /** en mode tournage, la caméra suit l'action toute seule */
  cameraAuto: boolean;
  /** la visite guidée en cours (le texte que Max dit) */
  tour: { step: number; text: string } | null;
  historyOpen: boolean;
  settingsOpen: boolean;
  vertical: boolean;
  /** écran en hauteur (téléphone) : même mise en page que le cadre vertical */
  portrait: boolean;
  filming: boolean;
  sound: boolean;
  tod: Tod;
  draft: string;
  toasts: Toast[];
  send: (m: ClientMsg) => void;
  receive: (m: ServerMsg) => void;
  apply: (ev: OfficeEvent, at: number, live: boolean) => void;
  resetMission: (m: MissionInfo | null) => void;
  toast: (kind: Toast['kind'], text: string) => void;
}

const pref = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem('bureau:' + key); return v === null ? fallback : (JSON.parse(v) as T); } catch { return fallback; }
};
export const savePref = (key: string, v: unknown) => { try { localStorage.setItem('bureau:' + key, JSON.stringify(v)); } catch { /* navigation privée */ } };

const emptyChef = (): ChefView => ({ say: '', sayAt: 0, typing: '', thinkingAt: 0, act: null, acts: [] });

let feedId = 0;
let toastId = 0;
let lastActSound = 0;
const MAX_ACTS = 80;
const MAX_FEED = 160;

export const useOffice = create<S>((set, get) => ({
  connection: 'connecting',
  claude: null,
  dir: '',
  settings: { chefModel: 'sonnet', teamModel: 'sonnet', permission: 'auto', skins: {} },
  skins: [],
  skinsVer: 0,
  orca: false,
  rooms: [],
  room: null,
  openRoom: (id) => {
    if (get().replaying) return;
    set({ room: id });
    get().send({ t: 'room', id });
  },
  quota: null,
  missions: [],
  mission: null,
  replaying: false,
  chef: emptyChef(),
  agents: {},
  order: [],
  plan: [],
  files: [],
  asks: {},
  stats: emptyStats(),
  feed: [],
  final: null,
  busySince: null,
  workMs: 0,
  showFinal: false,
  viewer: null,
  modal: null,
  versions: {},
  teamHistory: null,
  planHistory: [],
  music: { playing: false, index: 0, volume: 0.55 },
  voiceOn: pref('voice', true),
  cameraAuto: pref('cameraAuto', true),
  tour: null,
  historyOpen: false,
  settingsOpen: false,
  vertical: pref('vertical', false),
  portrait: typeof window !== 'undefined' && window.innerWidth / Math.max(1, window.innerHeight) < 0.8,
  filming: false,
  sound: pref('sound', true),
  tod: pref<Tod>('tod', 'auto'),
  draft: '',
  toasts: [],
  send: () => {},

  toast: (kind, text) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, kind, text }].slice(-4) }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 7000 : 4500);
  },

  resetMission: (m) => {
    set({
      mission: m, chef: emptyChef(), agents: {}, order: [], plan: [], files: [], asks: {}, stats: emptyStats(),
      feed: [], final: null, busySince: null, workMs: 0, showFinal: false, planHistory: [],
    });
    bus.reset();
  },

  receive: (m) => {
    const s = get();
    switch (m.t) {
      case 'hello': {
        set({ claude: m.claude, dir: m.dir, settings: m.settings, quota: m.quota, missions: m.missions, skins: m.skins ?? [], orca: !!m.orca, rooms: m.rooms ?? [] });
        refreshSkins();
        // la première fois, le bureau prend la langue du navigateur ; ensuite, celle des réglages
        if (!m.settings.lang) get().send({ t: 'settings', settings: { lang: getLang() } });
        else if (m.settings.lang !== getLang()) { switchLang(m.settings.lang); return; }
        if (s.replaying) break;
        // après une reconnexion, on retourne dans la pièce qu'on regardait
        if (m.orca && s.room) { get().send({ t: 'room', id: s.room }); break; }
        if (!m.orca && s.room) set({ room: null });
        if (m.current) {
          get().resetMission(m.current.mission);
          for (const l of m.current.log) get().apply(l.ev, l.at, false);
          set({ mission: m.current.mission });
        } else get().resetMission(null);
        break;
      }
      case 'mission': {
        const list = [m.mission, ...s.missions.filter((x) => x.id !== m.mission.id)].sort((a, b) => b.createdAt - a.createdAt);
        set({ missions: list });
        if (s.replaying) break;
        if (s.mission?.id === m.mission.id) set({ mission: m.mission });
        else if (m.mission.status === 'working' && (!s.mission || s.mission.id !== m.mission.id)) get().resetMission(m.mission);
        break;
      }
      case 'ev':
        if (s.replaying || s.mission?.id !== m.missionId) break;
        get().apply(m.ev, m.at, true);
        break;
      case 'closed':
        if (!s.replaying && s.mission?.id === m.missionId) get().resetMission(null);
        break;
      case 'file_text':
        if (s.viewer && s.viewer.file === m.file) set({ viewer: { ...s.viewer, text: m.text, truncated: m.truncated, version: m.version } });
        break;
      case 'versions':
        set({ versions: { ...s.versions, [`${m.missionId}|${m.file}`]: m.list } });
        break;
      case 'team_history':
        set({ teamHistory: m.entries });
        break;
      case 'quota':
        set({ quota: m.quota });
        break;
      case 'settings':
        set({ settings: m.settings });
        refreshSkins();
        if (m.settings.lang && m.settings.lang !== getLang()) switchLang(m.settings.lang);
        break;
      case 'skins':
        set({ skins: m.list });
        refreshSkins();
        break;
      case 'rooms':
        set({ rooms: m.list });
        break;
      case 'room_open': {
        if (s.replaying || m.room !== s.room) break;
        get().resetMission(m.mission);
        for (const l of m.log) get().apply(l.ev, l.at, false);
        set({ mission: m.mission });
        break;
      }
      case 'toast':
        get().toast(m.kind, m.text);
        break;
      case 'replay':
        // géré par le lecteur (net/replay.ts)
        break;
    }
  },

  apply: (ev, at, live) => {
    const s = get();
    const feed = (who: string, text: string, kind: FeedLine['kind']) => {
      const line: FeedLine = { id: ++feedId, at, who, text, kind };
      return [...get().feed, line].slice(-MAX_FEED);
    };
    const agentName = (who: string) => (who === 'chef' ? 'Max' : s.agents[who]?.name ?? tr({ ko: '에이전트', en: 'An agent' }));
    switch (ev.k) {
      case 'start': {
        const first = s.feed.length === 0;
        set({
          chef: { ...s.chef, say: '', typing: '', thinkingAt: at }, final: null, showFinal: false,
          busySince: at, feed: feed(tr({ ko: '나', en: 'you' }), ev.text, 'user'),
        });
        if (live && !first) sfx('send');
        if (live) void say('parti');
        break;
      }
      case 'init':
        break;
      case 'think':
        if (ev.who === 'chef') set({ chef: { ...s.chef, thinkingAt: at } });
        break;
      case 'typing':
        if (ev.who === 'chef') set({ chef: { ...s.chef, typing: ev.text } });
        else if (s.agents[ev.who]) set({ agents: { ...s.agents, [ev.who]: { ...s.agents[ev.who], say: ev.text, sayAt: at } } });
        break;
      case 'say':
        if (ev.who === 'chef') set({ chef: { ...s.chef, say: ev.text, sayAt: at, typing: '' }, feed: feed('Max', ev.text, 'chef') });
        else if (s.agents[ev.who]) set({ agents: { ...s.agents, [ev.who]: { ...s.agents[ev.who], say: ev.text, sayAt: at } } });
        break;
      case 'plan':
        set({ plan: ev.items, planHistory: [...s.planHistory, { at, items: ev.items }].slice(-60) });
        if (live && s.plan.length !== ev.items.length) sfx('plan');
        else if (live && ev.items.filter((i) => i.status === 'completed').length > s.plan.filter((i) => i.status === 'completed').length) sfx('check');
        break;
      case 'hire': {
        const a: AgentView = {
          id: ev.id, role: ev.role, name: ev.name, task: ev.task, prompt: ev.prompt, status: 'working', act: null, acts: [],
          say: '', sayAt: 0, report: '', hiredAt: at, tokens: 0, tools: 0,
        };
        const stats = { ...s.stats };
        countStats(stats, ev);
        const firstOfRound = !s.order.some((id) => s.agents[id]?.status === 'working' || s.agents[id]?.status === 'reporting');
        set({ agents: { ...s.agents, [ev.id]: a }, order: [...s.order, ev.id], stats, feed: feed('Max', tr({ ko: `${ev.name} 호출: ${ev.task}`, en: `calls in ${ev.name}: ${ev.task}` }), 'hire') });
        if (live) sfx('spawn');
        if (live && firstOfRound) void say('equipe');
        break;
      }
      case 'act': {
        const act: ActView = { id: ev.id, kind: ev.kind, label: ev.label, detail: ev.detail, at };
        const stats = { ...s.stats };
        countStats(stats, ev);
        if (ev.who === 'chef') set({ chef: { ...s.chef, act, acts: [...s.chef.acts, act].slice(-MAX_ACTS) }, stats });
        else if (s.agents[ev.who]) {
          const a = s.agents[ev.who];
          set({ agents: { ...s.agents, [ev.who]: { ...a, act, acts: [...a.acts, act].slice(-MAX_ACTS) } }, stats });
        } else set({ stats });
        if (ev.kind !== 'plan') set({ feed: feed(agentName(ev.who), ev.label, 'act') });
        if (live && Date.now() - lastActSound > 220) { lastActSound = Date.now(); sfx(ev.kind === 'search' || ev.kind === 'web' ? 'search' : 'tick'); }
        break;
      }
      case 'act_done': {
        const mark = (acts: ActView[]) => acts.map((x) => (x.id === ev.id ? { ...x, ok: ev.ok } : x));
        if (ev.who === 'chef') set({ chef: { ...s.chef, acts: mark(s.chef.acts) } });
        else if (s.agents[ev.who]) set({ agents: { ...s.agents, [ev.who]: { ...s.agents[ev.who], acts: mark(s.agents[ev.who].acts) } } });
        break;
      }
      case 'report': {
        const a = s.agents[ev.who];
        if (!a) break;
        set({ agents: { ...s.agents, [ev.who]: { ...a, report: ev.text, status: 'reporting' } }, feed: feed(a.name, tr({ ko: 'Max에게 보고서를 냈어요', en: 'hands the report to Max' }), 'report') });
        if (live) sfx('paper');
        break;
      }
      case 'leave': {
        const a = s.agents[ev.who];
        if (!a) break;
        set({ agents: { ...s.agents, [ev.who]: { ...a, status: ev.ok ? 'done' : 'failed', leftAt: at, tokens: ev.tokens, tools: ev.tools } } });
        break;
      }
      case 'file': {
        const files = [...s.files.filter((f) => f.path !== ev.file.path), ev.file].sort((a, b) => a.at - b.at);
        set({ files, feed: ev.isNew ? feed(agentName(ev.file.by), tr({ ko: `${ev.file.name} 파일을 저장했어요`, en: `saved ${ev.file.name}` }), 'file') : get().feed });
        if (live && ev.isNew) sfx('print');
        break;
      }
      case 'ask': {
        const ask: AskView = { requestId: ev.requestId, who: ev.who, tool: ev.tool, label: ev.label, detail: ev.detail, full: ev.full, at };
        set({ asks: { ...s.asks, [ev.requestId]: ask }, feed: feed(agentName(ev.who), ev.label, 'ask') });
        if (live) { sfx('ask'); void say('feu-vert', true); }
        break;
      }
      case 'ask_done': {
        const asks = { ...s.asks };
        delete asks[ev.requestId];
        set({ asks });
        break;
      }
      case 'end': {
        const workMs = s.workMs + (s.busySince ? Math.max(0, at - s.busySince) : 0);
        set({
          final: { ok: ev.ok, text: ev.text, ms: ev.ms, stopped: ev.stopped, at }, busySince: null, workMs, asks: {},
          showFinal: false, feed: feed('Max', ev.ok ? tr({ ko: '미션 완료!', en: 'Mission accomplished!' }) : ev.stopped ? tr({ ko: '미션을 멈췄어요.', en: 'Mission stopped.' }) : tr({ ko: '미션이 제대로 끝나지 않았어요.', en: 'The mission didn’t end well.' }), 'end'),
        });
        if (live) sfx(ev.ok ? 'done' : 'error');
        if (live && ev.ok) setTimeout(() => { void say('accomplie', true); }, 900);
        // d'abord Max fait la fête (confettis), puis la carte du rendu s'ouvre
        if (live && ev.ok) setTimeout(() => { if (get().final?.at === at) set({ showFinal: true }); }, 3200);
        break;
      }
      case 'error':
        set({ feed: feed('Max', ev.message, 'error') });
        if (live) get().toast('error', ev.message);
        break;
    }
    bus.emit(ev, live);
  },
}));

/** Les membres de l'équipe, dans l'ordre où ils sont arrivés. */
export const teamList = (s: S) => s.order.map((id) => s.agents[id]).filter(Boolean);

/** Charge les skins choisis ; quand ils sont prêts, les robots sont redessinés. */
function refreshSkins() {
  const { skins, settings } = useOffice.getState();
  applySkins(skins, settings.skins ?? {}, () => {
    clearSprites();
    useOffice.setState((s) => ({ skinsVer: s.skinsVer + 1 }));
  });
}

/** Change la langue : elle est enregistrée, puis la page se recharge (tous les textes sont refaits). */
export function switchLang(lang: Lang) {
  savePref('lang', lang);
  useOffice.getState().send({ t: 'settings', settings: { lang } });
  setTimeout(() => location.reload(), 150);
}
