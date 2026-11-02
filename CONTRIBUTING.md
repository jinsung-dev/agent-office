# Contributing to Agent Office

Thanks for helping! This project is meant to grow with the people who use it, beginners included. (한국어로 써도 괜찮아요.)

## An idea or a bug

Open an **Issue** on GitHub and describe what you saw or what you'd like to see. A screenshot helps a lot.

## Proposing a change

1. **Fork** the repository.
2. **Create a branch**: `git checkout -b new-furniture`.
3. **Make your changes**, then check everything works:
   ```bash
   npm install
   npm run check    # types
   npm run build    # build
   npm start        # and look at the result in the browser
   ```
4. **Commit** and **push** your branch.
5. Open a **pull request**: explain what it changes, with a screenshot if it's visible.

### The easy way: ask Claude Code

Open Claude Code in the project folder and say, for example:

> Add a popcorn machine in the sofa corner, clickable, then open a pull request on GitHub.

[CLAUDE.md](CLAUDE.md) explains how the project is built and which rules to follow.

## Ideas to start with

- **A new language**: add a key to `Lang` in `shared/i18n.ts`, then translate the `tr({ … })` texts.
- **New furniture or a surprise** in the office (everything is drawn in code, in `src/engine/furniture.ts`).
- **A new role** in the team (`server/team.ts` and `shared/activity.ts`).
- **Test on Windows or Linux** and tell us what breaks.
- **Default characters** you drew yourself and can share under an open license.

## Rules

- **Every visible text exists in Korean and English** (`tr({ ko, en })`). Short sentences, simple words: the office is made for beginners.
  Korean uses 해요체.
- **Never show a full path or a user name on screen** (use `tidy()` and `tilde()` from `src/ui/`).
- **Keep it light**: about one millisecond of drawing per frame, nothing when the tab is hidden.
- **Security first**: the server listens only on 127.0.0.1, the team stays in restricted mode, websites stay in their sandbox.
- **No third-party characters in the repository.** Skins live in the user's `skins/` folder only.

## Versions

- `main` is always the working version.
- Each release gets a number (`v0.2.0`…) and its changes in [CHANGELOG.md](CHANGELOG.md).
