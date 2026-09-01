// export.mjs — `cc-harness export`. Sinh bản chạy ĐỘC LẬP vào `script/` cho CI.
//
// VÌ SAO TỒN TẠI: CI và pre-push hook thường không cài được plugin Claude Code. Không có đường này
// thì dự án phải chọn giữa "gate chỉ chạy trong Claude Code" và "chép tay logic ra CI rồi để nó
// lệch" — cả hai đều tệ hơn một bản sinh có đóng dấu phiên bản.
//
// ⚠️ Bản sinh là bản ĐỨNG YÊN: nó KHÔNG đi theo plugin khi plugin nâng cấp, cũng KHÔNG đi theo
// `claude_config.json` khi config đổi. Đó chính là DRIFT — thứ mà cả mô hình plugin sinh ra để
// diệt. Nên nó phải đóng dấu đủ để `doctor` phát hiện được là đã cũ; drift IM LẶNG mới là thứ cấm.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const EXPORT_DIR = path.join('script', 'cc-harness');
export const STAMP_REL = path.join('script', '.cc-harness-export.json');

/** Module cần cho bản CI. `gate` kéo theo `gate-ledger`; `structure`/`spec` kéo `git`. */
const MODULES = ['config.mjs', 'root.mjs', 'git.mjs', 'structure.mjs', 'spec.mjs', 'risk.mjs', 'gate.mjs', 'gate-ledger.mjs'];

/** Hash để `doctor` biết config đã đổi kể từ lần export — không dùng mốc thời gian (không tái lập được). */
export const hashConfig = (config) => crypto.createHash('sha256')
  .update(JSON.stringify(config ?? null)).digest('hex').slice(0, 16);

export function pluginVersion(pluginRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8')).version ?? null;
  } catch { return null; }
}

/** Entry tự chứa: nạp config ĐÃ ĐÓNG BĂNG rồi gọi thẳng module, không cần plugin trong PATH. */
function renderEntry() {
  return `#!/usr/bin/env node
// SINH BỞI \`cc-harness export\` — ĐỪNG SỬA TAY.
//
// Bản ĐỨNG YÊN cho CI: config đã đóng băng trong config.snapshot.json, không đọc claude_config.json
// nữa. Đổi config hoặc nâng plugin ⇒ CHẠY LẠI \`cc-harness export\`. \`cc-harness doctor\` so dấu và
// cảnh báo khi bản này đã cũ.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkStructure } from './structure.mjs';
import { checkSpecs } from './spec.mjs';
import { runGate } from './gate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)); // self-locate-ok: dòng SINH RA, chạy trong repo dự án
const config = JSON.parse(fs.readFileSync(path.join(HERE, 'config.snapshot.json'), 'utf8'));
// ROOT = hai cấp trên script/cc-harness/. Bản sinh nằm TRONG repo dự án nên suy theo vị trí file là
// đúng ở đây — khác hẳn module trong plugin, nơi hai gốc tách rời nhau.
const root = path.resolve(HERE, '..', '..');

const [cmd, ...rest] = process.argv.slice(2);
const outIdx = rest.indexOf('--out');
const out = outIdx >= 0 ? rest[outIdx + 1] : undefined;

let r;
if (cmd === 'structure') r = checkStructure({ root, config });
else if (cmd === 'spec') r = checkSpecs({ root, allowRemovals: rest.includes('--allow-removals') });
else if (cmd === 'gate') r = runGate({ root, config, out });
else {
  console.error('dùng: node script/cc-harness/run.mjs <structure|spec|gate> [--out <path>]');
  process.exit(2);
}
for (const l of r.lines) (r.fail ? console.error : console.log)(l);
process.exit(r.code ?? (r.fail ? 1 : 0));
`;
}

/**
 * @param {{root:string, pluginRoot:string, config:object, write?:boolean}} o
 * @returns {{fail:boolean, lines:string[], files:string[]}}
 */
export function exportRunner({ root, pluginRoot, config, write = true }) {
  const lines = [];
  const libDir = path.join(pluginRoot, 'bin', 'lib');

  const missing = MODULES.filter((m) => !fs.existsSync(path.join(libDir, m)));
  if (missing.length) {
    lines.push(`✖ export: bản cài plugin thiếu module: ${missing.join(', ')}`, `  plugin-root: ${pluginRoot}`);
    return { fail: true, lines, files: [] };
  }
  if (!config) {
    lines.push('✖ export: dự án chưa có claude_config.json hợp lệ — bản sinh sẽ đóng băng một config'
      + ' rỗng và mọi gate ở CI thành vô nghĩa.', '  sửa: chạy `cc-harness init` trước.');
    return { fail: true, lines, files: [] };
  }

  const outDir = path.join(root, EXPORT_DIR);
  const files = [];
  if (write) {
    fs.mkdirSync(outDir, { recursive: true });
    for (const m of MODULES) {
      fs.copyFileSync(path.join(libDir, m), path.join(outDir, m));
      files.push(path.join(EXPORT_DIR, m));
    }
    fs.writeFileSync(path.join(outDir, 'config.snapshot.json'), JSON.stringify(config, null, 2) + '\n');
    files.push(path.join(EXPORT_DIR, 'config.snapshot.json'));
    fs.writeFileSync(path.join(outDir, 'run.mjs'), renderEntry());
    files.push(path.join(EXPORT_DIR, 'run.mjs'));

    fs.writeFileSync(path.join(root, STAMP_REL), JSON.stringify({
      plugin_version: pluginVersion(pluginRoot),
      config_hash: hashConfig(config),
      modules: MODULES,
    }, null, 2) + '\n');
    files.push(STAMP_REL);
  }

  lines.push(`✔ export: ${files.length} tệp → ${EXPORT_DIR}/`);
  lines.push('  chạy ở CI: node script/cc-harness/run.mjs gate --out docs/wip/ci/verify.md');
  lines.push('⚠ bản này ĐỨNG YÊN: KHÔNG đi theo plugin khi nâng cấp, KHÔNG đi theo claude_config.json'
    + ' khi config đổi. Đổi một trong hai ⇒ chạy lại `cc-harness export`.');
  return { fail: false, lines, files };
}

/**
 * Bản sinh có còn khớp plugin + config hiện tại không? Dùng bởi `doctor`.
 * @returns {{state:'none'|'ok'|'stale'|'unreadable', why:string}}
 */
export function exportStatus({ root, pluginRoot, config }) {
  const p = path.join(root, STAMP_REL);
  if (!fs.existsSync(p)) return { state: 'none', why: '' };
  let stamp;
  try { stamp = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return { state: 'unreadable', why: `${STAMP_REL} không đọc/parse được (${e.message})` }; }

  const nowV = pluginVersion(pluginRoot);
  const nowH = hashConfig(config);
  const why = [];
  if (stamp.plugin_version !== nowV) why.push(`plugin ${stamp.plugin_version} → ${nowV}`);
  if (stamp.config_hash !== nowH) why.push('claude_config.json đã đổi');
  return why.length ? { state: 'stale', why: why.join(' · ') } : { state: 'ok', why: '' };
}
