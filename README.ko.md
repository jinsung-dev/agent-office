# 에이전트 오피스 (Agent Office)

**원하는 걸 말하면, AI 에이전트 팀이 눈앞에서 일을 시작해요.** · [English](README.md)

에이전트 오피스는 Claude Code를 작은 픽셀 게임으로 바꿔줘요. 팀장 Max가 요청을 읽고 알맞은 전문가를 불러요.
전문가들은 문으로 들어와 자리에 앉고, 말풍선에는 지금 이 순간 실제로 하는 일이 떠요. 애니메이션이 아니에요.
캐릭터 하나하나가 내 컴퓨터에서, 내 구독으로 일하는 진짜 Claude Code 서브에이전트예요.

**캐릭터를 직접 바꿀 수 있어요.** `skins/` 폴더에 PNG 이미지(또는 zip)를 넣고, 직군마다 캐릭터를 고르면 돼요.
앞모습 한 장이면 충분해요. 걷기, 앉기, 환호 포즈는 사무실이 알아서 만들어요.

한국어와 영어를 지원해요. 무료 오픈소스예요.

---

## 설치

1. [Claude Code](https://claude.com/claude-code)가 설치돼 있고 로그인돼 있어야 해요.
2. Claude Code를 열고 이렇게 붙여 넣어요.

   ```
   에이전트 오피스를 설치하고 실행해줘: https://github.com/jinsung-dev/agent-office
   ```

3. Claude Code가 내려받고, 설치하고, 실행해요. 브라우저에서 http://localhost:4848 이 열려요.

### 직접 설치

```bash
git clone https://github.com/jinsung-dev/agent-office.git
cd agent-office
npm install
npm start
```

[Node.js](https://nodejs.org) 22.18 이상이 필요해요. 끌 때는 터미널에서 `Ctrl + C`를 눌러요.

## 내 캐릭터 넣기 (스킨)

`~/Documents/Agent Office/skins/`에 이미지를 넣어요.

```
skins/
  friends.zip          ← zip 그대로 넣어도 돼요 (자동으로 풀려요)
  animals/
    cat.png            ← 앞모습 (필수)
    cat.back.png       ← 뒷모습 (선택)
    cat.side.png       ← 옆모습, 오른쪽을 봐요 (선택)
```

그다음 ⚙️ 설정 → **캐릭터**에서 직군마다 골라요. 새로고침 없이 바로 바뀌어요.
파일 이름이 캐릭터 이름이 돼요. PNG 파일만 읽어요.

이 저장소에는 다른 작품의 캐릭터가 들어 있지 않아요. 쓸 권리가 있는 이미지만 써 주세요.

## Orca 모드

Orca를 쓴다면 `npm run orca`로 켜 보세요. Orca 워크트리 하나하나가 방이 돼요. 위쪽 탭에 방마다 상태 점이 붙어요
(🟢 일하는 중, ✋ 허락 대기, ⚪ 끝남). 방을 열면 그 에이전트와 서브에이전트가 일하는 모습이 보이고,
입력창에 쓴 말은 Orca에 있는 에이전트 터미널로 바로 가요.

## 첫 미션

Max에게 키보드나 목소리(🎙️)로 말해요. 예를 들면:

- "커피 브랜드를 시작해요. 경쟁사 5곳을 한 곳당 에이전트 하나씩 붙여서 분석하고, 가격을 비교하고, 런칭 사이트를 만들어줘."
- "이번 주 AI 소식 중에 작은 사업에 중요한 5가지를 정리해줘."
- "내 일에 대한 링크드인 글 3개 써줘."

첫 미션 전에 오른쪽 패널의 버튼으로 소개 파일을 채워요. 내가 누구고 무슨 일을 하는지요. Max가 미션마다 먼저 읽어요.

## 할 수 있는 것

- **전부 클릭해 보세요.** 캐릭터를 누르면 맡은 일, 모든 행동, 보고서가 나와요. 보드는 계획, 프린터는 팀이 만든 파일,
  책장은 지난 미션이에요.
- **팀이 만든 웹사이트를 화면 안에서 봐요.** PC, 휴대폰 크기로 보고, 코드와 모든 버전도 볼 수 있어요.
- **미션 다시 보기** (`H` → "다시 보기"): 팀을 다시 돌리지 않고, 구독도 쓰지 않고 그대로 다시 보여줘요.
- **주크박스로 음악을 틀고**, **둘러보기**(`T`)를 해 보세요.

| 키 | 기능 |
|---|---|
| `F` | 촬영 모드: 카메라가 알아서 따라가요. `F`나 `Esc`로 나가요 |
| `V` | 세로 9:16 화면 (릴스, 틱톡용) |
| `T` | 둘러보기 |
| `C` | 자동 카메라 켜기/끄기 |
| `N` | 낮, 저녁, 밤 |
| `J` | 주크박스 |
| `M` | 소리 |
| 휠 | 확대 (더블클릭: 전체 보기) |

## 내 컴퓨터에서 일어나는 일

- **모든 게 내 컴퓨터 안에 있어요.** 사무실은 127.0.0.1에서만 열리고, 다른 웹사이트가 내 팀을 대신 움직일 수 없어요.
- **Max는 진짜 Claude Code 세션이에요.** 미션 폴더(`~/Documents/Agent Office/Missions/`)에서 창 없이 실행돼요.
  팀원은 진짜 Claude Code 서브에이전트이고, 각자 자기 직군의 도구만 써요.
- **팀은 미션 폴더 밖으로 나가지 않아요** (Claude Code 제한 모드).
- **위험한 행동은 물어봐요.** 에이전트가 손을 들면 예/아니오로 답해요.
- **팀이 만든 사이트는 격리된 공간에서 열려요.** 사무실을 읽거나 Claude Code와 대화할 수 없어요.
- **Claude 구독을 사용해요.** 내가 Claude Code에 직접 시킨 것과 같아요.

## 함께 만들기

아이디어, 버그, 새 가구, 새 직군, 새 언어 모두 환영해요. [CONTRIBUTING.md](CONTRIBUTING.md)를 봐 주세요.
가장 쉬운 방법은 프로젝트 폴더에서 Claude Code를 열고 추가하고 싶은 걸 말하는 거예요.
[CLAUDE.md](CLAUDE.md)에 프로젝트 구조가 설명돼 있어요.

개발: `npm run dev` (http://localhost:5174, 핫 리로드). `npm run check`로 타입을 확인해요.

## 고마운 분들

에이전트 오피스는 VibesMoney의 [Le Bureau des agents](https://github.com/devlikemasta/bureau-des-agents)(MIT)를 포크한 프로젝트예요.
사무실, 엔진, 픽셀 아트는 거기서 왔어요.

- **음악**: Le Bureau des agents의 오리지널 곡 ([ElevenLabs Music](https://elevenlabs.io/music), Google Lyria로 제작)
- **효과음**: [ZzFX](https://github.com/KilledByAPixel/ZzFX) (MIT). **폰트**: Pixelify Sans, Plus Jakarta Sans (OFL)
- **영감**: [Pixel Agents](https://github.com/pablodelucca/pixel-agents), [claude-office](https://github.com/paulrobello/claude-office) (MIT)

MIT 라이선스 ([LICENSE](LICENSE)).
