// Les métiers du bureau, et la traduction en français de ce que fait vraiment chaque agent :
// chaque outil de Claude Code devient une action (une icône, une animation, une bulle).
import type { ActKind, MissionStats, OfficeEvent, Role } from './protocol.ts';
import { getLang, tr, type Text } from './i18n.ts';

export interface RoleInfo {
  /** le nom du métier, tel qu'il s'affiche dans le bureau */
  label: string;
  icon: string;
  color: string;
  /** l'agent Claude Code (subagent_type) qui fait ce métier */
  type: string;
  what: string;
}

/** label et what sont lus au moment voulu (le serveur suit la langue des réglages). */
const role = (label: Text, icon: string, color: string, type: string, what: Text): RoleInfo => ({
  get label() { return tr(label); }, icon, color, type, get what() { return tr(what); },
});

export const ROLES: Record<Role, RoleInfo> = {
  chef: role({ ko: '팀장', en: 'Team lead' }, '⭐', '#FF8A3D', '', { ko: '요청을 받아 계획을 세우고, 일을 나누고, 결과물을 하나로 모아요.', en: 'Takes your request, makes the plan, splits the work and puts the result together.' }),
  recherche: role({ ko: '리서치', en: 'Research' }, '🔎', '#4FB3FF', 'chercheur', { ko: '인터넷에서 찾아요: 경쟁사, 가격, 후기, 뉴스, 출처.', en: 'Searches the web: competitors, prices, reviews, news, sources.' }),
  code: role({ ko: '개발', en: 'Code' }, '💻', '#3DDC97', 'developpeur', { ko: '코드, 웹사이트, 스크립트, 자동화: 실행하고 테스트할 수 있는 것.', en: 'Code, websites, scripts, automations: things you can run and test.' }),
  design: role({ ko: '디자인', en: 'Design' }, '🎨', '#FF6FA8', 'designer', { ko: '보기 좋은 웹페이지, 시안, 비주얼, 레이아웃.', en: 'Polished web pages, mockups, visuals, layout.' }),
  redaction: role({ ko: '글쓰기', en: 'Writing' }, '✍️', '#A98BFF', 'redacteur', { ko: '게시글, 이메일, 기사, 영상 대본, 보고서.', en: 'Posts, emails, articles, video scripts, reports.' }),
  analyse: role({ ko: '분석', en: 'Analysis' }, '📊', '#FFC93D', 'analyste', { ko: '숫자, 표, 파일, 비교, 계산.', en: 'Numbers, tables, files, comparisons, calculations.' }),
  renfort: role({ ko: '지원', en: 'Helper' }, '🤖', '#9AA3B5', '', { ko: '따로 떨어진 일을 도와줘요.', en: 'Lends a hand on a side task.' }),
};

/** Les outils Claude Code de chaque métier (le chef a tous ceux de la séance). */
export const ROLE_TOOLS: Record<Role, string[]> = {
  chef: ['Agent', 'TodoWrite', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Bash'],
  recherche: ['WebSearch', 'WebFetch', 'Read', 'Glob', 'Grep'],
  code: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebFetch'],
  design: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch'],
  redaction: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
  analyse: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
  renfort: [],
};

/** Ce que veut dire chaque outil, en français (pour la fiche des métiers). */
export const TOOL_INFO: Record<string, string> = {
  Agent: tr({ ko: '팀원을 불러요', en: 'calls a teammate' }), TodoWrite: tr({ ko: '계획을 쓰고 체크해요', en: 'writes and checks off the plan' }),
  Read: tr({ ko: '파일을 읽어요', en: 'reads a file' }), Write: tr({ ko: '파일을 만들어요', en: 'creates a file' }),
  Edit: tr({ ko: '파일을 고쳐요', en: 'edits a file' }), Glob: tr({ ko: '파일을 찾아요', en: 'finds files' }),
  Grep: tr({ ko: '파일 안을 검색해요', en: 'searches inside files' }), WebSearch: tr({ ko: '인터넷을 검색해요', en: 'searches the web' }),
  WebFetch: tr({ ko: '웹페이지를 읽어요', en: 'reads a web page' }), Bash: tr({ ko: '명령을 실행해요', en: 'runs a command' }),
};

/** Le métier d'un agent, d'après le type d'agent que le chef a appelé. */
export function roleOfType(type: string): Role {
  for (const [role, info] of Object.entries(ROLES) as [Role, RoleInfo][]) if (info.type && info.type === type) return role;
  return 'renfort';
}

/** Les prénoms des robots, par métier (jamais deux fois le même dans une mission). */
const NAME_LISTS: Record<Role, Record<'ko' | 'en', string[]>> = {
  chef: { ko: ['Max'], en: ['Max'] },
  recherche: {
    ko: ['지우', '하준', '서연', '도윤', '하린', '시우', '유나', '준서', '예린', '민준', '수아', '태오'],
    en: ['Iris', 'Hugo', 'Leah', 'Milo', 'Zoe', 'Noah', 'Ines', 'Tom', 'Jade', 'Sasha', 'Lou', 'Nils'],
  },
  code: { ko: ['현우', '지민', '은호', '소율', '건우', '다인'], en: ['Ada', 'Linus', 'Grace', 'Alan', 'Margaret', 'Dennis'] },
  design: { ko: ['채원', '로아', '이안', '나은', '해솔'], en: ['Frida', 'Coco', 'Andy', 'Sonia', 'Saul'] },
  redaction: { ko: ['윤서', '주원', '다온', '서진', '하율'], en: ['Maya', 'Victor', 'Jane', 'Mark', 'George'] },
  analyse: { ko: ['민서', '지호', '수빈', '연우', '가온'], en: ['Marie', 'Isaac', 'Emily', 'Carl', 'Florence'] },
  renfort: { ko: ['보미', '두리', '콩이', '마루', '별이', '토리'], en: ['Bob', 'Lulu', 'Gus', 'Nina', 'Momo', 'Kiki'] },
};
export const NAMES = {} as Record<Role, string[]>;
for (const r of Object.keys(NAME_LISTS) as Role[]) {
  Object.defineProperty(NAMES, r, { enumerable: true, get: () => NAME_LISTS[r][getLang()] ?? NAME_LISTS[r].en });
}

const base = (p: unknown) => (typeof p === 'string' ? p.split(/[\\/]/).filter(Boolean).pop() ?? p : '');
export const cut = (s: unknown, n = 60) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};
export const host = (u: unknown) => {
  try { return new URL(String(u)).hostname.replace(/^www\./, ''); } catch { return cut(u, 40); }
};

const MCP_NAMES: Record<string, string> = {
  gmail: 'Gmail', google_drive: 'Google Drive', notion: 'Notion', google_calendar: 'Google Calendar', calendar: 'Google Calendar',
  slack: 'Slack', github: 'GitHub', stripe: 'Stripe', hubspot: 'HubSpot', airtable: 'Airtable',
};

/** Le nom lisible d'un connecteur MCP : mcp__claude_ai_Gmail__search_threads → Gmail */
export function mcpName(tool: string): { server: string; action: string } {
  const parts = tool.split('__');
  const raw = (parts[1] ?? '').replace(/^claude_ai_/, '').replace(/^plugin_[^_]+_/, '');
  const server = MCP_NAMES[raw.toLowerCase()] ?? raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { server, action: (parts[2] ?? '').replace(/[_-]+/g, ' ') };
}

/** L'action, sa phrase (courte, pour la bulle) et le détail complet (pour le panneau). */
export function describeAct(tool: string, input: Record<string, unknown> | undefined): { kind: ActKind; label: string; detail: string } {
  const i = input ?? {};
  switch (tool) {
    case 'WebSearch': return { kind: 'search', label: tr({ ko: `“${cut(i.query, 44)}” 찾는 중이에요`, en: `Searching “${cut(i.query, 44)}”` }), detail: String(i.query ?? '') };
    case 'WebFetch': return { kind: 'web', label: tr({ ko: `${host(i.url)} 읽는 중이에요`, en: `Reading ${host(i.url)}` }), detail: String(i.url ?? '') };
    case 'Read': return { kind: 'read', label: tr({ ko: `${cut(base(i.file_path), 36)} 읽는 중이에요`, en: `Reading ${cut(base(i.file_path), 36)}` }), detail: String(i.file_path ?? '') };
    case 'Glob': return { kind: 'read', label: tr({ ko: '폴더를 뒤져보는 중이에요', en: 'Digging through the folder' }), detail: String(i.pattern ?? '') };
    case 'Grep': return { kind: 'read', label: tr({ ko: `“${cut(i.pattern, 30)}” 찾는 중이에요`, en: `Searching for “${cut(i.pattern, 30)}”` }), detail: `${i.pattern ?? ''}${i.path ? tr({ ko: ' · 위치: ', en: ' in ' }) + i.path : ''}` };
    case 'LS': return { kind: 'read', label: tr({ ko: '폴더를 살펴보는 중이에요', en: 'Looking at the folder' }), detail: String(i.path ?? '') };
    case 'Write': return { kind: 'write', label: tr({ ko: `${cut(base(i.file_path), 36)} 쓰는 중이에요`, en: `Writing ${cut(base(i.file_path), 36)}` }), detail: String(i.file_path ?? '') };
    case 'Edit':
    case 'MultiEdit': return { kind: 'edit', label: tr({ ko: `${cut(base(i.file_path), 34)} 고치는 중이에요`, en: `Tweaking ${cut(base(i.file_path), 34)}` }), detail: String(i.file_path ?? '') };
    case 'NotebookEdit': return { kind: 'edit', label: tr({ ko: `${cut(base(i.notebook_path), 34)} 고치는 중이에요`, en: `Tweaking ${cut(base(i.notebook_path), 34)}` }), detail: String(i.notebook_path ?? '') };
    case 'Bash': {
      const c = String(i.command ?? '').replace(/\s+/g, ' ').trim();
      const what = c.length <= 34 ? `“${c}”` : cut(i.description || c, 40);
      return { kind: 'bash', label: tr({ ko: `${what} 실행 중이에요`, en: `Running ${what}` }), detail: String(i.command ?? '') };
    }
    case 'TodoWrite': return { kind: 'plan', label: tr({ ko: '계획을 업데이트하는 중이에요', en: 'Updating the plan' }), detail: '' };
    case 'Skill': return { kind: 'skill', label: tr({ ko: `${cut(i.skill ?? i.name, 24)} 방법을 쓰는 중이에요`, en: `Using the ${cut(i.skill ?? i.name, 24)} method` }), detail: String(i.args ?? '') };
    case 'ToolSearch': return { kind: 'other', label: tr({ ko: '알맞은 도구를 찾는 중이에요', en: 'Looking for the right tool' }), detail: String(i.query ?? '') };
  }
  if (tool.startsWith('mcp__')) {
    const { server, action } = mcpName(tool);
    return { kind: 'mcp', label: tr({ ko: `${server} 쓰는 중이에요`, en: `Going through ${server}` }), detail: action };
  }
  return { kind: 'other', label: tr({ ko: `${tool} 쓰는 중이에요`, en: `Using ${tool}` }), detail: '' };
}

export const emptyStats = (): MissionStats => ({ agents: 0, searches: 0, pages: 0, reads: 0, writes: 0, commands: 0 });

/** Les compteurs de la mission (recherches, pages lues…), mis à jour événement par événement. */
export function countStats(s: MissionStats, ev: OfficeEvent) {
  if (ev.k === 'hire') s.agents++;
  if (ev.k !== 'act') return;
  if (ev.kind === 'search') s.searches++;
  else if (ev.kind === 'web') s.pages++;
  else if (ev.kind === 'read') s.reads++;
  else if (ev.kind === 'write' || ev.kind === 'edit') s.writes++;
  else if (ev.kind === 'bash') s.commands++;
}

/** Remplace le chemin du dossier de la mission par « . » partout où il apparaît en entier. */
export function relToFolder(text: string, folder: string): string {
  if (!folder) return text;
  const esc = folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(esc + '(?=$|[/"\'\\s])', 'g'), '.').replace(/(^|[\s"'])\.\//g, '$1');
}

/** La commande telle qu'elle sera lancée, juste rendue lisible (le dossier de la mission devient « . »). Rien n'est caché. */
export function readableCommand(cmd: unknown, folder: string): string {
  return relToFolder(String(cmd ?? ''), folder).trim().replace(/^cd\s+(?:"\."|'\.'|\.)\s*&&\s*/, '');
}

const FULL_MAX = 72;

/**
 * La demande de permission : la phrase de la bulle, le détail complet, et `full`
 * (vrai seulement si la bulle montre toute l'action : on peut alors répondre directement dans la bulle).
 */
export function permissionText(tool: string, input: Record<string, unknown> | undefined, folder: string): { label: string; detail: string; full: boolean } {
  const i = input ?? {};
  if (tool === 'Bash') {
    const c = readableCommand(i.command, folder);
    const full = c.length > 0 && c.length <= FULL_MAX && !c.includes('\n');
    const shown = full ? c : cut(c, 48);
    return { label: tr({ ko: `“${shown}” 실행해도 될까요?`, en: `Can I run “${shown}”?` }), detail: c, full };
  }
  if (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
    const raw = String(i.file_path ?? i.notebook_path ?? '');
    const rel = relToFolder(raw, folder);
    const inside = !!folder && raw.startsWith(folder + '/') && !rel.includes('..');
    const p = inside ? rel : raw;
    const label = tool === 'Write' ? tr({ ko: `${p} 작성해도 될까요?`, en: `Can I write ${p}?` }) : tr({ ko: `${p} 수정해도 될까요?`, en: `Can I edit ${p}?` });
    return { label, detail: raw, full: inside && rel.length <= FULL_MAX };
  }
  if (tool === 'WebFetch') return { label: tr({ ko: `${host(i.url)} 읽어도 될까요?`, en: `Can I read ${host(i.url)}?` }), detail: String(i.url ?? ''), full: false };
  const detail = relToFolder(JSON.stringify(i, null, 2), folder);
  const clipped = detail.length > 1500 ? detail.slice(0, 1499) + '…' : detail;
  if (tool.startsWith('mcp__')) {
    const { server, action } = mcpName(tool);
    return { label: tr({ ko: `${server} 써도 될까요? (${action})`, en: `Can I use ${server} (${action})?` }), detail: clipped, full: false };
  }
  return { label: tr({ ko: `${tool} 써도 될까요?`, en: `Can I use ${tool}?` }), detail: clipped, full: false };
}
