// spec.mjs — `cc-harness spec`. Cổng format spec hành vi + guard mất-mát scenario.
//
// CỔNG (được exit ≠ 0), nên mọi nhánh "không kiểm được" phải NÓI RA: gate xanh mà chẳng kiểm gì là
// lớp lỗi đắt nhất. Riêng thiếu git (⇒ không có chỗ giữ bản nền) là điều kiện MÔI TRƯỜNG ⇒ WARN chứ không FAIL, kẻo chặn
// task oan mỗi lần ai đó chạy trên cây chưa git-init.
//
// Phần PURE (parseSpec · guardVerdict · classify*) port nguyên vẹn từ bộ khung — mỗi nhánh trong đó
// là một bug đã trả giá, đừng "dọn cho gọn" mà không đọc lý do kèm theo.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { gitTreeStatus } from './git.mjs';

const MAX_REQ_CHARS = 500;
const MAX_FILE_LINES = 150;
const MIN_PURPOSE_CHARS = 50;

// ═══════════════════════════ PURE ═══════════════════════════════════════════

/** @param {string} rel @returns {'readme'|'spec'|'misplaced'} */
export function classifySpecPath(rel) {
  const norm = rel.split(path.sep).join('/');
  if (norm === 'specs/README.md') return 'readme';
  if (/^specs\/[^/]+\/spec\.md$/.test(norm)) return 'spec';
  return 'misplaced';
}

/**
 * Neo cho `classifySpecPath` khi quét một thư mục: cha của segment `specs` gần nhất trên `target`
 * ⇒ rel luôn có dạng `specs/<cap>/…` dù target là `specs/` hay `specs/<cap>/`. Neo theo CHA của
 * target (bản cũ) làm `spec-check specs/<cap>/` báo MỌI file là "lạc chỗ" — sai lệch cho một cách
 * gõ hoàn toàn tự nhiên.
 */
export function classifyAnchor(target) {
  const parts = target.split(path.sep);
  const i = parts.lastIndexOf('specs');
  return i === -1 ? path.dirname(target) : parts.slice(0, i).join(path.sep) || path.sep;
}

/**
 * Parse 1 spec markdown → model + lỗi/cảnh báo format.
 * @returns {{requirements:object[], errors:{line:number,msg:string}[], warnings:{line:number,msg:string}[]}}
 */
export function parseSpec(text) {
  const lines = text.split('\n');
  const errors = [];
  const warnings = [];
  const requirements = [];
  const seenReq = new Set();
  let cur = null;
  let sc = null;
  let purpose = null;
  let sawPurpose = false;

  const closeScenario = () => {
    if (!sc) return;
    if (!/\bWHEN\b/.test(sc.body) || !/\bTHEN\b/.test(sc.body))
      errors.push({ line: sc.line, msg: `Scenario "${sc.name}" thiếu WHEN/THEN` });
    if (cur) cur.scenarios.push({ name: sc.name });
    sc = null;
  };
  const closeReq = () => {
    closeScenario();
    if (!cur) return;
    // Khối mở bởi heading LỖI (trống tên) chỉ tồn tại để scenario bên dưới có chỗ attach — heading
    // đã báo một lần rồi; kiểm SHALL/scenario cho một cái tên không tồn tại là lỗi dây chuyền.
    if (cur.broken) { cur = null; return; }
    const stmt = cur.statement.trim();
    if (!/\b(SHALL|MUST)\b/.test(stmt))
      errors.push({ line: cur.line, msg: `Requirement "${cur.name}" thiếu SHALL/MUST` });
    if (cur.scenarios.length === 0)
      errors.push({ line: cur.line, msg: `Requirement "${cur.name}" không có #### Scenario:` });
    if (stmt.length > MAX_REQ_CHARS)
      warnings.push({ line: cur.line, msg: `Requirement "${cur.name}" dài ${stmt.length} > ${MAX_REQ_CHARS} ký tự` });
    requirements.push({ name: cur.name, statement: stmt, scenarios: cur.scenarios, line: cur.line });
    cur = null;
  };
  const closePurpose = () => {
    if (purpose === null) return;
    const p = purpose.trim();
    if (p.length < MIN_PURPOSE_CHARS)
      warnings.push({ line: 0, msg: `Purpose quá ngắn (${p.length} < ${MIN_PURPOSE_CHARS} ký tự)` });
    purpose = null;
  };

  lines.forEach((line, i) => {
    const ln = i + 1;
    const head = line.match(/^(#{1,6})\s+(.*\S)\s*$/);
    if (head) {
      const [, hashes, titleRaw] = head;
      const title = titleRaw.trim();
      if (/^(ADDED|MODIFIED|REMOVED|RENAMED)\b/.test(title))
        errors.push({ line: ln, msg: `Section delta "${title}" cấm trong specs/ chính — delta chỉ ở ledger + git diff` });
      // Heading ĐÚNG từ khoá mà TRỐNG tên: hai regex dưới đòi `(.+)` nên `### Requirement:` không
      // khớp nhánh nào, rơi vào "heading khác" và bị bỏ qua KHÔNG một lời nào ⇒ spec thiếu tên vẫn
      // PASS (false-negative im lặng).
      const emptyName = title.match(/^(Requirement|Scenario):\s*$/);
      if (emptyName) {
        errors.push({ line: ln, msg: `${emptyName[1]} thiếu tên sau dấu ":" — heading phải là "${emptyName[1]}: <tên ngắn>"` });
        // ĐÓNG khối đang mở trước khi bỏ qua heading này: `return` trơn để khối cũ MỞ TIẾP làm
        // scenario nằm dưới heading trống tên attach vào Requirement TRƯỚC đó, nuốt luôn lỗi
        // "Requirement đó không có Scenario" — một heading sai làm CÂM một lỗi thật khác.
        if (emptyName[1] === 'Requirement') {
          closePurpose(); closeReq();
          cur = { name: '', statement: '', scenarios: [], line: ln, broken: true };
        } else closeScenario();
        return;
      }
      const scM = title.match(/^Scenario:\s*(.+)$/);
      if (scM) {
        closeScenario();
        if (hashes.length !== 4)
          errors.push({ line: ln, msg: `Scenario "${scM[1]}" sai heading level (${hashes.length} dấu #, phải đúng 4)` });
        if (!cur)
          errors.push({ line: ln, msg: `Scenario "${scM[1]}" nằm ngoài mọi Requirement` });
        sc = { name: scM[1], line: ln, body: '' };
        return;
      }
      const reqM = title.match(/^Requirement:\s*(.+)$/);
      if (reqM) {
        closePurpose(); closeReq();
        if (hashes.length !== 3)
          errors.push({ line: ln, msg: `Requirement "${reqM[1]}" sai heading level (${hashes.length} dấu #, phải đúng 3)` });
        const name = reqM[1];
        if (seenReq.has(name)) errors.push({ line: ln, msg: `Requirement trùng tên "${name}"` });
        seenReq.add(name);
        cur = { name, statement: '', scenarios: [], line: ln }; // vẫn mở block để tránh lỗi dây chuyền
        return;
      }
      if (/^Purpose$/i.test(title)) { closeReq(); purpose = ''; sawPurpose = true; return; }
      closePurpose(); closeReq(); // heading khác ⇒ đóng khối đang mở
      return;
    }
    if (sc) sc.body += line + '\n';
    else if (cur) cur.statement += ' ' + line;
    else if (purpose !== null) purpose += line + '\n';
  });
  closePurpose(); closeReq();

  if (!sawPurpose) warnings.push({ line: 0, msg: 'Thiếu section ## Purpose' });
  const lineCount = text.endsWith('\n') ? lines.length - 1 : lines.length;
  if (lineCount > MAX_FILE_LINES)
    warnings.push({ line: 0, msg: `File dài ${lineCount} > ${MAX_FILE_LINES} dòng — tín hiệu tách capability` });
  return { requirements, errors, warnings };
}

/** So model NỀN (lượt xanh gần nhất) với model mới → danh sách mất mát. */
export function guardVerdict(oldModel, newModel) {
  const losses = [];
  const newReq = new Map(newModel.requirements.map((r) => [r.name, r]));
  for (const oldR of oldModel.requirements) {
    const nr = newReq.get(oldR.name);
    if (!nr) { losses.push({ msg: `Requirement "${oldR.name}" biến mất so với bản nền` }); continue; }
    const newSc = new Set(nr.scenarios.map((s) => s.name));
    for (const o of oldR.scenarios)
      if (!newSc.has(o.name))
        losses.push({ msg: `Scenario "${o.name}" (trong Requirement "${oldR.name}") biến mất so với bản nền` });
  }
  return losses;
}

// ═══════════════════════════ IO ═════════════════════════════════════════════

function collectSpecFiles(target) {
  if (fs.statSync(target).isFile()) return [target];
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.md')) out.push(full);
    }
  };
  walk(target);
  return out;
}

/**
 * Nơi giữ BẢN NỀN để so mất-mát scenario: `<git-dir>/cc-harness/spec-snapshot/<rel>`.
 *
 * VÌ SAO KHÔNG DÙNG `git show HEAD:` NỮA: từ v1.1.0, `specs/` là LOCAL-ONLY — không commit, không
 * push (spec md outdate nhanh trong lúc làm nhanh, và một spec outdate trên remote tệ hơn không có:
 * người sau tin nó). Nhưng phép so cũ đọc bản cũ bằng `git show HEAD:<tệp>`, nên tệp đã gitignore
 * ⇒ không có bản HEAD ⇒ nhánh "spec MỚI ⇒ im lặng" nhận MỌI lượt ⇒ **guard mất-mát chết CÂM vĩnh
 * viễn**. Đúng lớp lỗi xanh-mà-không-kiểm-gì mà cổng này sinh ra để chống.
 *
 * `<git-dir>` chứ không phải `<root>/.cc-harness`: git không track nội dung `.git/`, nên bản nền
 * không thể lỡ lên remote. Mỗi worktree có `git-dir` riêng ⇒ bản nền theo đúng clone đang làm.
 */
function snapshotDir(root) {
  const r = spawnSync('git', ['-C', root, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return path.join(String(r.stdout).trim(), 'cc-harness', 'spec-snapshot');
}

/** Đường dẫn bản nền của một spec. Giữ nguyên cây thư mục cho dễ soi bằng mắt. */
function snapshotPath(dir, root, absFile) {
  const rel = path.relative(root, absFile);
  // Tệp NGOÀI root: đừng để `..` leo ra khỏi thư mục snapshot. Phẳng hoá và giữ dấu vết.
  const safe = rel.split(path.sep).map((x) => (x === '..' ? '__up__' : x)).join(path.sep);
  return path.join(dir, safe);
}

/**
 * Bản NỀN của một spec (lượt `cc-harness spec` xanh gần nhất).
 *
 * Trả `{text, why}` chứ không chỉ `null`: `null` nghĩa "bỏ qua guard", gộp MỌI lý do vào đó thì chỉ
 * ĐỔI CHỖ im lặng. Chưa có bản nền (spec MỚI, hoặc lượt đầu sau khi đổi cơ chế) ⇒ `why=null` và
 * người gọi in một dòng `ℹ` — im hẳn thì không phân biệt được "lượt đầu" với "guard hỏng".
 */
function baselineVersion(dir, root, absFile) {
  if (!dir) {
    return { text: null, why: null, first: false, nodir: true };
  }
  try {
    return { text: fs.readFileSync(snapshotPath(dir, root, absFile), 'utf8'), why: null, first: false };
  } catch (e) {
    if (e && e.code === 'ENOENT') return { text: null, why: null, first: true };
    return { text: null, why: `không đọc được bản nền để so (${(e && e.code) || e}) — guard mất-mát KHÔNG chạy cho tệp này`, first: false };
  }
}

/**
 * Ghi bản nền. CHỈ gọi khi tệp này lượt này SẠCH — không lỗi format, và không mất mát chưa được
 * duyệt. Ghi khi đang có mất mát chưa duyệt là biến chính sự mất mát đó thành bản nền mới, và lượt
 * sau sẽ xanh: guard tự vô hiệu hoá mình. Đây là bất biến quan trọng nhất của cơ chế snapshot.
 */
function writeBaseline(dir, root, absFile, text) {
  if (!dir) return null;
  const dest = snapshotPath(dir, root, absFile);
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, text);
    return null;
  } catch (e) {
    return `không ghi được bản nền tại ${dest} (${(e && e.code) || e}) — lượt sau guard mất-mát sẽ coi đây là spec MỚI`;
  }
}

/**
 * @param {{root:string, target?:string, allowRemovals?:boolean}} o
 * @returns {{fail:boolean, lines:string[], errorCount:number, warnCount:number, validated:number}}
 */
export function checkSpecs({ root, target: targetArg, allowRemovals = false }) {
  const lines = [];
  const target = targetArg ? path.resolve(targetArg) : path.join(root, 'specs');

  if (!fs.existsSync(target)) {
    lines.push(`spec: chưa có ${path.relative(root, target) || target} — không có spec nào (OK, ratchet) · root: ${root}`);
    return { fail: false, lines, errorCount: 0, warnCount: 0, validated: 0 };
  }

  const single = fs.statSync(target).isFile();
  const files = collectSpecFiles(target);
  let errorCount = 0;
  let warnCount = 0;
  let validated = 0; // file THỰC được validate — `files.length` tính cả specs/README.md bị skip

  // Bản NỀN sống ở `<git-dir>/cc-harness/spec-snapshot/`, KHÔNG ở HEAD — xem `snapshotDir()`.
  // Vẫn cần git: không có repo thì không có `git-dir` để giữ bản nền ở ngoài cây làm việc.
  const gitDir = single ? path.dirname(target) : target;
  const { status: treeStatus, why: treeWhy } = gitTreeStatus(gitDir);
  const snapDir = treeStatus === 'no-repo' ? null : snapshotDir(root);
  if (!snapDir) {
    lines.push(`⚠ guard scenario-loss KHÔNG chạy được: ${treeWhy || 'không phân giải được git-dir'} tại ${gitDir}`
      + ' — lượt này KHÔNG bắt được requirement/scenario bị XOÁ, và KHÔNG ghi được bản nền cho lượt sau');
    warnCount++;
  }

  for (const abs of files) {
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (!single) {
      const relClassify = path.relative(classifyAnchor(target), abs).split(path.sep).join('/');
      const cls = classifySpecPath(relClassify);
      if (cls === 'readme') continue;
      if (cls === 'misplaced') {
        lines.push(`✖ ${rel}: spec lạc chỗ — phải là specs/<capability>/spec.md (hoặc specs/README.md)`);
        errorCount++;
        continue;
      }
    }
    validated++;
    const text = fs.readFileSync(abs, 'utf8');
    const { errors, warnings } = parseSpec(text);
    for (const e of errors) { lines.push(`✖ ${rel}:${e.line}: ${e.msg}`); errorCount++; }
    for (const w of warnings) { lines.push(`⚠ ${rel}${w.line ? ':' + w.line : ''}: ${w.msg}`); warnCount++; }

    // snapDir === null ⇒ đã WARN một lần ở trên, không lặp lại cho từng tệp
    const base = baselineVersion(snapDir, root, abs);
    if (base.why) { lines.push(`⚠ ${rel}: ${base.why}`); warnCount++; }
    // Lượt ĐẦU của một spec: chưa có bản nền. Nói ra bằng `ℹ` (không tính WARN) — im hẳn thì không
    // phân biệt được "lượt đầu, bình thường" với "guard hỏng", và đó là chỗ lỗi câm từng sống.
    if (base.first) lines.push(`ℹ ${rel}: lượt đầu — chưa có bản nền để so mất-mát; bản nền sẽ được ghi sau lượt này`);
    let lost = 0;
    if (base.text !== null) {
      const losses = guardVerdict(parseSpec(base.text), parseSpec(text));
      lost = losses.length;
      if (losses.length && !allowRemovals) {
        for (const l of losses) lines.push(`✖ ${rel}: ${l.msg}`);
        lines.push('  ↳ Nếu chủ đích (đã khai REMOVED/RENAMED ở ledger mục SPEC): chạy lại với --allow-removals.');
        errorCount += losses.length;
      } else if (losses.length && allowRemovals) {
        for (const l of losses) lines.push(`ℹ (allow-removals) ${rel}: ${l.msg}`);
      }
    }

    // GHI BẢN NỀN — bất biến quan trọng nhất của cơ chế snapshot:
    // chỉ ghi khi tệp này lượt này SẠCH (không lỗi format) VÀ mất mát (nếu có) ĐÃ ĐƯỢC DUYỆT
    // (`--allow-removals`). Ghi khi đang có mất mát chưa duyệt là biến chính sự mất mát đó thành bản
    // nền mới ⇒ lượt sau xanh ⇒ guard tự vô hiệu hoá mình, IM LẶNG. Đó là cách một cổng chết mà
    // không ai biết, và nó tệ hơn không có cổng.
    const dirty = errors.length > 0 || (lost > 0 && !allowRemovals);
    if (!dirty) {
      const wErr = writeBaseline(snapDir, root, abs, text);
      if (wErr) { lines.push(`⚠ ${rel}: ${wErr}`); warnCount++; }
    }
  }

  if (errorCount > 0) {
    lines.push('');
    lines.push(`spec FAIL — ${errorCount} lỗi${warnCount ? `, ${warnCount} cảnh báo` : ''} · root: ${root}`);
    return { fail: true, lines, errorCount, warnCount, validated };
  }
  lines.push(`spec PASS — ${validated} file${warnCount ? `, ${warnCount} cảnh báo (exit 0)` : ''} · root: ${root}`);
  return { fail: false, lines, errorCount, warnCount, validated };
}
