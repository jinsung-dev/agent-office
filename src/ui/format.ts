// Petits formats d'affichage, dans la langue du bureau.
import { getLang, locale } from '../../shared/i18n.ts';

const ko = () => getLang() === 'ko';

export const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return ko() ? `${s}초` : `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return ko() ? `${m}분 ${s % 60}초` : `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return ko() ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};

export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export const fmtDate = (t: number) => new Date(t).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** L'heure seule (hh:mm:ss), pour le fil et les listes d'actions. */
export const fmtTime = (t: number) => new Date(t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Un nombre et son nom : `ko` contient « # » à la place du nombre (pas de pluriel), `en` donne le singulier et le pluriel. */
export const plural = (n: number, t: { ko: string; en: [string, string] }) =>
  ko() ? t.ko.replace('#', n.toLocaleString('ko-KR')) : `${n.toLocaleString('en-US')} ${n === 1 ? t.en[0] : t.en[1]}`;

export const fileIcon = (ext: string) =>
  ext === 'html' || ext === 'htm' ? '🌐' : ext === 'md' || ext === 'txt' ? '📄' : ext === 'csv' || ext === 'xlsx' ? '📊' : ['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp'].includes(ext) ? '🖼️' : ext === 'pdf' ? '📕' : ['js', 'ts', 'py', 'json', 'css'].includes(ext) ? '💻' : '📁';

/** Les fichiers qu'on peut lire directement dans le bureau. */
export const readable = (ext: string) => ['md', 'txt', 'csv', 'json', 'markdown'].includes(ext);

/** Un chemin affichable à l'écran : le dossier personnel devient « ~ » (pas de nom d'utilisateur dans une vidéo). */
export const tilde = (p: string) => p.replace(/^\/(?:Users|home)\/[^/]+/, '~');
