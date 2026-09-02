// cli.mjs — dispatcher của `cc-harness`. Nhận `--plugin-root` và `--root` QUA THAM SỐ (luật 8):
// file này sống trong plugin nhưng làm việc trên repo NGƯỜI DÙNG, hai gốc khác nhau, không được
// suy ra cái này từ cái kia.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig, formatDiagnostics, CONFIG_FILENAME } from './config.mjs';
import { listSections, nearestId } from './rules.mjs';
import { buildIndex, getSection } from './tier.mjs';
import { renderRules, BASE_REL } from './render.mjs';
import { doctor } from './doctor.mjs';
import { init } from './init.mjs';
import { resolveRoot } from './root.mjs';
import { checkStructure } from './structure.mjs';
import { checkSpecs } from './spec.mjs';
import { viewChangelog } from './changelog.mjs';
import { observe } from './observe.mjs';
import { runGate } from './gate.mjs';
import { runStamp } from './stamp.mjs';
import { exportRunner } from './export.mjs';
import { resolvePolicy, setMode } from './policy-resolve.mjs';
import { renderPolicyBlock, KNOWN_MODES } from './policy.mjs';

const USAGE = `cc-harness — bộ khung quy trình dạng plugin

Dùng: cc-harness <lệnh> [tuỳ chọn]

Lệnh:
  init [--dry-run]        sinh claude_config.json + mở quyền chạy cc-harness cho dự án
  doctor                  cổng setup: config · luật · design system · 4 tích hợp ngoài
  rules --index           bảng mục: id · tầng · dùng khi nào (phần KHÔNG bơm sẵn)
  rules <id>              in ĐÚNG một mục, vd \`rules §2\` hoặc \`rules §0/luat-output\`
  rules --show            in bộ luật đã trộn (base + override của dự án)
  rules --diff            in những gì override đã đổi so với base
  rules --list-sections   in bảng section-id để khai vào ${CONFIG_FILENAME}
  config --check          kiểm ${CONFIG_FILENAME} của dự án
  structure [--update-baseline]
                          kiểm 4 luật kiến trúc §2 (ratchet theo baseline)
  spec [<path>] [--allow-removals]
                          kiểm format spec hành vi + guard mất-mát scenario
  changelog [<YYYYMMDD>|--last <N>]
                          đọc gộp changelog fragment (mặc định: hôm nay)
  observe [--probe|<slug> [-- <lệnh>]]
                          bằng chứng quan sát (KHÔNG bao giờ chặn task — luôn exit 0)
  gate --out <path>       chạy gate.commands tuần tự + ghi ledger bằng chứng
  stamp [<ledger>]        in mốc HEAD/DIRTY; kèm đường dẫn sổ ⇒ ĐỐI SOÁT rồi báo KHỚP/LỆCH
  stamp --formula         in công thức shell chuẩn của DIRTY (nguồn sự thật, để dán vào shell)
  stamp --verify-formula  kiểm công thức shell và cách tính của máy còn cho cùng giá trị không
  export                  sinh bản chạy độc lập vào script/ cho CI (bản ĐỨNG YÊN)
  policy --check|--render|--mode|--set-mode <m>
                          tham số vận hành 3 tầng (defaults ← dự án ← clone)

Tuỳ chọn chung:
  --root <path>           ROOT repo dự án (mặc định: leo lên tìm ${CONFIG_FILENAME})
  --plugin-root <path>    ROOT plugin (mặc định: biến CLAUDE_PLUGIN_ROOT)

Mã thoát: 0 = ổn · 1 = có lỗi cấu hình/luật · 2 = dùng sai lệnh`;

function parseArgs(argv) {
  const flags = new Set();
  const opts = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root' || a === '--plugin-root' || a === '--out' || a === '--set-mode') { opts[a.slice(2)] = argv[++i]; continue; }
    if (a.startsWith('--')) { flags.add(a); continue; }
    positional.push(a);
  }
  return { flags, opts, positional };
}

function printDiag(result) {
  const text = formatDiagnostics(result);
  if (text) console.error(text);
}

export function main(argv, io = console) {
  const { flags, opts, positional } = parseArgs(argv);
  const command = positional[0];

  const pluginRoot = opts['plugin-root'] || process.env.CLAUDE_PLUGIN_ROOT;

  if (!command || flags.has('--help')) { io.log(USAGE); return command ? 0 : 2; }

  // `init` KHÔNG leo tìm marker: nó là lệnh TẠO ra marker, nên leo lên sẽ tìm thấy dự án cha rồi
  // cấu hình nhầm cây. Mọi lệnh khác leo lên để chạy được từ thư mục con.
  if (command === 'init') {
    const r = init({ root: path.resolve(opts.root || process.cwd()), write: !flags.has('--dry-run') });
    for (const l of r.lines) io.log(l);
    return r.fail ? 1 : 0;
  }

  // `stamp --formula` chỉ in một HẰNG SỐ của bộ khung — nó không nói gì về cây nào cả, nên bắt nó
  // phân giải root là bắt người dùng phải đứng trong một dự án mới xem được công thức. Đặt TRƯỚC
  // `resolveRoot` vì mọi mode khác của `stamp` thì root là bắt buộc và nghiêm ngặt.
  if (command === 'stamp' && flags.has('--formula')) {
    const r = runStamp({ root: null, mode: 'formula' });
    for (const l of r.lines) io.log(l);
    return r.code;
  }

  // Lệnh CỔNG không phân giải được root ⇒ TỪ CHỐI: quét/chấm một cây rỗng rồi báo xanh đúng là
  // false-green. Lệnh tư vấn (`doctor`, `rules`, `config`, `changelog`) lùi về cwd kèm cảnh báo.
  //
  // `stamp` thuộc nhóm CỔNG: kết quả của nó quyết định "có phải chạy lại gate không". Phân giải
  // nhầm cây ⇒ báo KHỚP cho một cây khác ⇒ land bằng chứng của sai cây.
  const GATE_COMMANDS = new Set(['structure', 'spec', 'gate', 'stamp']);
  // NGOẠI LỆ: `stamp --verify-formula` là lưới TỰ KIỂM của bộ khung, không phải lời khẳng định về
  // một dự án — nó chỉ hỏi "hai cách tính có còn cho cùng giá trị không". Bắt nó đòi
  // claude_config.json làm lưới KHÔNG chạy được ở chính repo cc-harness, tức nơi DUY NHẤT người ta
  // sửa công thức. Một cái lưới vắng mặt đúng lúc cần là không có lưới.
  const strictRoot = GATE_COMMANDS.has(command)
    && !(command === 'stamp' && flags.has('--verify-formula'));
  const rr = resolveRoot({ argRoot: opts.root, cwd: process.cwd(), gate: strictRoot });
  if (!rr.ok) { io.error(`✖ cc-harness ${command}: ${rr.message}`); return 2; }
  if (rr.warning) io.error(`⚠ cc-harness ${command}: ${rr.warning}`);
  const root = rr.root;

  if (command === 'structure') {
    const r = checkStructure({ root, config: loadConfig(root).config, updateBaseline: flags.has('--update-baseline') });
    for (const l of r.lines) (r.fail ? io.error : io.log)(l);
    return r.fail ? 1 : 0;
  }

  if (command === 'observe') {
    if (!pluginRoot) {
      io.error('cc-harness observe: không biết ROOT của plugin — truyền --plugin-root hoặc đặt CLAUDE_PLUGIN_ROOT.');
      return 2;
    }
    // observe cần argv NGUYÊN VĂN: `--probe` là cờ của nó, và mọi thứ sau `--` là lệnh của người
    // dùng. `parseArgs` gom cờ vào Set nên mất thứ tự ⇒ dựng lại từ argv thô, chỉ gỡ cặp
    // `--root`/`--plugin-root` và DỪNG gỡ khi gặp `--`.
    const passthrough = [];
    let afterDD = false;
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--') afterDD = true;
      if (!afterDD && (argv[i] === '--root' || argv[i] === '--plugin-root')) { i++; continue; }
      passthrough.push(argv[i]);
    }
    const r = observe({ root, config: loadConfig(root).config, args: passthrough.slice(1), pluginRoot });
    for (const l of r.lines) io.log(l);
    return r.status; // LUÔN 0 — quan sát không chặn task
  }

  if (command === 'export') {
    if (!pluginRoot) {
      io.error('cc-harness export: không biết ROOT của plugin — truyền --plugin-root hoặc đặt CLAUDE_PLUGIN_ROOT.');
      return 2;
    }
    const r = exportRunner({ root, pluginRoot, config: loadConfig(root).config, write: !flags.has('--dry-run') });
    for (const l of r.lines) (r.fail ? io.error : io.log)(l);
    return r.fail ? 1 : 0;
  }

  if (command === 'policy') {
    if (!pluginRoot) {
      io.error('cc-harness policy: không biết ROOT của plugin — truyền --plugin-root hoặc đặt CLAUDE_PLUGIN_ROOT.');
      return 2;
    }
    if (opts['set-mode'] !== undefined) {
      const m = opts['set-mode'];
      if (!KNOWN_MODES.includes(m)) {
        io.error(`cc-harness policy --set-mode: "${m}" không hợp lệ — chỉ ${KNOWN_MODES.join(' | ')}`);
        return 2;
      }
      try {
        io.log(`✔ mode = ${m} (riêng clone này) → ${setMode({ root, mode: m })}`);
        io.log('  Model của phiên CHÍNH không đổi được bằng lệnh này — gõ /model nếu cần.');
        return 0;
      } catch (e) { io.error(`✖ cc-harness policy --set-mode: ${e.message}`); return 1; }
    }

    const r = resolvePolicy({ root, pluginRoot, config: loadConfig(root).config });
    for (const w of r.warnings) io.error(`⚠ ${w}`);
    if (!r.ok) {
      io.error(`✖ policy KHÔNG hợp lệ (${r.errors.length} lỗi):`);
      for (const e of r.errors) io.error(`  - ${e}`);
      return 1;
    }
    if (flags.has('--mode')) { io.log(r.mode); return 0; }
    if (flags.has('--render')) { process.stdout.write(renderPolicyBlock(r.policy, r.mode, root)); return 0; }
    io.log(`policy PASS — schema ${r.policy.schema}, mode=${r.mode} (nguồn: ${r.sources.mode}) · root: ${root}`);
    return 0;
  }

  if (command === 'gate') {
    const r = runGate({ root, config: loadConfig(root).config, out: opts.out });
    for (const l of r.lines) (r.fail ? io.error : io.log)(l);
    return r.code;
  }

  if (command === 'stamp') {
    const mode = flags.has('--verify-formula') ? 'verify' : (positional[1] ? 'compare' : 'print');
    const r = runStamp({ root, ledgerPath: positional[1], mode });
    for (const l of r.lines) (r.code === 0 ? io.log : io.error)(l);
    return r.code;
  }

  if (command === 'spec') {
    const r = checkSpecs({ root, target: positional[1], allowRemovals: flags.has('--allow-removals') });
    for (const l of r.lines) (r.fail ? io.error : io.log)(l);
    return r.fail ? 1 : 0;
  }

  if (command === 'changelog') {
    // `--last N`: parseArgs xếp `--last` vào flags và `N` vào positional ⇒ số nằm ở positional[1],
    // cùng chỗ với tham số ngày. Có cờ thì đọc là N, không có thì đọc là ngày.
    const last = flags.has('--last') ? Number(positional[1] ?? 10) : null;
    if (last !== null && !Number.isFinite(last)) {
      io.error(`cc-harness changelog: --last cần một SỐ (nhận được "${positional[1]}")`);
      return 2;
    }
    const r = viewChangelog({
      root,
      day: last ? undefined : positional[1],
      last: last || undefined,
      today: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
    });
    for (const w of r.warnings) io.error(w);
    for (const l of r.lines) io.log(l);
    return 0;
  }

  if (command === 'doctor') {
    const r = doctor({ root, pluginRoot });
    for (const l of r.lines) io.log(l);
    return r.fail ? 1 : 0;
  }

  if (command === 'config') {
    if (!flags.has('--check')) { io.error(`cc-harness config: cần --check\n\n${USAGE}`); return 2; }
    const r = loadConfig(root);
    printDiag(r);
    if (r.ok) io.log(`✔ ${r.path} hợp lệ${r.warnings.length ? ` (${r.warnings.length} cảnh báo)` : ''}`);
    return r.ok ? 0 : 1;
  }

  if (command === 'rules') {
    if (!pluginRoot) {
      io.error('cc-harness rules: không biết ROOT của plugin — truyền --plugin-root hoặc đặt CLAUDE_PLUGIN_ROOT.');
      return 2;
    }

    if (flags.has('--list-sections')) {
      let base;
      try {
        base = fs.readFileSync(path.join(pluginRoot, BASE_REL), 'utf8');
      } catch (e) {
        io.error(`không đọc được ${path.join(pluginRoot, BASE_REL)} (${(e && e.code) || e})`);
        return 1;
      }
      const { sections, errors } = listSections(base);
      for (const s of sections) io.log(`${s.id.padEnd(34)} ${'  '.repeat(s.level - 2)}${s.heading}  [${s.tier}]`);
      for (const e of errors) io.error(`  ✖ ${e.message}`);
      return errors.length ? 1 : 0;
    }

    const r = renderRules({ root, pluginRoot, useCache: !flags.has('--no-cache') });

    // Bảng tra + in một mục đều chạy trên bản ĐÃ TRỘN, không trên base: dự án override một mục thì
    // thứ agent tra được phải là bản của dự án, không phải bản gốc.
    if (flags.has('--index')) {
      if (r.text === null) { printDiag(r); return 1; }
      const { sections } = listSections(r.text);
      io.log(buildIndex(sections.filter((s) => s.level === 2 && s.tier !== 'core')));
      const core = sections.filter((s) => s.level === 2 && s.tier === 'core').map((s) => s.id);
      io.log(`\nBơm sẵn mỗi phiên (tầng core): ${core.length ? core.join(' · ') : '(không có — bất thường, xem cảnh báo)'}`);
      printDiag(r);
      return 0;
    }

    // `rules §2` — id đi ở positional, không phải cờ. Nhận cả `§2` và `2` cho đỡ phải gõ ký tự §.
    const wanted = positional[1];
    if (wanted && !wanted.startsWith('--')) {
      if (r.text === null) { printDiag(r); return 1; }
      const id = wanted.startsWith('§') ? wanted : `§${wanted}`;
      const got = getSection(r.text, id);
      if (!got.ok) {
        const hint = nearestId(id, got.ids);
        io.error(`cc-harness rules: không có mục "${id}"${hint ? ` — ý bạn là "${hint}"?` : ''}\n\nBảng mục: cc-harness rules --index`);
        return 2;
      }
      io.log(got.text);
      printDiag(r);
      return 0;
    }

    if (flags.has('--diff')) {
      if (!r.applied.length && !r.removed.length && !r.errors.length) {
        io.log(`Không có override — bộ luật y hệt base (${BASE_REL}).`);
      }
      for (const a of r.applied) io.log(`  ${a.op.padEnd(8)} ${a.section}`);
      for (const rm of r.removed) io.log(`  ⚠ GỠ      ${rm.section} — ${rm.reason}`);
      printDiag(r);
      return r.errors.length ? 1 : 0;
    }

    if (flags.has('--show')) {
      if (r.text !== null) io.log(r.text);
      printDiag(r);
      return r.errors.length ? 1 : 0;
    }

    io.error(`cc-harness rules: cần --show, --diff hoặc --list-sections\n\n${USAGE}`);
    return 2;
  }

  io.error(`cc-harness: không biết lệnh "${command}".\n\n${USAGE}`);
  return 2;
}

// Chỉ chạy khi được gọi trực tiếp — import trong test thì không tự thực thi.
// `fileURLToPath` ở đây CHỈ để nhận ra "tôi có phải entry point không". Nó KHÔNG dùng để suy ra
// root của dự án hay của plugin — hai gốc đó luôn đến từ tham số/biến môi trường (luật 8).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) { // self-locate-ok: chỉ để nhận ra mình có phải entry không, KHÔNG suy root dự án
  process.exit(main(process.argv.slice(2)));
}
