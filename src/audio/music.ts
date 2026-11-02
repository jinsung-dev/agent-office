// Le jukebox du bureau : six morceaux originaux (house progressive et techno mélodique), composés pour
// le bureau avec ElevenLabs Music et Google Lyria. On écoute aussi le rythme (les basses) pour faire
// pulser les lumières et danser les robots.
import { tr } from '../../shared/i18n.ts';
import { useOffice } from '../state/store.ts';

export interface Track { id: string; title: string; mood: string; by: string; file: string }

export const TRACKS: Track[] = [
  { id: 'coucher-de-soleil', title: tr({ ko: '해 질 녘', en: 'Sunset' }), mood: tr({ ko: '멜로딕 프로그레시브 하우스', en: 'Melodic progressive house' }), by: 'ElevenLabs', file: '/music/coucher-de-soleil.mp3' },
  { id: 'nuit-au-bureau', title: tr({ ko: '사무실의 밤', en: 'Night at the Office' }), mood: tr({ ko: '멜로딕 테크노', en: 'Melodic techno' }), by: 'ElevenLabs', file: '/music/nuit-au-bureau.mp3' },
  { id: 'afterwork', title: tr({ ko: '퇴근 후', en: 'After Work' }), mood: tr({ ko: '햇살 가득 프로그레시브 하우스', en: 'Sunny progressive house' }), by: 'ElevenLabs', file: '/music/afterwork.mp3' },
  { id: 'golden-hour', title: tr({ ko: '골든 아워', en: 'Golden Hour' }), mood: tr({ ko: '프로그레시브 하우스', en: 'Progressive house' }), by: 'Lyria', file: '/music/golden-hour.mp3' },
  { id: 'minuit-pile', title: tr({ ko: '정각 자정', en: 'Midnight Sharp' }), mood: tr({ ko: '멜로딕 테크노', en: 'Melodic techno' }), by: 'Lyria', file: '/music/minuit-pile.mp3' },
  { id: 'vendredi-18h', title: tr({ ko: '금요일 저녁 6시', en: 'Friday, 6 PM' }), mood: tr({ ko: '햇살 가득 하우스', en: 'Sunny house' }), by: 'Lyria', file: '/music/vendredi-18h.mp3' },
];

class Jukebox {
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gain: GainNode | null = null;
  private bins: Uint8Array<ArrayBuffer> | null = null;
  private ducked = false;
  private muted = false;
  index = 0;
  playing = false;
  volume = 0.55;
  /** l'énergie des basses, lissée (0 à 1) */
  level = 0;
  /** un coup de grosse caisse vient de tomber */
  beat = false;
  private lastPeak = 0;
  private avg = 0;

  private ensure() {
    if (this.audio) return;
    const a = new Audio();
    a.preload = 'auto';
    a.addEventListener('ended', () => this.next());
    this.audio = a;
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaElementSource(a);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      const gain = ctx.createGain();
      src.connect(analyser);
      analyser.connect(gain);
      gain.connect(ctx.destination);
      this.ctx = ctx;
      this.analyser = analyser;
      this.gain = gain;
      this.bins = new Uint8Array(analyser.frequencyBinCount);
    } catch { /* sans analyse, la musique joue quand même */ }
    this.applyVolume();
  }

  private applyVolume() {
    const v = this.muted ? 0 : this.volume * (this.ducked ? 0.35 : 1);
    if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.12);
    else if (this.audio) this.audio.volume = v;
  }

  private publish() {
    useOffice.setState({ music: { playing: this.playing, index: this.index, volume: this.volume } });
  }

  play(index = this.index) {
    this.ensure();
    const a = this.audio!;
    if (index !== this.index || !a.src) {
      this.index = (index + TRACKS.length) % TRACKS.length;
      a.src = TRACKS[this.index].file;
    }
    void this.ctx?.resume();
    void a.play().then(() => { this.playing = true; this.publish(); }).catch(() => { this.playing = false; this.publish(); });
    this.playing = true;
    this.publish();
  }

  pause() {
    this.audio?.pause();
    this.playing = false;
    this.level = 0;
    this.publish();
  }

  toggle() { if (this.playing) this.pause(); else this.play(); }
  next() { this.play(this.index + 1); }
  prev() { this.play(this.index - 1); }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyVolume();
    this.publish();
  }

  /** La voix de Max passe devant la musique. */
  duck(on: boolean) { this.ducked = on; this.applyVolume(); }
  setMuted(m: boolean) { this.muted = m; this.applyVolume(); }

  /** À chaque image : l'énergie des basses (pour les lumières et la danse). */
  sample() {
    this.beat = false;
    if (!this.playing || !this.analyser || !this.bins) { this.level *= 0.9; return this.level; }
    this.analyser.getByteFrequencyData(this.bins);
    let sum = 0;
    for (let i = 1; i < 7; i++) sum += this.bins[i];
    const bass = sum / (6 * 255);
    this.avg = this.avg * 0.92 + bass * 0.08;
    const now = performance.now();
    if (bass > this.avg * 1.18 && bass > 0.45 && now - this.lastPeak > 260) { this.beat = true; this.lastPeak = now; }
    this.level = this.level * 0.6 + bass * 0.4;
    return this.level;
  }
}

export const jukebox = new Jukebox();
