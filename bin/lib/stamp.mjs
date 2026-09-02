// stamp.mjs — `cc-harness stamp`. Mốc HEAD/DIRTY: in ra, đối soát với một cuốn sổ, hoặc tự kiểm
// hai cách tính còn khớp nhau không.
//
// VÌ SAO CÓ LỆNH NÀY. §10 bảo vai đến sau "chạy lại 2 lệnh HEAD/DIRTY để đối chiếu" bằng một
// đường ống shell gõ tay. Đường đó có BA bẫy, cả ba đều đã đo được, và cả ba đều hỏng theo hướng
// im lặng — người ta đọc "lệch" thành "code đã đổi" rồi chạy lại gate, thay vì thành "tôi gõ sai":
//
//   1. NỀN TẢNG — Git Bash/Windows in `shasum <f>` thành `<sha> *<f>` chứ không `<sha>  <f>` ⇒
//      công thức đời đầu KHÔNG BAO GIỜ khớp sổ ở Windows;
//   2. THƯ MỤC — công thức phụ thuộc thư mục hiện hành; chạy ở thư mục con cho hash khác (§10 đã
//      phải cảnh báo bằng chữ, tức là đang nhờ người nhớ hộ);
//   3. CHÉP TAY — hai hash 40 ký tự so bằng mắt.
//
// Lệnh này gọi ĐÚNG hàm mà `cc-harness gate` dùng để ghi sổ, nên cả ba bẫy biến mất cùng lúc: cùng
// một `snapshot()`, root do máy phân giải, và máy so chứ không phải mắt.
//
// `root` NHẬN QUA THAM SỐ — file sống trong plugin nhưng nói về cây của người dùng.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { snapshot, dirtySnapshot, DIRTY_FORMULA } from './gate-ledger.mjs';

const SHOWN = 5;

/**
 * Đọc mốc MÁY-ĐỌC từ nội dung một cuốn sổ.
 *
 * Chỉ nhận hai dòng ở dạng `HEAD:  <giá trị>` / `DIRTY: <giá trị>` — CỐ Ý không nhận `GATE-AT`,
 * vì dòng đó là mốc TRƯỚC review, không phải mốc của diff cuối. Nhận nhầm nó là đối soát với sai
 * cột mốc rồi báo KHỚP.
 *
 * `KHÔNG XÁC ĐỊNH — …` là giá trị HỢP LỆ mà `renderLedger` ghi khi không chụp được mốc ⇒ phải
 * nhận ra và nói "sổ này không có mốc dùng được", KHÔNG được coi như một hash rồi so.
 *
 * @returns {{head:string|null, dirty:string|null, why:string}}
 */
export function parseStamp(text) {
  const pick = (key) => {
    const m = new RegExp(`^${key}:[ \\t]+(.+)$`, 'm').exec(text);
    if (!m) return null;
    const v = m[1].trim();
    return v.startsWith('KHÔNG XÁC ĐỊNH') ? null : v.split(/\s/)[0];
  };
  const head = pick('HEAD');
  const dirty = pick('DIRTY');
  if (head && dirty) return { head, dirty, why: '' };
  const missing = [!head && 'HEAD', !dirty && 'DIRTY'].filter(Boolean).join(' + ');
  return {
    head,
    dirty,
    why: `sổ KHÔNG có mốc ${missing} dùng được (thiếu dòng, hoặc ghi "KHÔNG XÁC ĐỊNH")`,
  };
}

/** Vài đường dẫn đầu, kèm đuôi `… (+N)` — cùng quy ước với ledger, để hai nơi đọc giống nhau. */
function brief(paths) {
  const shown = paths.slice(0, SHOWN);
  const more = paths.length - shown.length;
  return `${shown.join(' · ')}${more > 0 ? ` · … (+${more})` : ''}`;
}

/**
 * @param {{root:string, ledgerPath?:string, mode?:'print'|'compare'|'formula'|'verify'}} o
 * @returns {{lines:string[], code:number}}
 */
export function runStamp({ root, ledgerPath, mode }) {
  const lines = [];
  // Mọi lối ra nêu ROOT ĐÃ DÙNG (§0) — chạy nhầm cây là nguyên nhân gốc hay gặp nhất, và ở lệnh
  // này nó còn là một trong ba bẫy mà lệnh sinh ra để dẹp.
  const withRoot = (code) => { lines.push(`  root: ${root}`); return { lines, code }; };

  if (mode === 'formula') {
    // In THÔ, không trang trí: giá trị của nó là dán thẳng vào shell được.
    lines.push(DIRTY_FORMULA);
    return { lines, code: 0 };
  }

  if (mode === 'verify') return verifyFormula(root, lines, withRoot);

  const { head, dirty, why } = snapshot(root);
  if (why) {
    // Fail-closed: mốc là thứ DUY NHẤT lệnh này sinh ra. Không chụp được mà exit 0 thì người gọi
    // đọc "im lặng" thành "không có gì bất thường" — đúng lớp lỗi §0 gọi là đắt nhất.
    lines.push(`✖ stamp: KHÔNG chụp được mốc HEAD/DIRTY (${why})`);
    lines.push('  Chạy trong một cây git ĐÃ có bản ghi, hoặc truyền --root đúng cây.');
    return withRoot(1);
  }

  lines.push(`HEAD:  ${head}`, `DIRTY: ${dirty}`);
  if (mode !== 'compare') return withRoot(0);

  let text;
  try {
    text = fs.readFileSync(path.resolve(root, ledgerPath), 'utf8');
  } catch (e) {
    lines.push(`✖ stamp: KHÔNG đọc được sổ ${ledgerPath} — ${e.message}`);
    return withRoot(2);
  }

  const want = parseStamp(text);
  if (want.why) {
    lines.push(`✖ stamp: ${want.why} ⇒ KHÔNG đối soát được, và "không đối soát được" KHÔNG phải`
      + ' "khớp". Chạy `cc-harness gate` để sinh sổ mới.');
    return withRoot(1);
  }

  const headSame = want.head === head;
  const dirtySame = want.dirty === dirty;
  if (headSame && dirtySame) {
    lines.push(`✔ stamp: KHỚP sổ ${ledgerPath} ⇒ trích sổ làm bằng chứng, KHÔNG chạy lại gate.`);
    return withRoot(0);
  }

  lines.push(`✖ stamp: LỆCH sổ ${ledgerPath} ⇒ gate phải chạy LẠI và ghi sổ mới.`);
  if (!headSame) {
    lines.push(`  HEAD  sổ ${want.head} ≠ hiện tại ${head} — đã có commit sau khi gate chạy.`);
  }
  if (!dirtySame) {
    lines.push(`  DIRTY sổ ${want.dirty} ≠ hiện tại ${dirty} — cây làm việc đã đổi sau khi gate chạy.`);
    // Danh sách này là TRẠNG THÁI HIỆN TẠI, KHÔNG phải "những gì đã đổi so với sổ": sổ chỉ giữ một
    // hash, không giữ danh sách, nên không có cách nào tính được hiệu hai bên. Nói sai chỗ này là
    // đưa người ta đi soi nhầm tệp — nên câu chữ phải nêu đúng thứ nó là.
    const cur = dirtySnapshot(root);
    if (cur.map && cur.map.size) lines.push(`  cây ĐANG bẩn ở (trạng thái hiện tại, không phải hiệu với sổ): ${brief([...cur.map.keys()])}`);
    else if (cur.why) lines.push(`  (không liệt kê được đường dẫn đang bẩn: ${cur.why})`);
  }
  return withRoot(1);
}

/**
 * Chạy công thức shell chuẩn rồi so với `dirtyHash`. Đây là LƯỚI cho cặp "hai cách tính cùng một
 * giá trị": một bên là hằng số shell, một bên là mã Node, và không có gì bắt buộc chúng khớp ngoài
 * trí nhớ của người sửa. Đã lệch thật một lần (dấu phân cách của `shasum` khác nhau giữa các nền
 * tảng) và không ai biết cho tới khi có người đi đối soát bằng tay.
 */
function verifyFormula(root, lines, withRoot) {
  const { dirty, why } = snapshot(root);
  if (why) {
    lines.push(`✖ stamp --verify-formula: KHÔNG chụp được mốc bằng máy (${why}) ⇒ không có gì để so.`);
    return withRoot(1);
  }
  // PHẢI `bash -c`, KHÔNG `shell: true`: trên Windows `shell: true` gọi cmd.exe, mà cmd.exe không
  // hiểu đường ống POSIX ⇒ lệnh chết vì lý do KHÔNG liên quan gì tới thứ đang kiểm.
  const r = spawnSync('bash', ['-c', DIRTY_FORMULA], { cwd: root, encoding: 'utf8' });
  if (r.error || typeof r.status !== 'number') {
    lines.push('⚠ stamp --verify-formula: KHÔNG chạy được `bash` ⇒ lưới "hai cách tính còn khớp'
      + ` không" KHÔNG chạy ở lượt này (${r.error ? r.error.message : `tín hiệu ${r.signal}`}).`);
    lines.push('  Không kiểm được KHÁC với đã kiểm — đừng đọc dòng này thành "khớp".');
    return withRoot(1);
  }
  const out = String(r.stdout ?? '').trim();
  if (r.status !== 0 || !/^[0-9a-f]{40}$/.test(out)) {
    lines.push(`⚠ stamp --verify-formula: công thức shell KHÔNG cho ra một sha1 (exit ${r.status}).`);
    const tail = String(r.stderr ?? '').trim().split('\n').filter(Boolean).slice(-2);
    for (const t of tail) lines.push(`    | ${t}`);
    lines.push('  Hay gặp nhất: máy thiếu `shasum`. Không kiểm được KHÁC với đã kiểm.');
    return withRoot(1);
  }
  if (out === dirty) {
    lines.push('✔ stamp --verify-formula: công thức shell và `dirtyHash` cho CÙNG một giá trị.');
    return withRoot(0);
  }
  lines.push('✖ stamp --verify-formula: HAI CÁCH TÍNH ĐÃ LỆCH — đây là lỗi của bộ khung, không phải của cây.');
  lines.push(`  shell     : ${out}`);
  lines.push(`  dirtyHash : ${dirty}`);
  lines.push('  Sửa MỘT trong hai cho khớp, rồi chạy lại. Bản in ở §10 là bản chép của'
    + ' `cc-harness stamp --formula` — chép lại luôn nếu vừa đổi công thức.');
  return withRoot(1);
}
