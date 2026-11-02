// Les langues du bureau : chaque texte affiché s'écrit sur place, dans toutes les langues, avec tr().
//   tr({ ko: '파일을 열어요', en: 'Opening the file' })
// Une nouvelle langue = une nouvelle clé dans Lang ; un texte qui ne l'a pas encore retombe sur l'anglais.
//
// Dans le navigateur, la langue est lue au chargement (choix enregistré, sinon celle du navigateur) :
// les constantes des modules sont donc déjà dans la bonne langue, et changer de langue recharge la page.
// Côté serveur, elle suit les réglages (setLang).

export type Lang = 'ko' | 'en';
export const LANGS: { id: Lang; label: string }[] = [{ id: 'ko', label: '한국어' }, { id: 'en', label: 'English' }];
export const LANG_KEY = 'bureau:lang';

export const isLang = (v: unknown): v is Lang => v === 'ko' || v === 'en';

function initial(): Lang {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(LANG_KEY) ?? 'null');
    if (isLang(saved)) return saved;
  } catch { /* navigation privée */ }
  const nav = (globalThis as { navigator?: { language?: string } }).navigator?.language ?? '';
  return nav.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

let current: Lang = initial();

export const getLang = () => current;
export function setLang(l: Lang) { current = l; }

export type Text = { ko: string; en: string };

/** Le texte dans la langue du bureau. */
export function tr(t: Text): string {
  return t[current] ?? t.en;
}

/** Pour les dates et les nombres. */
export const locale = () => (current === 'ko' ? 'ko-KR' : 'en-US');
