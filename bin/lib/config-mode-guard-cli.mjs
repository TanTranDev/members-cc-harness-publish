// Entry cho hooks/config-mode-agent-guard.sh — đọc payload trên stdin, in JSON quyết định.
//
// `readFileSync(0)` chứ KHÔNG phải `/dev/stdin`: đường đó không tồn tại với Node trên Windows.
// Mọi lỗi ⇒ im lặng exit 0: guard là lưới PHỤ, không được làm hỏng lượt spawn.
import fs from 'node:fs';

import { checkSpawn } from './config-mode-guard.mjs';
import { loadConfig } from './config.mjs';

const argOf = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

try {
  const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
  const root = argOf('--root') || payload?.cwd || process.cwd();
  const out = checkSpawn(payload, {
    root,
    pluginRoot: argOf('--plugin-root') || process.env.CLAUDE_PLUGIN_ROOT,
    config: loadConfig(root).config,
  });
  if (out && Object.keys(out).length) process.stdout.write(JSON.stringify(out));
} catch { /* payload rác / môi trường thiếu ⇒ im */ }
process.exit(0);
