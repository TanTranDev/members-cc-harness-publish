// gate.mjs — `cc-harness gate`. Chạy `gate.commands` TUẦN TỰ, thu exit code, ghi sổ bằng chứng.
//
// Đây là lệnh mà §0 bắt chạy ĐÚNG MỘT LẦN trên diff cuối, rồi vai đến sau (code-reviewer, main)
// đối soát HEAD/DIRTY thay vì chạy lại. Vì vậy nó phải fail-closed ở mọi chỗ: một cuốn sổ "xanh"
// sai còn tệ hơn không có sổ, bởi cả quy trình phía sau tin nó mà không kiểm lại.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';

import {
  canOverwrite, snapshot, renderLedger, dirtySnapshot, pathsChanged, eolOnlyDiff,
} from './gate-ledger.mjs';

const TAIL_LINES = 3;
const TAIL_COLS = 200;

/**
 * Vài dòng CUỐI, đủ để đọc — KHÔNG dán nguyên khối: sổ là BẰNG CHỨNG để đối soát, không phải log.
 * Dán nguyên khối làm sổ phình tới mức không ai đọc.
 */
const tailOf = (s) => s.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''))
  .filter((l) => l !== '').slice(-TAIL_LINES)
  .map((l) => (l.length > TAIL_COLS ? `${l.slice(0, TAIL_COLS)}…` : l));

/**
 * Output có phải TAP, và TAP đó có báo FAIL không?
 *
 * VÌ SAO CẦN: `node --test` **exit 0** khi lỗi ném ở thân `describe` — TAP in `not ok` nhưng
 * `# fail 0` và `$? = 0`. Một suite chết hoàn toàn vẫn trông như xanh với bất kỳ ai chỉ nhìn exit
 * code, và gate thì tồn tại để nhìn hộ. Đã đo thật trên Node 22.
 *
 * Chỉ kết luận khi CHẮC đây là TAP (`# tests N` hoặc dòng plan `1..N`) — nếu không thì một lệnh
 * bình thường in chữ "not ok" trong văn xuôi sẽ bị đánh trượt oan, và cổng báo động giả thì người
 * ta tắt cổng.
 * @returns {string|null} lý do FAIL, hoặc null nếu không phải TAP / TAP sạch
 */
export function tapVerdict(text) {
  const isTap = /^# tests \d+/m.test(text) || /^1\.\.\d+/m.test(text);
  if (!isTap) return null;
  const failLine = /^# fail (\d+)/m.exec(text);
  const failCount = failLine ? Number(failLine[1]) : 0;
  if (failCount > 0) return `TAP báo ${failCount} test fail`;
  if (/^not ok /m.test(text)) {
    return 'TAP có dòng `not ok` trong khi `# fail 0` — dấu hiệu lỗi ném ở thân describe (suite chết mà exit 0)';
  }
  return null;
}

/**
 * @param {{root:string, config?:object, out?:string, run?:Function}} o
 *   `run` chỉ để test tiêm — mặc định là spawnSync thật.
 * @returns {{fail:boolean, lines:string[], results:object[], wrote:string|null, code:number}}
 */
export function runGate({ root, config, out, run }) {
  const lines = [];
  const bail = (msg, code = 2) => {
    // Mọi lối thoát nêu ROOT ĐÃ DÙNG: chạy nhầm cây là nguyên nhân gốc hay gặp nhất.
    lines.push(`✖ gate: ${msg}`, `  root: ${root}`);
    return { fail: true, lines, results: [], wrote: null, code };
  };

  if (!out) {
    return bail('thiếu `--out <path>` — gate sinh LEDGER, không có đích ghi thì không có bằng chứng nào cả'
      + '\n  vd: cc-harness gate --out docs/wip/<lô>/verify.md');
  }
  if (out.startsWith('-')) {
    // Cùng lý lẽ với `--root`: giá trị mở đầu bằng `-` là CỜ, không phải path — nhận nó làm đường
    // dẫn thì sổ rơi vào một chỗ vô nghĩa mà không ai thấy. Path thật mở đầu `-` thì gõ `./-x`.
    return bail(`cờ --out cần một đường dẫn, nhận được "${out}"`);
  }

  const commands = config?.gate?.commands;
  if (!Array.isArray(commands) || commands.length === 0) {
    return bail('claude_config.json KHÔNG khai `gate.commands` ⇒ không có lệnh nào để chạy, mà ghi'
      + ' một cuốn sổ "xanh" cho 0 lệnh chính là false-green.'
      + '\n  sửa: thêm vào claude_config.json:'
      + '\n    "gate": { "commands": ["npm run typecheck", "npm run lint", "npm test"] }');
  }

  // Path tương đối tính theo ROOT (không theo cwd): chạy từ thư mục con vẫn ra ĐÚNG MỘT chỗ, khớp
  // với đường dẫn repo-relative mà §0 dùng để trỏ sổ.
  const outAbs = path.resolve(root, out);

  // GHI ĐÈ ở đây HUỶ DỮ LIỆU và `docs/wip/` đã gitignore ⇒ KHÔNG có bản git để khôi phục.
  // Từ chối TRƯỚC khi chạy lệnh nào: chạy hết tập kiểm rồi mới báo là phí cả lượt.
  if (fs.existsSync(outAbs)) {
    let cur = '';
    try {
      cur = fs.readFileSync(outAbs, 'utf8');
    } catch (e) {
      return bail(`đích ghi ĐÃ TỒN TẠI mà KHÔNG đọc được để kiểm an toàn: ${outAbs}\n  ${e.message}`);
    }
    if (!canOverwrite(cur)) {
      return bail(`đích ghi ĐÃ CÓ nội dung KHÔNG do gate dựng: ${outAbs}`
        + '\n  máy chỉ được đè sổ do chính nó dựng — đè thứ khác là xoá bằng chứng không khôi phục được.'
        + '\n  sửa: trỏ --out sang tệp khác, hoặc chuyển nội dung cũ đi nơi khác rồi chạy lại');
    }
  }

  // Sổ được GHI SAU khi chụp mốc. Nếu đích ghi KHÔNG bị bỏ qua, chính cuốn sổ trở thành một tệp
  // chưa-theo-dõi MỚI ⇒ vai đến sau tính lại mốc sẽ LỆCH: sổ tự vô hiệu trong khi mọi lệnh vẫn xanh.
  // BA trạng thái, KHÔNG hai: gộp "không bỏ qua" với "không hỏi được" là bỏ mất một lời khai.
  const ci = spawnSync('git', ['-C', root, 'check-ignore', '-q', path.relative(root, outAbs)], { stdio: 'ignore' });
  const outIgnore = ci.status === 0 ? 'yes' : ci.status === 1 ? 'no' : 'unknown';
  const ignoreWhy = ci.error ? ci.error.message : `git thoát ${ci.status}`;

  const exec = run ?? ((cmd) => spawnSync(cmd, { cwd: root, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

  // Mốc TRƯỚC — chụp NGAY TRƯỚC lệnh đầu tiên.
  //
  // Không có nó, gate KHÔNG phân biệt được "cây bẩn sẵn từ trước" với "chính lệnh của tôi vừa làm
  // bẩn". Mà gate là tool DUY NHẤT vừa chạy build vừa đo cây — nó nắm cả hai nửa bằng chứng, chụp
  // mỗi mốc SAU là tự vứt đi một nửa. Đã trả giá thật: một tệp sinh tự động được build ghi lại ở
  // mỗi lượt gate ⇒ ledger báo DIRTY trong khi nội dung y hệt HEAD, không ai biết vì sao.
  //
  // Cùng lớp lý lẽ với lưới `outIgnore` ngay trên: cả hai đều là "tác dụng phụ của gate làm hỏng
  // mốc của chính gate". Lưới kia canh cuốn sổ; lưới này canh dãy lệnh.
  const pre = dirtySnapshot(root);

  const results = [];
  for (const cmd of commands) {
    const r = exec(cmd);
    // GỘP stdout + stderr: tool của bộ khung in WARN ra stdout còn lỗi ra stderr — đọc một luồng
    // thì phần trích tóm tắt có thể im đúng lúc cần nói nhất.
    let text = String(r.stdout ?? '') + String(r.stderr ?? '');
    // `status` null/undefined = tiến trình KHÔNG chạy được (spawn fail) hoặc bị TÍN HIỆU giết. Cả
    // hai đều KHÔNG phải "pass": `?? 0` ở đây biến chúng thành exit 0 im lặng.
    let code = r.status;
    if (typeof code !== 'number') {
      code = -1;
      text += `\n[gate] không lấy được exit code: ${r.error ? r.error.message : `bị tín hiệu ${r.signal}`}`;
    }
    const tapWhy = code === 0 ? tapVerdict(text) : null;
    results.push({ cmd, code, tail: tailOf(text), tapFail: !!tapWhy, tapWhy });
    lines.push(`gate: ${cmd} → exit ${code}${tapWhy ? `  ⚠ ${tapWhy}` : ''}`);
  }

  // Chụp mốc — BƯỚC CUỐI CÙNG, sau khi MỌI lệnh đã chạy xong.
  const { head, dirty, why: snapWhy } = snapshot(root);

  // Chẩn đoán thêm. Toàn bộ khối này CHỈ ĐỌC và được bọc kín: nó KHÔNG được phép đổi mã thoát của
  // gate. Một phép chẩn đoán làm hỏng cổng nó đang phục vụ thì tệ hơn hẳn việc không có nó.
  let gateTouched = null;
  let eolOnly = null;
  let diagWhy = '';
  let headMoved = false;
  try {
    const post = dirtySnapshot(root);
    if (!pre.map || !post.map) diagWhy = pre.why || post.why || 'không rõ nguyên nhân';
    else {
      gateTouched = pathsChanged(pre.map, post.map);
      headMoved = Boolean(pre.head && post.head && pre.head !== post.head);
    }
    eolOnly = eolOnlyDiff(root);
  } catch (e) {
    diagWhy = e instanceof Error ? e.message.split('\n')[0] : String(e);
    gateTouched = null;
  }
  // Mốc chính đã hỏng ⇒ gate đã fail-closed và nói lý do ở dưới. Nhắc lại cùng một nguyên nhân ở
  // dòng chẩn đoán là thêm chữ chứ không thêm tin.
  if (snapWhy) diagWhy = '';

  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, renderLedger({
    root, results, head, dirty, why: snapWhy, outIgnore, ignoreWhy,
    gateTouched, eolOnly, diagWhy, headMoved,
  }));
  lines.push(`gate: sổ → ${outAbs}`, `  root: ${root}`);

  if (headMoved) {
    lines.push('⚠ gate: lệnh gate đã ĐỔI HEAD giữa chừng ⇒ mốc trong sổ là mốc SAU khi nó đổi.');
  }
  if (gateTouched && gateTouched.length) {
    const shown = gateTouched.slice(0, 5);
    const more = gateTouched.length - shown.length;
    lines.push(`⚠ gate: CHÍNH lệnh gate vừa làm bẩn cây — ${gateTouched.length} tệp: `
      + `${shown.join(' · ')}${more > 0 ? ` · … (+${more})` : ''}`);
    lines.push('  Sinh lại tệp ĐÃ THEO DÕI ở mỗi lượt gate ⇒ ledger báo DIRTY dù nội dung có thể y'
      + ' hệt HEAD. Chọn một: gitignore chúng · commit bản mới · nếu chỉ khác line-endings thì sửa'
      + ' quy tắc `text` trong `.gitattributes` (`cc-harness doctor` chỉ đúng chỗ).');
  }
  if (eolOnly === true) {
    lines.push('⚠ gate: toàn bộ diff của tệp ĐÃ THEO DÕI chỉ là CR cuối dòng — nội dung y hệt HEAD.');
  }
  if (diagWhy) {
    lines.push(`⚠ gate: KHÔNG so được mốc trước/sau (${diagWhy}) ⇒ lưới "lệnh gate có tự làm bẩn cây`
      + ' không" KHÔNG chạy ở lượt này.');
  }

  if (outIgnore === 'no') {
    lines.push(`⚠ gate: ${outAbs} KHÔNG bị cấu hình theo dõi tệp bỏ qua ⇒ sổ vừa ghi tự làm DIRTY ở`
      + ' trên lệch; vai đến sau sẽ đọc thành LEDGER-STALE. Đặt sổ vào thư mục đã bỏ qua (vd docs/wip/).');
  } else if (outIgnore === 'unknown') {
    lines.push(`⚠ gate: KHÔNG hỏi được cấu hình theo dõi tệp về ${outAbs} (${ignoreWhy}) ⇒ lưới "sổ có`
      + ' tự làm DIRTY lệch không" KHÔNG chạy ở lượt này.');
  }

  const bad = results.filter((r) => r.code !== 0 || r.tapFail);
  // Mốc hỏng ⇒ sổ THIẾU chỗ đối soát ⇒ nó hết là bằng chứng: fail-closed, không báo xanh.
  if (snapWhy) {
    lines.push(`✖ gate: KHÔNG chụp được mốc HEAD/DIRTY (${snapWhy}) — sổ thiếu chỗ đối soát nên vai`
      + ' đến sau KHÔNG trích được. Chạy lại trong một cây git ĐÃ có bản ghi.');
  }
  if (bad.length) {
    lines.push(`✖ gate: ${bad.length}/${results.length} lệnh KHÔNG đạt —`
      + ` ${bad.map((r) => `${r.cmd} (${r.tapFail ? 'TAP fail' : r.code})`).join(' · ')}`);
  }

  const fail = bad.length > 0 || !!snapWhy;
  return { fail, lines, results, wrote: outAbs, code: fail ? 1 : 0 };
}
