// Avant de lancer le bureau : la bonne version de Node, et Claude Code installé.
import { execFileSync } from 'node:child_process';
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 18)) {
  console.error(`\n  Agent Office needs Node.js 22.18 or newer (you have ${process.versions.node}).`);
  console.error('  Install the latest LTS from https://nodejs.org, then run "npm start" again.\n');
  process.exit(1);
}
try {
  execFileSync('claude', ['--version'], { stdio: 'ignore', timeout: 15000 });
} catch {
  console.warn('\n  ⚠  Claude Code was not found: the office will open in demo mode.');
  console.warn('  Install it (https://claude.com/claude-code), sign in with "claude", then run "npm start" again.\n');
}
