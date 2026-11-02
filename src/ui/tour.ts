// La visite guidée : Max présente son bureau, coin par coin, avec sa voix (ElevenLabs). La caméra suit,
// et s'il n'y a pas de mission en cours, une équipe de démonstration s'installe le temps de la visite.
import { say, stopVoice, type Line } from '../audio/voice.ts';
import { camera, world } from '../engine/instance.ts';
import { useOffice } from '../state/store.ts';
import { getLang, tr } from '../../shared/i18n.ts';

const STEPS: { line: Line; text: string; shot: [number, number, number] }[] = [
  { line: 'visite-1', text: tr({ ko: '제 사무실에 온 걸 환영해요! 저는 팀장 Max예요. 여기서는 AI 에이전트 팀이 밤낮없이 당신을 위해 일해요.', en: 'Welcome to my office! I’m Max, the boss here. A team of AI agents works for you in here, day and night.' }), shot: [176, 186, 1.9] },
  { line: 'visite-2', text: tr({ ko: '여기는 리서치 팀이에요. 인터넷을 뒤져서 가격, 경쟁사, 고객 후기를 찾아와요.', en: 'This is research. My researchers dig through the web for you. Prices, competitors, customer reviews.' }), shot: [64, 104, 1.7] },
  { line: 'visite-3', text: tr({ ko: '여기는 코드 작업실이에요. 웹사이트, 도구, 자동화를 만들어요.', en: 'Here’s the code workshop. They build your sites, your tools, your automations.' }), shot: [288, 76, 1.95] },
  { line: 'visite-4', text: tr({ ko: '디자인 스튜디오예요. 예뻐야 하는 건 전부 여기를 거쳐요.', en: 'The design studio. Anything that needs to look good goes through here.' }), shot: [276, 124, 1.95] },
  { line: 'visite-5', text: tr({ ko: '글쓰기 팀이에요. SNS 글, 메일, 영상 대본을 써요.', en: 'The writing desk. Your posts, your emails, your video scripts.' }), shot: [64, 188, 1.95] },
  { line: 'visite-6', text: tr({ ko: '그리고 분석 팀이에요. 숫자, 표, 그리고 중요한 결론을 맡아요.', en: 'And analysis. Numbers, tables, and the conclusions that matter.' }), shot: [258, 188, 1.95] },
  { line: 'visite-7', text: tr({ ko: '이 보드에 미션마다 계획을 적어요. 보고서는 전부 제 책상으로 와요.', en: 'I write the plan for each mission on this board. And every report ends up on my desk.' }), shot: [176, 46, 2.05] },
  { line: 'visite-8', text: tr({ ko: '원하는 걸 말해 주세요. 제가 팀을 꾸릴게요. 당신은 구경만 하면 돼요.', en: 'You tell me what you want. I build the team. And you watch.' }), shot: [176, 128, 1] },
];

let run = 0;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function startTour() {
  const id = ++run;
  const st = useOffice.getState();
  useOffice.setState({ modal: null, showFinal: false });
  const demo = !st.busySince;
  if (demo) world.demoTeam(true);
  for (let i = 0; i < STEPS.length; i++) {
    if (run !== id) return;
    const s = STEPS[i];
    camera.shot(s.shot[0], s.shot[1], s.shot[2], 60);
    useOffice.setState({ tour: { step: i, text: s.text } });
    if (i === 0 || i === STEPS.length - 1) world.chef.happyUntil = world.time + 2;
    const t0 = Date.now();
    await say(s.line, true);
    // sans la voix (fichier absent, ou voix coupée), on laisse le temps de lire (le coréen se lit plus lentement par signe)
    const minMs = 1200 + s.text.length * (getLang() === 'ko' ? 80 : 45);
    const spent = Date.now() - t0;
    if (spent < minMs) await wait(minMs - spent);
    await wait(350);
  }
  if (run !== id) return;
  endTour(demo);
}

function endTour(demo: boolean) {
  useOffice.setState({ tour: null });
  camera.wide(2);
  if (demo) world.demoTeam(false);
}

export function stopTour() {
  if (!useOffice.getState().tour) return;
  run++;
  stopVoice();
  endTour(true);
}
