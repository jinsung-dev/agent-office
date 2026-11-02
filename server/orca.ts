// Orca mode (--orca): every Orca workspace becomes a room of the office.
// - The room list comes from `orca worktree ps --json`, polled every 1.5 s.
// - Inside a room, a Claude Code agent is followed through its transcript (~/.claude/projects/…/<session>.jsonl, and
//   <session>/subagents/agent-*.jsonl for its subagents). Lines are fed to the same Normalizer as the office's own missions,
//   so bubbles, hires and reports look the same. Other agents (codex…) only get what Orca reports (current tool, last answer).
// - A message typed in a room is sent to the agent's terminal with `orca terminal send`.
// Orca is always called with execFile and separate arguments (no shell).
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { open, readdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { countStats, describeAct, emptyStats } from '../shared/activity.ts';
import { tr } from '../shared/i18n.ts';
import type { Logged, MissionInfo, OfficeEvent, RoomInfo } from '../shared/protocol.ts';
import { Normalizer } from './claude.ts';

type Json = Record<string, any>;

const POLL_MS = 1500;
const TAIL_MS = 800;
/** how much of a transcript we read when opening a room (the current turn is near the end) */
const WINDOW = 8 * 1024 * 1024;
/** a background helper with no transcript of its own (a separate session) leaves after this */
const DETACHED_MS = 15000;
/** after a new request, how long Orca may still report the previous turn as « done » */
const STALE_MS = 10000;

interface Agent {
  paneKey: string;
  parentPaneKey: string | null;
  state: string;
  agentType: string;
  prompt: string | null;
  lastAssistantMessage: string | null;
  toolName: string | null;
  toolInput: string | null;
  updatedAt: number;
}

interface Worktree { worktreeId: string; path: string; info: RoomInfo; lead: Agent | null }

/** Finds the Orca CLI: on the PATH, or inside the macOS app. */
export async function findOrca(): Promise<string | null> {
  const candidates = ['orca', '/Applications/Orca.app/Contents/Resources/bin/orca'];
  for (const c of candidates) {
    if (c.includes('/') && !existsSync(c)) continue;
    const ok = await new Promise<boolean>((resolve) => execFile(c, ['--version'], { timeout: 5000 }, (e) => resolve(!e)));
    if (ok) return c;
  }
  return null;
}

function orcaJson(bin: string, args: string[]): Promise<Json> {
  return new Promise((resolve, reject) => {
    execFile(bin, [...args, '--json'], { timeout: 10000, maxBuffer: 32 * 1024 * 1024 }, (e, out) => {
      let d: Json | null = null;
      try { d = JSON.parse(String(out)); } catch { /* not JSON */ }
      if (d && d.ok === false) reject(new OrcaError(String(d.error?.code ?? ''), String(d.error?.message ?? 'orca')));
      else if (d) resolve(d.result ?? d);
      else reject(new OrcaError('', e?.message ?? 'orca'));
    });
  });
}

class OrcaError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

const roomId = (worktreeId: string) => createHash('sha1').update(worktreeId).digest('hex').slice(0, 12);

function agentState(s: string): RoomInfo['state'] {
  if (s === 'working') return 'working';
  if (/wait|perm|block|ask|input/i.test(s)) return 'waiting';
  if (s === 'done') return 'done';
  return 'idle';
}

const RANK: Record<RoomInfo['state'], number> = { waiting: 0, working: 1, done: 2, idle: 3 };

/** Every client watching a room, and how to reach it. */
export interface Viewer { send: (m: unknown) => void }

export class OrcaHub {
  rooms: RoomInfo[] = [];
  /** false when the last poll failed (Orca closed) */
  reachable = true;
  private bin: string;
  private worktrees = new Map<string, Worktree>();
  private views = new Map<string, RoomView>();
  private watching = new Map<Viewer, string>();
  private broadcast: (m: unknown) => void;
  private timer: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(bin: string, broadcast: (m: unknown) => void) {
    this.bin = bin;
    this.broadcast = broadcast;
  }

  async start() {
    await this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    for (const v of this.views.values()) v.close();
  }

  private async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      const r = await orcaJson(this.bin, ['worktree', 'ps']);
      this.reachable = true;
      const next = new Map<string, Worktree>();
      for (const w of (r.worktrees ?? []) as Json[]) {
        const agents = ((w.agents ?? []) as Agent[]).filter((a) => a && a.paneKey);
        if (w.isArchived || agents.length === 0) continue;
        const leads = agents.filter((a) => !a.parentPaneKey).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
        const lead = leads[0] ?? agents[0];
        const state = agents.map((a) => agentState(String(a.state ?? ''))).sort((a, b) => RANK[a] - RANK[b])[0];
        const id = roomId(String(w.worktreeId));
        next.set(id, {
          worktreeId: String(w.worktreeId),
          path: String(w.path ?? ''),
          lead,
          info: {
            id, state,
            // Orca names a workspace after its branch by default: the repo says more (unless it was renamed)
            name: String(w.displayName && w.displayName !== String(w.branch ?? '').replace(/^refs\/heads\//, '') ? w.displayName : w.repo || w.displayName || ''),
            repo: String(w.repo ?? ''),
            branch: String(w.branch ?? '').replace(/^refs\/heads\//, ''),
            agent: String(lead?.agentType ?? ''),
            lastActivityAt: Number(w.lastActivityAt ?? 0),
          },
        });
      }
      this.worktrees = next;
      const list = [...next.values()].map((w) => w.info)
        .sort((a, b) => RANK[a.state] - RANK[b.state] || b.lastActivityAt - a.lastActivityAt);
      if (JSON.stringify(list) !== JSON.stringify(this.rooms)) {
        this.rooms = list;
        this.broadcast({ t: 'rooms', list });
      }
      for (const [id, v] of this.views) {
        const w = next.get(id);
        if (w) v.orcaUpdate(w);
      }
    } catch {
      if (this.reachable) { this.reachable = false; this.rooms = []; this.broadcast({ t: 'rooms', list: [] }); }
    } finally {
      this.polling = false;
    }
  }

  /** A client starts watching a room (or stops, with null). Returns what to show. */
  async watch(viewer: Viewer, id: string | null): Promise<{ mission: MissionInfo | null; log: Logged[] } | null> {
    const prev = this.watching.get(viewer);
    if (id) this.watching.set(viewer, id); else this.watching.delete(viewer);
    if (prev && prev !== id && ![...this.watching.values()].includes(prev)) {
      this.views.get(prev)?.close();
      this.views.delete(prev);
    }
    if (!id) return null;
    const w = this.worktrees.get(id);
    if (!w) return null;
    let v = this.views.get(id);
    if (!v) {
      v = new RoomView(w, (ev, at) => this.broadcast({ t: 'ev', missionId: v!.mission.id, at, ev }), () => this.reopen(id));
      this.views.set(id, v);
      await v.load();
    }
    return { mission: v.mission, log: v.log };
  }

  forget(viewer: Viewer) { void this.watch(viewer, null); }

  /** The turn changed (a new request): everyone watching gets the room again. */
  private reopen(id: string) {
    const v = this.views.get(id);
    if (!v) return;
    for (const [viewer, rid] of this.watching) if (rid === id) viewer.send({ t: 'room_open', room: id, mission: v.mission, log: v.log });
  }

  /** Sends a message to the lead agent of the room, through its Orca terminal. */
  async say(viewer: Viewer, text: string) {
    const id = this.watching.get(viewer);
    const w = id ? this.worktrees.get(id) : null;
    if (!w?.lead) throw new Error(tr({ ko: '이 방에는 말을 걸 에이전트가 없어요.', en: 'No agent to talk to in this room.' }));
    const list = await orcaJson(this.bin, ['terminal', 'list', '--worktree', `id:${w.worktreeId}`]);
    const term = ((list.terminals ?? []) as Json[]).find((t) => `${t.tabId}:${t.leafId}` === w.lead!.paneKey);
    if (!term?.handle) throw new Error(tr({ ko: '에이전트의 터미널을 찾지 못했어요.', en: 'Couldn’t find the agent’s terminal.' }));
    try {
      await orcaJson(this.bin, ['terminal', 'send', '--terminal', String(term.handle), '--text', text, '--enter']);
    } catch (e) {
      if (e instanceof OrcaError && e.code === 'agent_prompt_blocked') {
        throw new Error(tr({ ko: '에이전트가 허락을 기다리고 있어요. Orca에서 먼저 답해 주세요.', en: 'The agent is waiting for permission. Answer it in Orca first.' }));
      }
      throw e;
    }
  }
}

interface Tracked { file: string; offset: number; rest: string; parent: string | null }

/**
 * One room: the current turn of its lead agent (from its last request on), as office events.
 * The room's « mission » is that turn; a new request starts a new one.
 */
export class RoomView {
  mission: MissionInfo;
  log: Logged[] = [];
  private w: Worktree;
  private emitOut: (ev: OfficeEvent, at: number) => void;
  private onReset: () => void;
  private norm!: Normalizer;
  private names = new Set<string>();
  private main: Tracked | null = null;
  private subs = new Map<string, Tracked>();
  private subsDir = '';
  /** Agent calls made in this turn (tool_use id), and the background ones still out */
  private hired = new Set<string>();
  private background = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private lastState: RoomInfo['state'];
  private lastTool = '';
  private lastSaid = '';
  /** a new request was seen before Orca noticed it: its « done » is about the previous turn */
  private begunAt = 0;
  /** the time of the line being fed (events of an old turn keep their real time) */
  private now = Date.now();

  constructor(w: Worktree, emit: (ev: OfficeEvent, at: number) => void, onReset: () => void) {
    this.w = w;
    this.emitOut = emit;
    this.onReset = onReset;
    this.lastState = w.info.state;
    this.mission = this.newMission(Date.now());
  }

  private newMission(at: number, working = this.w.info.state === 'working' || this.w.info.state === 'waiting'): MissionInfo {
    return {
      id: `room-${this.w.info.id}-${at}`, title: this.w.info.name, prompt: this.w.lead?.prompt ?? '', folder: '',
      createdAt: at, workMs: 0, status: working ? 'working' : 'done',
      stats: emptyStats(), files: [],
    };
  }

  /**
   * A new request while the room is open: an empty office for everyone watching, then a live « start »,
   * so the lead walks to the desk like in your own office (a reload would only place it there).
   */
  private begin(text: string, at: number) {
    this.log = [];
    this.names = new Set();
    this.hired.clear();
    this.background.clear();
    this.subs.clear();
    this.norm = new Normalizer({ emit: (ev) => this.emit(ev, this.now, true), onQuota: () => {}, onResult: () => {}, folder: this.w.path, names: this.names });
    // the transcript is faster than Orca: the turn is working, whatever Orca still says
    this.mission = this.newMission(at, true);
    this.begunAt = Date.now();
    this.onReset();
    this.emit({ k: 'start', text }, at, true);
  }

  private emit(ev0: OfficeEvent, at: number, live: boolean) {
    // the room's folder becomes « . » and the home folder « ~ »: no full path leaves the server
    const ev = JSON.parse(JSON.stringify(ev0).split(this.w.path).join('.').split(os.homedir()).join('~')) as OfficeEvent;
    this.log.push({ at, ev });
    countStats(this.mission.stats, ev);
    if (live) this.emitOut(ev, at);
  }

  close() { if (this.timer) clearInterval(this.timer); }

  /** Builds the current turn, then follows the transcript. */
  async load() {
    this.log = [];
    this.names = new Set();
    this.hired.clear();
    this.background.clear();
    this.subs.clear();
    let live = false;
    this.norm = new Normalizer({ emit: (ev) => this.emit(ev, this.now, live), onQuota: () => {}, onResult: () => {}, folder: this.w.path, names: this.names });
    const file = this.w.lead?.agentType === 'claude' ? await newestTranscript(this.w.path) : null;
    if (!file) {
      // no transcript: what Orca tells us is all we have
      this.mission = this.newMission(this.w.lead?.updatedAt ?? Date.now());
      this.emit({ k: 'start', text: this.w.lead?.prompt ?? '' }, this.mission.createdAt, false);
      if (this.w.lead?.lastAssistantMessage) this.emit({ k: 'say', who: 'chef', text: this.w.lead.lastAssistantMessage }, Date.now(), false);
      this.lastSaid = this.w.lead?.lastAssistantMessage ?? '';
      if (this.mission.status === 'done') this.emit({ k: 'end', ok: true, text: this.lastSaid, ms: 0 }, Date.now(), false);
    } else {
      const { lines, offset } = await readTail(file);
      let start = 0;
      for (let i = lines.length - 1; i >= 0; i--) if (isPrompt(lines[i])) { start = i; break; }
      const turn = lines.slice(start);
      const t0 = stamp(turn[0]) || Date.now();
      this.mission = this.newMission(t0);
      this.main = { file, offset, rest: '', parent: null };
      this.subsDir = path.join(file.replace(/\.jsonl$/, ''), 'subagents');
      // the hires of this turn, then their transcripts, all replayed in time order
      for (const l of turn) for (const b of blocks(l)) if (b.type === 'tool_use' && (b.name === 'Agent' || b.name === 'Task')) this.hired.add(String(b.id));
      const merged: { at: number; line: Json; parent: string | null }[] = turn.map((line) => ({ at: stamp(line), line, parent: null }));
      for (const [parent, sub] of await this.findSubs()) {
        const { lines: sl, offset: so } = await readTail(sub);
        this.subs.set(parent, { file: sub, offset: so, rest: '', parent });
        for (const line of sl) merged.push({ at: stamp(line), line, parent });
      }
      merged.sort((a, b) => a.at - b.at);
      if (isPrompt(turn[0])) this.emit({ k: 'start', text: promptText(turn[0]) }, t0, false);
      for (const m of merged) this.feed(m.line, m.parent, m.at);
      if (this.mission.status === 'done') this.emit({ k: 'end', ok: true, text: this.w.lead?.lastAssistantMessage ?? '', ms: 0 }, Date.now(), false);
    }
    live = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => void this.tick(), TAIL_MS);
  }

  /** One transcript line → the Normalizer (as if it came from `claude -p` stream-json). */
  private feed(line: Json, parent: string | null, at: number) {
    this.now = at || Date.now();
    if (line.type === 'assistant') {
      this.norm.handle({ type: 'assistant', message: line.message, parent_tool_use_id: parent });
      for (const b of blocks(line)) if (b.type === 'tool_use' && (b.name === 'Agent' || b.name === 'Task')) this.hired.add(String(b.id));
      // a background helper's last answer (text, no more tools): it hands in its work and leaves
      if (parent && this.background.has(parent) && isFinal(line)) {
        this.background.delete(parent);
        this.done(parent, blocks(line).filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join('\n'));
      }
    } else if (line.type === 'user') {
      const r = line.toolUseResult;
      const content = blocks(line).filter((b) => {
        if (b.type !== 'tool_result' || !this.hired.has(String(b.tool_use_id))) return true;
        // « launched » is not « finished »: a background helper keeps working after this result
        if (r && typeof r === 'object' && r.status && r.status !== 'completed') { this.background.set(String(b.tool_use_id), Date.now()); return false; }
        return true;
      });
      if (content.length) this.norm.handle({ type: 'user', message: { ...line.message, content }, parent_tool_use_id: parent, tool_use_result: r });
    }
  }

  private done(id: string, text: string) {
    this.norm.handle({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: text }] }, tool_use_result: { status: 'completed' } });
  }

  /** The subagent transcripts of this turn: tool_use id → file. */
  private async findSubs(): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const name of await readdir(this.subsDir).catch(() => [] as string[])) {
      if (!name.endsWith('.meta.json')) continue;
      try {
        const meta = JSON.parse(await readFile(path.join(this.subsDir, name), 'utf8'));
        const id = String(meta.toolUseId ?? '');
        const file = path.join(this.subsDir, name.replace(/\.meta\.json$/, '.jsonl'));
        if (this.hired.has(id) && existsSync(file)) out.set(id, file);
      } catch { /* meta being written */ }
    }
    return out;
  }

  private async tick() {
    if (!this.main) return;
    // a newer session in the same folder (a new terminal, /clear…): start over
    const newest = await newestTranscript(this.w.path);
    if (newest && newest !== this.main.file) { await this.reset(); return; }
    for (const [parent, file] of await this.findSubs()) {
      if (!this.subs.has(parent)) this.subs.set(parent, { file, offset: 0, rest: '', parent });
    }
    let fresh = false;
    for (const line of await readNew(this.main)) {
      if (isPrompt(line)) { fresh = true; this.begin(promptText(line), stamp(line) || Date.now()); }
      this.feed(line, null, Date.now());
    }
    // the helpers of the previous turn are gone; the new ones are found on the next tick
    if (!fresh) for (const t of this.subs.values()) for (const line of await readNew(t)) this.feed(line, t.parent, Date.now());
    for (const [id, since] of this.background) {
      if (!this.subs.has(id) && Date.now() - since > DETACHED_MS) { this.background.delete(id); this.done(id, ''); }
    }
  }

  private async reset() {
    if (this.timer) clearInterval(this.timer);
    await this.load();
    this.onReset();
  }

  /** What Orca says about the room, every poll. */
  orcaUpdate(w: Worktree) {
    this.w = w;
    const state = w.info.state;
    const lead = w.lead;
    if (this.begunAt) {
      // a new request is under way: wait until Orca has seen it, or for too long
      if (state === 'working' || state === 'waiting' || Date.now() - this.begunAt > STALE_MS) this.begunAt = 0;
      else if (state === 'done' || state === 'idle') return;
    }
    if (state !== this.lastState) {
      // no transcript: a room that starts working again is a new request
      if (!this.main && state === 'working' && (this.lastState === 'done' || this.lastState === 'idle')) {
        this.lastState = state;
        this.begin(lead?.prompt ?? '', Date.now());
        this.lastTool = '';
      }
      if (state === 'done' && (this.lastState === 'working' || this.lastState === 'waiting')) {
        this.mission.status = 'done';
        this.emit({ k: 'end', ok: true, text: lead?.lastAssistantMessage ?? '', ms: Date.now() - this.mission.createdAt }, Date.now(), true);
      }
      if (state === 'waiting') {
        this.emit({ k: 'say', who: 'chef', text: tr({ ko: '허락을 기다리고 있어요. Orca에서 답해 주세요.', en: 'I’m waiting for permission. Please answer in Orca.' }) }, Date.now(), true);
      }
      if (state === 'working' && this.lastState !== 'waiting') this.mission.status = 'working';
      this.lastState = state;
    }
    // without a transcript, the bubbles come from Orca: the current tool and the last answer
    if (!this.main && lead) {
      const tool = `${lead.toolName ?? ''}|${lead.toolInput ?? ''}`;
      if (lead.toolName && tool !== this.lastTool) {
        const v = lead.toolInput ?? '';
        const { kind, label, detail } = describeAct(lead.toolName, { command: v, file_path: v, url: v, query: v, pattern: v, description: v });
        this.emit({ k: 'act', who: 'chef', id: `orca-${Date.now()}`, kind, tool: lead.toolName, label, detail }, Date.now(), true);
      }
      this.lastTool = tool;
      const said = lead.lastAssistantMessage ?? '';
      if (said && said !== this.lastSaid) this.emit({ k: 'say', who: 'chef', text: said }, Date.now(), true);
      this.lastSaid = said;
    }
  }
}

// ── Claude Code transcripts ──

/** Claude Code keeps a folder per project: its path with every non-alphanumeric character turned into « - ». */
async function newestTranscript(dir: string): Promise<string | null> {
  const proj = path.join(os.homedir(), '.claude', 'projects', dir.replace(/[^a-zA-Z0-9]/g, '-'));
  let best: string | null = null, bestAt = 0;
  for (const name of await readdir(proj).catch(() => [] as string[])) {
    if (!name.endsWith('.jsonl')) continue;
    const s = await stat(path.join(proj, name)).catch(() => null);
    if (s && s.mtimeMs > bestAt) { bestAt = s.mtimeMs; best = path.join(proj, name); }
  }
  return best;
}

async function readTail(file: string): Promise<{ lines: Json[]; offset: number }> {
  const fh = await open(file, 'r');
  try {
    const { size } = await fh.stat();
    const from = Math.max(0, size - WINDOW);
    const buf = Buffer.alloc(size - from);
    await fh.read(buf, 0, buf.length, from);
    // skip the cut first line; keep a half-written last line for the next tick
    const skip = from > 0 ? buf.indexOf(0x0a) + 1 : 0;
    const end = buf.lastIndexOf(0x0a) + 1;
    return { lines: end > skip ? parse(buf.subarray(skip, end).toString('utf8')) : [], offset: from + end };
  } finally {
    await fh.close();
  }
}

async function readNew(t: Tracked): Promise<Json[]> {
  const s = await stat(t.file).catch(() => null);
  if (!s || s.size <= t.offset) return [];
  const fh = await open(t.file, 'r');
  try {
    const buf = Buffer.alloc(Math.min(s.size - t.offset, WINDOW));
    await fh.read(buf, 0, buf.length, t.offset);
    t.offset += buf.length;
    const text = t.rest + buf.toString('utf8');
    const end = text.lastIndexOf('\n');
    t.rest = text.slice(end + 1);
    return parse(text.slice(0, end + 1));
  } finally {
    await fh.close();
  }
}

function parse(text: string): Json[] {
  const out: Json[] = [];
  for (const l of text.split('\n')) {
    if (!l.trim()) continue;
    try { out.push(JSON.parse(l)); } catch { /* skip */ }
  }
  return out;
}

const blocks = (line: Json): Json[] => (Array.isArray(line?.message?.content) ? line.message.content : []);
const stamp = (line: Json | undefined) => (line?.timestamp ? Date.parse(line.timestamp) || 0 : 0);

/** A request typed by the person (not a tool result, not an internal note). */
function isPrompt(line: Json | undefined): boolean {
  if (!line || line.type !== 'user' || line.isMeta || line.isSidechain) return false;
  const text = promptText(line);
  const t = text.trimStart();
  // « <command-…> », « [Request interrupted by user] »… are written by Claude Code, not typed
  return !!t && !t.startsWith('<') && !t.startsWith('[Request interrupted');
}

function promptText(line: Json): string {
  const c = line.message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    if (c.some((b: Json) => b?.type === 'tool_result')) return '';
    return c.filter((b: Json) => b?.type === 'text').map((b: Json) => String(b.text ?? '')).join('\n');
  }
  return '';
}

/** The last answer of an agent: text only, and the model said it was done. */
function isFinal(line: Json): boolean {
  const b = blocks(line);
  if (b.some((x) => x.type === 'tool_use') || !b.some((x) => x.type === 'text')) return false;
  const stop = line.message?.stop_reason;
  return stop === undefined || stop === null || stop === 'end_turn';
}
