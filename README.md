# Agent Office

**Say what you want. A team of AI agents gets to work right before your eyes.** · [한국어](README.ko.md)

Agent Office turns Claude Code into a little pixel-art game. Max, the team lead, reads your request and calls the right specialists.
They walk in, sit at their desks, and every bubble shows what they are really doing, right now. These aren't animations: each
character is a real Claude Code subagent, working on your computer, with your own subscription.

**Bring your own characters.** Drop PNG images (or a zip of them) into the `skins/` folder, then pick a character for each role.
One front-facing image is enough: the office makes the walking, sitting and cheering poses for you.

Available in Korean and English. Free and open source.

---

## Install

1. You need [Claude Code](https://claude.com/claude-code), installed and signed in.
2. Open Claude Code and paste:

   ```
   Install and run Agent Office: https://github.com/jinsung-dev/agent-office
   ```

3. Claude Code downloads, installs and starts the office. It opens in your browser at http://localhost:4848.

> **For Claude Code** (if you were given this link):
> 1. Check that Node.js 22.18 or newer is installed (`node -v`). If not, offer to install the LTS from https://nodejs.org.
> 2. `git clone https://github.com/jinsung-dev/agent-office.git`, then `cd agent-office` and `npm install`.
> 3. Run `npm start` **in the background**: it's a small server that must keep running. It opens the browser at http://localhost:4848.
> 4. Tell the person the office is ready, that it runs as long as the command runs, and that they can write their first mission to Max.

### By hand

```bash
git clone https://github.com/jinsung-dev/agent-office.git
cd agent-office
npm install
npm start
```

Requires [Node.js](https://nodejs.org) 22.18+. To stop: `Ctrl + C`.

## Your own characters (skins)

Put images in `~/Documents/Agent Office/skins/`:

```
skins/
  friends.zip          ← a zip works as is (it's unpacked automatically)
  animals/
    cat.png            ← front view (required)
    cat.back.png       ← back view (optional)
    cat.side.png       ← side view, facing right (optional)
```

Then open ⚙️ Settings → **Characters** and choose one for each role. Changes show up right away, no reload.
The file name is the character's name. Only PNG files are read.

This repository ships no third-party characters. Use only images you have the right to use.

## Orca mode

If you use Orca, `npm run orca` turns every Orca workspace into a room. Tabs at the top show each room with a dot
(🟢 working, ✋ waiting for permission, ⚪ done). Open one to watch its agent and subagents work, and type a message to send it
straight to the agent's terminal in Orca.

## Your first mission

Write to Max, by keyboard or by voice (🎙️). Some ideas:

- "I'm launching a coffee brand. Analyze 5 competitors, one agent each, compare their prices and build my launch site."
- "Give me this week's AI news: the 5 things that matter for a small business."
- "Write 3 LinkedIn posts about my work."

Before your first mission, fill in the brief (button in the right panel): who you are, what you do. Max reads it before every mission.

## What you can do

- **Click on everything**: a character shows its task, every action and its report; the board shows the plan; the printer shows the
  files the team delivered; the bookshelf shows your past missions.
- **See the websites the team built** in a screen, desktop or phone size, with their code and every version.
- **Replay a mission** (`H`, then "Replay"): it plays again exactly, without running the team or using your subscription.
- **Play music** on the jukebox, take the **guided tour** (`T`).

| Key | Effect |
|---|---|
| `F` | Filming mode: the camera follows the action. `F` or `Esc` to exit |
| `V` | Vertical 9:16 frame, for Reels and TikTok |
| `T` | Guided tour |
| `C` | Auto camera on/off |
| `N` | Day, evening, night |
| `J` | Jukebox |
| `M` | Sound |
| wheel | Zoom (double-click: wide shot) |

## What happens on your computer

- **Everything stays local.** The office only listens on 127.0.0.1, and no website can start your team for you.
- **Max is a real Claude Code session**, started without a window in the mission folder (`~/Documents/Agent Office/Missions/`).
  The team are real Claude Code subagents, each with only the tools of its trade.
- **The team stays in the mission folder** (Claude Code restricted mode).
- **Risky actions need your OK**: the agent raises its hand and you answer Yes or No.
- **Websites the team builds are shown in a sandbox**: they can't read the office or talk to Claude Code.
- **It uses your Claude subscription**, as if you asked Claude Code yourself.

## Contributing

Ideas, bugs, new furniture, new roles, new languages: see [CONTRIBUTING.md](CONTRIBUTING.md). The easiest way is to open Claude Code
in the project folder and say what you want to add; [CLAUDE.md](CLAUDE.md) explains how the project is built.

Development: `npm run dev` (http://localhost:5174, hot reload). `npm run check` checks types.

## Credits

Agent Office is a fork of [Le Bureau des agents](https://github.com/devlikemasta/bureau-des-agents) by VibesMoney (MIT): the office,
the engine and the pixel art come from there.

- **Music**: original tracks from Le Bureau des agents, made with [ElevenLabs Music](https://elevenlabs.io/music) and Google Lyria.
- **Sound effects**: [ZzFX](https://github.com/KilledByAPixel/ZzFX) (MIT). **Fonts**: Pixelify Sans and Plus Jakarta Sans (OFL).
- **Inspiration**: [Pixel Agents](https://github.com/pablodelucca/pixel-agents) and [claude-office](https://github.com/paulrobello/claude-office) (MIT).

MIT License (see [LICENSE](LICENSE)).
