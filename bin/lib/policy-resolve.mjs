// policy-resolve.mjs — nối `policy.mjs` (thuần) với đĩa: đọc 3 tầng, chọn mode, trả policy đã gộp.
//
// BA TẦNG (sau ← đè trước):
//   1. `<pluginRoot>/policy/defaults.json`   — bộ khung ship, nguồn của mọi ngưỡng
//   2. `claude_config.json::policy`           — tuỳ biến của DỰ ÁN (commit theo repo dự án)
//   3. `<git-dir>/policy-local.json`          — tuỳ biến của CLONE này (không commit)
//
// MODE chọn riêng, cũng ba tầng nhưng NGƯỢC hướng ưu tiên (cụ thể nhất thắng):
//   `<git-dir>/config-mode-local.json` > `claude_config.json::policy.mode` > `policy.defaultMode`
//
// Vì sao mode tách khỏi dữ liệu policy: mode là "đang chạy chế độ nào", per-CLONE và đổi luôn xoành
// xoạch; policy là "các chế độ nghĩa là gì", ổn định và commit được. Trộn hai thứ thì mỗi lần đổi
// mode lại là một diff trong repo.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { readJson, mergePolicy, validatePolicy } from './policy.mjs';

export const MODE_STATE_FILE = 'config-mode-local.json';
export const LOCAL_POLICY_FILE = 'policy-local.json';

/** `<git-dir>` tuyệt đối của cây, hoặc null nếu không phải repo git (hợp lệ — chỉ mất tầng local). */
export function gitDir(root) {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', '--absolute-git-dir'],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim() || null;
  } catch { return null; }
}

/**
 * @param {{root:string, pluginRoot:string, config?:object}} o
 * @returns {{ok:boolean, policy:object|null, mode:string|null, errors:string[], warnings:string[], sources:object}}
 */
export function resolvePolicy({ root, pluginRoot, config }) {
  const errors = [];
  const warnings = [];
  const sources = { defaults: null, project: false, local: null, mode: 'defaultMode' };

  const dfltPath = path.join(pluginRoot ?? '', 'policy', 'defaults.json');
  const dflt = readJson(dfltPath);
  if (!dflt.ok) {
    errors.push(`${dflt.error}\n  ⇒ bản cài plugin hỏng: thiếu policy/defaults.json`);
    return { ok: false, policy: null, mode: null, errors, warnings, sources };
  }
  sources.defaults = dfltPath;

  // Tầng DỰ ÁN. `mode` là CHỌN CHẾ ĐỘ, không phải dữ liệu policy ⇒ tách ra trước khi merge, kẻo nó
  // thành một khoá lạ nằm trong policy đã gộp rồi ai đó tưởng đọc được ngưỡng từ đó.
  const rawProject = config?.policy ?? null;
  let projectMode = null;
  let project = null;
  if (rawProject && typeof rawProject === 'object') {
    const { mode, ...rest } = rawProject;
    if (typeof mode === 'string' && mode.trim() !== '') projectMode = mode.trim();
    if (Object.keys(rest).length) { project = rest; sources.project = true; }
  }

  // Tầng CLONE.
  let local = null;
  const gd = gitDir(root);
  if (gd) {
    const l = readJson(path.join(gd, LOCAL_POLICY_FILE));
    if (l.ok) { local = l.value; sources.local = path.join(gd, LOCAL_POLICY_FILE); }
    // "không có file" là ca HỢP LỆ (đa số clone không override). Mọi lý do KHÁC phải nói ra —
    // nuốt EACCES/JSON-hỏng thành "không có tầng local" là đúng thứ §0 gọi là no silent skip.
    else if (!l.error.startsWith('không có file')) errors.push(l.error);
  }

  const policy = mergePolicy(dflt.value, project, local);
  const perrs = validatePolicy(policy);
  if (perrs.length) errors.push(...perrs);
  if (errors.length) return { ok: false, policy, mode: null, errors, warnings, sources };

  // ── mode ──
  let mode = policy.defaultMode;
  if (projectMode) { mode = projectMode; sources.mode = 'claude_config.json::policy.mode'; }
  if (gd) {
    const st = readJson(path.join(gd, MODE_STATE_FILE));
    if (st.ok) {
      const m = st.value?.mode;
      if (typeof m === 'string' && m.trim() !== '') { mode = m.trim(); sources.mode = path.join(gd, MODE_STATE_FILE); }
      else warnings.push(`${MODE_STATE_FILE} có mà KHÔNG khai \`mode\` là chuỗi ⇒ bỏ qua tầng này`);
    } else if (!st.error.startsWith('không có file')) {
      warnings.push(`${st.error} ⇒ bỏ qua state mode per-clone`);
    }
  }

  // Fallback KHÔNG được im lặng: ca thật là project thu hẹp `modes` rồi user set một mode không
  // còn tồn tại — hệ chạy mode khác mà không ai biết mình đang ở đâu.
  if (!policy.modes.includes(mode)) {
    warnings.push(`mode "${mode}" KHÔNG nằm trong modes [${policy.modes.join(', ')}] ⇒ dùng defaultMode`
      + ` "${policy.defaultMode}". Thường do policy thu hẹp \`modes\`, hoặc state giữ mode cũ.`);
    mode = policy.defaultMode;
    sources.mode = 'defaultMode (lùi về)';
  }

  return { ok: true, policy, mode, errors, warnings, sources };
}

/**
 * Ghi mode cho RIÊNG clone này. Trả về đường dẫn đã ghi, hoặc ném nếu không có `<git-dir>`.
 * Per-clone chứ không per-project: hai worktree của cùng repo phải chạy được hai mode khác nhau.
 */
export function setMode({ root, mode }) {
  const gd = gitDir(root);
  if (!gd) throw new Error('không có <git-dir> — mode per-clone lưu trong thư mục git, hãy chạy trong một repo git');
  const p = path.join(gd, MODE_STATE_FILE);
  fs.writeFileSync(p, JSON.stringify({ mode }, null, 2) + '\n');
  return p;
}
