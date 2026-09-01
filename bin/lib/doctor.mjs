// doctor.mjs — cổng setup. Trả lời đúng một câu: "dự án này chạy được bộ khung chưa, và thiếu gì".
//
// LUẬT (§0 No silent skip): bỏ qua vì THIẾU TIỀN ĐỀ vẫn phải NÓI RA. Không có đường nào ở đây
// vừa không kiểm được vừa im lặng báo ổn.
//   FAIL (exit 1) — thứ khiến bộ khung KHÔNG chạy đúng: config hỏng, bộ luật không trộn được.
//   WARN (exit 0) — thứ làm mất một lớp bảo vệ nhưng vẫn làm việc được: tích hợp thiếu, tool thiếu.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { loadConfig } from './config.mjs';
import { renderRules } from './render.mjs';
import { resolveDesign } from './design.mjs';
import { exportStatus } from './export.mjs';

/** Tool có trong PATH không. `where`/`which` tuỳ nền tảng, và cả hai đều im khi không thấy. */
export function hasTool(name, run = execFileSync) {
  try {
    run(process.platform === 'win32' ? 'where' : 'which', [name], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Workspace đã được TRUST chưa. Đo được, và nó quan trọng hơn vẻ ngoài:
 * Claude Code **bỏ qua toàn bộ `permissions.allow`** của `.claude/settings.json` khi workspace
 * chưa trust. Nghĩa là `init` có ghi quyền vào đó thì lệnh `cc-harness` vẫn bị chặn, mà thông
 * điệp lại nói về permission — người đi sửa nhầm chỗ. Gặp thật trong một phiên `claude -p`.
 * @returns {boolean|null} null = không đọc được ~/.claude.json (KHÁC với "chưa trust")
 */
export function workspaceTrusted(root, home = os.homedir()) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8'));
  } catch (e) {
    return e && e.code === 'ENOENT' ? false : null;
  }
  const projects = data?.projects ?? {};
  const norm = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const target = norm(root);
  for (const [k, v] of Object.entries(projects)) {
    if (norm(k) === target) return v?.hasTrustDialogAccepted === true;
  }
  return false;
}

/** Plugin đã cài chưa — đọc manifest của Claude Code. Không đọc được ⇒ null (KHÔNG phải false). */
export function pluginInstalled(name, home = os.homedir()) {
  const f = path.join(home, '.claude', 'plugins', 'installed_plugins.json');
  let data;
  try {
    data = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    return e && e.code === 'ENOENT' ? false : null;
  }
  const keys = Object.keys(data?.plugins ?? {});
  return keys.some((k) => k.split('@')[0] === name);
}

const STATE = { required: '⛔', optional: '·', off: ' ' };

/**
 * @returns {{lines:string[], fail:boolean}}
 */
export function doctor({ root, pluginRoot, home = os.homedir(), env = process.env }) {
  const lines = [];
  let fail = false;
  const say = (s) => lines.push(s);
  const warn = (s) => lines.push(`  ⚠ ${s}`);
  const bad = (s) => { fail = true; lines.push(`  ✖ ${s}`); };

  say(`cc-harness doctor`);
  say(`  dự án : ${root}`);
  say(`  plugin: ${pluginRoot || '(KHÔNG BIẾT — CLAUDE_PLUGIN_ROOT rỗng)'}`);
  if (!pluginRoot) bad('không xác định được ROOT plugin ⇒ không nạp được bộ luật');

  // ── tool bắt buộc ──
  const tools = ['node', 'git'];
  const missing = tools.filter((t) => !hasTool(t));
  say(`\ntool  : ${tools.map((t) => (missing.includes(t) ? `${t} THIẾU` : t)).join(' · ')}`);
  for (const t of missing) bad(`thiếu \`${t}\` trong PATH`);

  // ── trust: điều kiện để permissions của dự án có hiệu lực ──
  const trusted = workspaceTrusted(root, home);
  const allowed = (() => {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'));
      return (s?.permissions?.allow ?? []).some((p) => String(p).includes('cc-harness'));
    } catch { return false; }
  })();
  say(`\nquyền : ${allowed ? 'đã khai trong .claude/settings.json' : 'CHƯA khai — chạy `cc-harness init`'}`);
  if (trusted === null) warn('không đọc được ~/.claude.json ⇒ KHÔNG kiểm được workspace đã trust hay chưa');
  else if (!trusted) {
    warn(`workspace CHƯA được trust ⇒ Claude Code BỎ QUA mọi permissions.allow của dự án, nên lệnh \`cc-harness\` vẫn bị hỏi quyền dù đã khai.`);
    warn(`  Sửa: mở Claude Code TƯƠNG TÁC một lần tại thư mục này và bấm đồng ý ở hộp thoại trust.`);
  } else if (!allowed) {
    warn('workspace đã trust nhưng chưa khai quyền cho cc-harness — chạy `cc-harness init`');
  } else {
    say(`  ✔ đã trust — quyền có hiệu lực`);
  }

  // ── config ──
  const cfg = loadConfig(root);
  say(`\nconfig: claude_config.json`);
  if (cfg.errors.some((e) => e.code === 'config-missing')) {
    warn('chưa có — bộ khung chạy bằng luật gốc, không tuỳ biến. Sinh bằng `cc-harness init`');
  } else if (!cfg.ok) {
    for (const e of cfg.errors) bad(`${e.key}: ${e.message}`);
  } else {
    say(`  ✔ hợp lệ`);
  }
  for (const w of cfg.warnings) warn(`${w.key}: ${w.message}`);

  // ── bộ luật ──
  if (pluginRoot) {
    const r = renderRules({ root, pluginRoot, useCache: false });
    say(`\nluật  : ${r.text ? `${r.text.split('\n').length} dòng` : 'KHÔNG nạp được'}`);
    if (r.errors.some((e) => e.code === 'base-missing')) bad('plugin thiếu rules/FRAMEWORK.md — cài lại plugin');
    for (const e of r.errors.filter((e) => !['base-missing', 'config-missing'].includes(e.code))) bad(e.message);
    for (const a of r.applied) say(`  ✔ ${a.op} ${a.section}`);
    for (const rm of r.removed) warn(`ĐÃ GỠ ${rm.section} — ${rm.reason}`);
  }

  // ── design system ──
  const ds = resolveDesign(cfg.config, root);
  say(`\ndesign: ${ds.length ? '' : '(không khai — dự án không có UI?)'}`);
  for (const e of ds) {
    if (e.exists === false) warn(`${e.surface} → ${e.ref}: ${e.hint}`);
    else if (e.kind === 'plugin') say(`  · ${e.surface} → ${e.ref} (skill của plugin — không kiểm được từ đây)`);
    else say(`  ✔ ${e.surface} → ${e.ref} (skill local)`);
  }

  // ── .gitignore: cơ chế của luật "md mô tả HIỆN TẠI không lên remote" (§10) ──
  //
  // Kiểm bằng `git check-ignore`, KHÔNG bằng cách grep dòng trong `.gitignore`: pattern có thể tới
  // từ `.gitignore` cha, từ `info/exclude`, từ `core.excludesFile`, hoặc bị một dòng `!` phủ định
  // sau đó. Grep chuỗi cho ra "đã có" trong khi git vẫn track — đúng lớp lỗi xanh-mà-sai, và ở đây
  // cái giá là một spec outdate nằm trên remote.
  say(`\ngitignore:`);
  const mustIgnore = ['docs-raw/', 'docs/wip/', 'specs/'];
  let giUnknown = false;
  for (const p of mustIgnore) {
    const r = (() => {
      try {
        return execFileSync('git', ['-C', root, 'check-ignore', '-q', '--no-index', p], { stdio: 'pipe' }) || 'ignored';
      } catch (e) {
        // exit 1 = KHÔNG bị ignore (câu trả lời hợp lệ). Khác 0/1 = git không chạy được ⇒ chưa rõ.
        return e && e.status === 1 ? 'tracked' : null;
      }
    })();
    if (r === null) { giUnknown = true; continue; }
    if (r === 'tracked') {
      warn(`\`${p}\` KHÔNG bị gitignore ⇒ thiết kế/spec/ledger có thể LÊN REMOTE. Chúng mô tả HIỆN TẠI nên outdate nhanh, và một tài liệu outdate trên remote tệ hơn không có. Sửa: \`cc-harness init\`, hoặc thêm tay dòng \`${p}\``);
    } else {
      say(`  ✔ ${p}`);
    }
  }
  if (giUnknown) warn('không chạy được `git check-ignore` ⇒ KHÔNG kiểm được ba đường dẫn phải gitignore (§10)');

  // ── tích hợp ngoài ──
  const want = cfg.config?.integrations ?? {};
  const probes = {
    cc_lock: () => ({
      ok: pluginInstalled('cc-lock', home),
      how: 'claude plugin install cc-lock@members-cc-lock',
      extra: fs.existsSync(path.join(root, 'cc-lock.config.json'))
        ? 'cc-lock.config.json có ở root repo'
        : 'chưa có <repo>/cc-lock.config.json ⇒ cc-lock trơ (chạy /cc-lock:cc-lock-setup)',
    }),
    agent_tasks: () => ({
      ok: pluginInstalled('agent-tasks', home),
      how: 'claude plugin install agent-tasks',
      // Thiếu plugin KHÔNG làm luật §14 mất hiệu lực: luật "không có task ⇒ HỎI user" vẫn áp, chỉ
      // là không còn tool để claim. Nói ra để agent không hiểu "chưa cài" thành "được bỏ qua".
      extra: 'luật §14 vẫn áp dù chưa cài: không có task cho việc này ⇒ HỎI user (tạo task, hay ad-hoc), đừng tự quyết',
    }),
    cbm: () => {
      // Phải nhận CẢ biến thể có đuôi của Windows, GIỐNG HỆT `hooks/cbm-graph-first.sh` và
      // `hooks/cbm-project-hint.sh`. Ba nơi lệch nhau thì cùng một máy nhận ba câu trả lời khác
      // nhau cho câu hỏi "đã cài chưa" — và người đi sửa sẽ tin cái sai.
      const base = path.join(home, '.local', 'bin', 'codebase-memory-mcp');
      const found = ['', '.exe', '.com', '.cmd', '.bat'].map((e) => base + e).find((p) => fs.existsSync(p));
      // Trên Windows, `execFile` KHÔNG chạy được tệp không đuôi (kể cả PE hợp lệ) và Node chặn
      // `.cmd`/`.bat` vì CVE-2024-27980 ⇒ cổng "graph trước" có mặt tệp mà vẫn KHÔNG áp được.
      // Nói ra ở đây, vì "có cài" mà "cổng không chạy" là đúng loại xanh-mà-câm.
      const inert = found && process.platform === 'win32' && !/\.(exe|com)$/i.test(found);
      return {
        ok: Boolean(found),
        how: 'cài codebase-memory-mcp vào ~/.local/bin',
        extra: inert
          ? `⚠️ thấy ${path.basename(found)} nhưng trên Windows KHÔNG thực thi được qua execFile ⇒ cổng "graph TRƯỚC, grep SAU" thực tế KHÔNG áp. Cần bản .exe, hoặc chạy bộ khung trên macOS/Linux`
          : null,
      };
    },
    rtk: () => ({ ok: hasTool('rtk'), how: 'cài rtk', extra: null }),
  };

  say(`\ntích hợp:`);
  for (const [key, probe] of Object.entries(probes)) {
    const state = want[key] ?? 'optional';
    if (state === 'off') { say(`  ${STATE.off} ${key.padEnd(12)} off — đã khai là không dùng`); continue; }
    const { ok, how, extra } = probe();
    if (ok === true) say(`  ✔ ${key.padEnd(12)} có${extra ? ` — ${extra}` : ''}`);
    else if (ok === null) warn(`${key}: KHÔNG KIỂM ĐƯỢC (không đọc được manifest plugin) — trạng thái chưa rõ`);
    // `extra` phải in Ở CẢ đường thiếu, không chỉ đường có: đúng lúc một tích hợp vắng mặt là lúc
    // agent cần biết luật nào VẪN áp dù công cụ không còn. Bỏ nó ở đây làm "chưa cài" bị đọc thành
    // "được miễn" — mất luật mà không ai khai.
    else if (state === 'required') warn(`${key}: khai "required" mà KHÔNG thấy ⇒ mất lớp bảo vệ này. Cài: ${how}${extra ? `\n  ${extra}` : ''}`);
    else say(`  · ${key.padEnd(12)} không có (khai "optional")${extra ? ` — ${extra}` : ''}`);
  }

  // ── bản export cho CI: có thì phải còn KHỚP, không thì nó là drift IM LẶNG ──
  // Đây là nửa thứ hai của hợp đồng `export` trong bộ luật ("doctor so phiên bản và cảnh báo khi
  // bản sinh đã cũ"). Thiếu nửa này thì `export` chỉ đổi một loại drift lấy một loại drift khác,
  // và loại mới còn khó thấy hơn vì CI vẫn xanh.
  const ex = exportStatus({ root, pluginRoot, config: cfg.config });
  if (ex.state === 'stale') {
    warn(`bản export ở script/ đã CŨ (${ex.why}) ⇒ CI đang chạy luật/config KHÁC với dự án.`
      + ' Chạy lại: cc-harness export');
  } else if (ex.state === 'unreadable') {
    warn(`${ex.why} ⇒ KHÔNG kiểm được bản export còn khớp hay không.`);
  } else if (ex.state === 'ok') {
    say(`\nexport: ✔ bản CI ở script/ còn khớp plugin + config hiện tại`);
  }

  say(fail ? `\n⛔ SETUP FAIL — sửa các mục ✖ ở trên rồi chạy lại.` : `\n✔ SETUP OK${lines.some((l) => l.includes('⚠')) ? ' (có cảnh báo)' : ''}`);
  return { lines, fail };
}
