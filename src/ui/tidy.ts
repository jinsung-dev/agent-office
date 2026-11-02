// À l'écran, jamais de chemins complets (ils montreraient ton nom d'utilisateur dans une vidéo) :
// le dossier de la mission devient « le dossier de la mission », le reste devient « ~/… ».
import { tr } from '../../shared/i18n.ts';
import { useOffice } from '../state/store.ts';

export function tidy(text: string): string {
  if (!text) return text;
  const s = useOffice.getState();
  let t = text;
  const folder = s.mission?.folder;
  if (folder) t = t.split(folder + '/').join('').split(folder).join(tr({ ko: '미션 폴더', en: 'the mission folder' }));
  if (s.dir) t = t.split(s.dir).join('Agent Office');
  return t.replace(/(?:\/private)?\/(?:Users|home|tmp|var)\/[^\s"'`)»]*\/([^/\s"'`)»]+)/g, '…/$1');
}
