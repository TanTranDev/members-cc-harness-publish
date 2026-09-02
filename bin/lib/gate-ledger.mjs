// gate-ledger.mjs — phần THUẦN của `cc-harness gate`: chụp mốc cây làm việc, quyết định có được đè
// đích ghi hay không, và dựng phần máy-đọc của sổ bằng chứng.
//
// `root` NHẬN QUA THAM SỐ — file sống trong plugin nhưng nói về cây của người dùng.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * CHỮ KÝ của sổ do máy dựng. Đây là bộ phân biệt DUY NHẤT cho phép ghi đè, nên nó phải sống ở MỘT
 * chỗ: hai nơi giữ hai bản là đường để chúng lệch nhau rồi guard mở ra trong im lặng.
 */
export const SIG = 'sổ máy-đọc do `cc-harness gate` dựng';

/**
 * Có được ĐÈ nội dung này không? **FAIL-CLOSED**: chỉ đè thứ chính máy đã dựng.
 *
 * Bản đầu ở bộ khung làm NGƯỢC — đi tìm dấu hiệu "có phần khai của người" (mấy chuỗi của quy ước
 * HÔM NAY) rồi mới từ chối. Đo được: 38 sổ thật, **1 trượt cả bộ nhận diện** (sổ quy ước cũ) ⇒ bị đè,
 * mà `docs/wip/` đã gitignore nên KHÔNG có bản git để khôi phục. Bộ nhận diện theo quy ước hiện hành
 * luôn hở về phía QUÁ KHỨ ⇒ hướng mặc định phải là TỪ CHỐI.
 *
 * Rỗng/toàn khoảng trắng thì đè được: ở đó không có gì để mất. Đây KHÔNG phải kẽ hở — muốn qua cửa
 * này thì phải tự xoá dữ liệu trước, tức thiệt hại đã xảy ra rồi.
 */
export const canOverwrite = (text) => text.trim() === '' || text.includes(SIG);

const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');

/**
 * Chụp mốc cây làm việc. KHÔNG bắt lỗi hộ nơi gọi — nơi gọi quyết định fail-closed.
 * @returns {{head:string|null, dirty:string|null, why:string}}
 */
export function snapshot(root) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args],
    { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] });
  try {
    const head = String(git('rev-parse', 'HEAD')).trim();
    return { head, dirty: dirtyHash(root, git), why: '' };
  } catch (e) {
    return { head: null, dirty: null, why: e instanceof Error ? e.message.split('\n')[0] : String(e) };
  }
}

/**
 * NGUỒN SỰ THẬT của công thức shell tương đương `dirtyHash`. Bản in trong §10 là BẢN CHÉP để đọc;
 * bản chạy được là hằng số này, và `cc-harness stamp --verify-formula` chạy nó rồi so với
 * `dirtyHash` — nên hai cách tính không còn phải giữ khớp bằng mắt.
 *
 * ⚠️ Khác bản §10 ĐỜI ĐẦU ở đúng một chỗ, và chỗ đó là một BUG ĐÃ ĐO (2026-09-02, git 2.48,
 * Git Bash/Windows): `shasum <f>` in `<sha> *<f>` — dấu cách + DẤU SAO (chế độ nhị phân) — thay vì
 * `<sha>  <f>` hai dấu cách như macOS/Linux. Digest nội dung y hệt, nhưng một byte phân cách khác
 * là đủ làm hash NGOÀI lệch ⇒ ở Windows công thức cũ KHÔNG BAO GIỜ khớp sổ, tức hợp đồng "gate chạy
 * đúng một lần" âm thầm không áp trên nền tảng đó. Dựng lại dòng bằng `printf` cho ra byte giống
 * nhau ở MỌI nền tảng, và trên macOS thì KHÔNG đổi gì (ở đó `shasum` vốn đã in hai dấu cách).
 *
 * `awk '{print $1}'` ở ngoài cùng chỉ cắt phần hex khỏi `<sha>  -` — thứ mà người đọc vẫn tự cắt
 * bằng mắt. Nó làm giá trị in ra khớp ĐÚNG thứ `dirtyHash` trả về, không thêm phép biến đổi nào.
 */
export const DIRTY_FORMULA = "{ git diff HEAD; git ls-files --others --exclude-standard"
  + " | LC_ALL=C sort | while read -r f; do printf '%s  %s\\n'"
  + " \"$(shasum \"$f\" | awk '{print $1}')\" \"$f\"; done; } | shasum | awk '{print $1}'";

/**
 * DIRTY theo ĐÚNG công thức của §0 — hash NỘI DUNG, không phải danh sách đường dẫn:
 *   { git diff HEAD; git ls-files --others --exclude-standard | LC_ALL=C sort |
 *     while read -r f; do shasum "$f"; done; } | shasum
 * Phải khớp TỪNG BYTE với bản shell, vì vai đến sau đối soát bằng CHÍNH lệnh shell đó:
 *  • `LC_ALL=C sort` = thứ tự BYTE ⇒ so bằng `Buffer.compare`, KHÔNG dùng so chuỗi UTF-16 của JS
 *    (hai thứ lệch nhau ở ký tự ngoài BMP ⇒ hash lệch mà không ai đoán ra vì sao);
 *  • dòng mỗi tệp là `<sha1>  <f>\n` — HAI dấu cách; sai một dấu cách là lệch hash. Giữ nguyên hai
 *    dấu cách kể cả khi `shasum` ở máy bạn in khác (xem `DIRTY_FORMULA` ngay trên): bên phải sửa là
 *    phía shell, không phải phía này. `cc-harness stamp --verify-formula` canh hai bên còn khớp;

 *  • tệp không đọc được ⇒ bản shell in lỗi ra stderr và KHÔNG góp gì vào stdout ⇒ ta cũng bỏ qua
 *    để giữ khớp, nhưng NÓI RA.
 */
function dirtyHash(root, git) {
  const parts = [git('diff', 'HEAD')];
  const list = String(git('ls-files', '--others', '--exclude-standard')).split('\n').filter((f) => f !== '');
  list.sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')));
  for (const f of list) {
    let content;
    try {
      content = fs.readFileSync(path.join(root, f));
    } catch (e) {
      console.warn(`⚠ gate: tệp chưa-theo-dõi KHÔNG đọc được ⇒ bỏ qua, đúng như bản shell: ${f}`
        + ` — ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    parts.push(Buffer.from(`${sha1(content)}  ${f}\n`, 'utf8'));
  }
  return sha1(Buffer.concat(parts));
}

/**
 * Bản đồ `đường dẫn → chữ ký nội dung` cho MỌI tệp đang làm cây bẩn, kèm HEAD tại thời điểm chụp.
 *
 * KHÁC `dirtyHash`, và KHÔNG thay được cho nhau:
 *  • `dirtyHash` = MỘT hash cho cả cây. Nó là HỢP ĐỒNG với công thức shell ở §10 (vai đến sau đối
 *    soát bằng chính lệnh shell đó) ⇒ **CẤM đụng vào**;
 *  • bản đồ này = TỪNG đường dẫn, chỉ để so HAI thời điểm rồi nói ra đường dẫn nào đã lệch.
 *
 * Rẻ hơn `dirtyHash` một bậc vì chỉ đọc những tệp ĐANG bẩn, không đọc mọi tệp chưa-theo-dõi. Nhờ
 * vậy chụp thêm một mốc TRƯỚC khi chạy lệnh không làm gate chậm gấp đôi — nếu phải trả giá đó thì
 * phép chẩn đoán này không đáng, và người ta sẽ tắt nó.
 *
 * @returns {{head:string|null, map:Map<string,string>|null, why:string}}
 */
export function dirtySnapshot(root) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args],
    { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] });
  try {
    const head = String(git('rev-parse', 'HEAD')).trim();
    const lines = (out) => String(out).split('\n').filter((f) => f !== '');
    const paths = [
      ...lines(git('diff', '--name-only', 'HEAD')),
      ...lines(git('ls-files', '--others', '--exclude-standard')),
    ];
    const map = new Map();
    for (const f of paths) {
      // Tệp KHÔNG đọc được / đã xoá vẫn là một lệch ⇒ ghi bằng giá trị canh chừng, KHÔNG bỏ qua:
      // bỏ qua thì "lệnh gate xoá mất một tệp" trông y hệt "không có gì xảy ra".
      let sig;
      try { sig = sha1(fs.readFileSync(path.join(root, f))); }
      catch { sig = '∅ không đọc được / đã xoá'; }
      map.set(f, sig);
    }
    return { head, map, why: '' };
  } catch (e) {
    return { head: null, map: null, why: e instanceof Error ? e.message.split('\n')[0] : String(e) };
  }
}

/**
 * Đường dẫn có chữ ký KHÁC nhau giữa hai mốc — gồm cả xuất hiện mới lẫn biến mất.
 * Sắp theo thứ tự BYTE cho khớp quy ước của `dirtyHash` (so chuỗi UTF-16 của JS lệch ở ký tự
 * ngoài BMP). `null` = thiếu một trong hai mốc, tức KHÔNG so được — khác hẳn "so xong, không lệch".
 * @returns {string[]|null}
 */
export function pathsChanged(before, after) {
  if (!before || !after) return null;
  const out = [];
  for (const k of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(k) !== after.get(k)) out.push(k);
  }
  return out.sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')));
}

/**
 * Toàn bộ diff của tệp ĐÃ THEO DÕI có phải chỉ là CR ở cuối dòng không?
 *
 * Đây là câu trả lời cho đúng ca đã trả giá thật: cây báo DIRTY sau mỗi lần build trong khi nội
 * dung y hệt HEAD, chỉ khác quy ước xuống dòng. Không có dòng này thì `DIRTY: <hash>` là một con
 * số đục — người đọc biết cây bẩn mà không biết bẩn vì cái gì.
 *
 * @returns {boolean|null} `null` = không hỏi được git (KHÔNG phải "không có")
 */
export function eolOnlyDiff(root) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args],
    { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] });
  try {
    // Không có diff thì không có gì để nói — trả `false`, KHÔNG phải `true` (một diff RỖNG thoả
    // "rỗng sau khi bỏ qua CR" một cách tầm thường, và khai điều đó là khai một chuyện vô nghĩa).
    if (git('diff', 'HEAD').length === 0) return false;
    return git('diff', 'HEAD', '--ignore-cr-at-eol').length === 0;
  } catch {
    return null;
  }
}

/**
 * Dựng phần MÁY-ĐỌC của sổ. Phần KHAI là chữ của NGƯỜI và ở lại chính tệp này: `code-reviewer` đọc
 * mục khai TRƯỚC khi review, mà changelog thì viết SAU review — để khai ở changelog là tạo vòng lặp
 * chết, reviewer không còn gì để đọc. Máy chỉ chừa CHỖ, không viết hộ.
 */
export function renderLedger({
  root, results, head, dirty, why, outIgnore, ignoreWhy,
  gateTouched = null, eolOnly = null, diagWhy = '', headMoved = false,
}) {
  const na = (r) => `KHÔNG XÁC ĐỊNH — ${r}`;
  const w = Math.max(...results.map((r) => r.cmd.length));
  const lines = [`HEAD:  ${head ?? na(why)}`, `DIRTY: ${dirty ?? na(why)}`];

  // BỐN dòng dưới đây chỉ xuất hiện KHI CÓ CHUYỆN. Sổ lành ⇒ không thêm một byte nào: mỗi dòng ở
  // đây đều bị đọc lại bởi vai đến sau, nên "khai cho đủ nghi thức" là thuế thu trên mọi lô.
  if (headMoved) {
    lines.push('DIRTY-BY-GATE: ⚠ lệnh gate đã ĐỔI HEAD — mốc trên là mốc SAU khi nó đổi, không phải'
      + ' mốc của diff mà lô này định chứng minh.');
  }
  if (gateTouched && gateTouched.length) {
    const shown = gateTouched.slice(0, 5);
    const more = gateTouched.length - shown.length;
    lines.push(`DIRTY-BY-GATE: ${gateTouched.length} tệp do CHÍNH lệnh gate sửa — ${shown.join(' · ')}`
      + `${more > 0 ? ` · … (+${more})` : ''}`);
  }
  if (eolOnly === true) {
    lines.push('DIRTY-EOL: toàn bộ diff của tệp ĐÃ THEO DÕI chỉ là CR cuối dòng — nội dung y hệt'
      + ' HEAD. Kiểm `core.autocrlf` và quy tắc `text` của `.gitattributes` trước khi đi tìm thay đổi.');
  }
  if (diagWhy) {
    // §0 "guard không được im": bỏ qua vì thiếu tiền đề thì PHẢI nói ra. Không có dòng này thì
    // "không so được" trông y hệt "so xong, không có gì" — đúng lớp lỗi đắt nhất của bộ khung.
    lines.push(`DIRTY-BY-GATE: KHÔNG so được hai mốc (${diagWhy}) ⇒ lưới "lệnh gate có tự làm bẩn`
      + ' cây không" KHÔNG chạy ở lượt này.');
  }

  for (const r of results) {
    lines.push(`- ${r.cmd.padEnd(w)}  → exit ${r.code}${r.tapFail ? '  ⚠ TAP báo FAIL dù exit 0' : ''}`);
    for (const t of r.tail) lines.push(`    | ${t}`);
  }
  // BA trạng thái, BA câu — KHÔNG gộp "không bỏ qua" với "không khẳng định được": dùng cùng một
  // thông điệp cho "lưới không chạy được" và "lưới chạy xong nhưng không có dữ liệu" là đúng thứ
  // §0 cấm. Cả hai nhánh đều KHÔNG chặn: đây là cảnh báo.
  if (outIgnore === 'no') {
    lines.push('⚠ đích ghi sổ KHÔNG được cấu hình theo dõi tệp bỏ qua ⇒ chính cuốn sổ này là một tệp'
      + ' chưa-theo-dõi MỚI, nên DIRTY ở trên sẽ LỆCH khi vai sau tính lại. Chuyển sổ vào thư mục đã bỏ qua.');
  } else if (outIgnore === 'unknown') {
    lines.push(`⚠ KHÔNG khẳng định được đích ghi sổ có được bỏ qua hay không (${ignoreWhy}) ⇒ lưới đó`
      + ' KHÔNG chạy ở lượt này; nếu thực ra nó không được bỏ qua thì DIRTY ở trên sẽ lệch khi tính lại.');
  }
  lines.push(`root: ${root}  (${SIG} — §0 "Ledger")`);
  lines.push('KHAI (người viết bổ sung NGAY TRONG tệp này — §0): RISK (khai) 3–5 dòng · SPEC · SPAWN'
    + ' + đọc-ngoài-read_first · GATE-AT · QUAN SÁT. Diễn giải DÀI (bảng mutation · escape note ·'
    + ' bài học) ⇒ changelog / knowledge.');
  return `${lines.join('\n')}\n`;
}
