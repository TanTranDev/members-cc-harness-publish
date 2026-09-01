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
 * DIRTY theo ĐÚNG công thức của §0 — hash NỘI DUNG, không phải danh sách đường dẫn:
 *   { git diff HEAD; git ls-files --others --exclude-standard | LC_ALL=C sort |
 *     while read -r f; do shasum "$f"; done; } | shasum
 * Phải khớp TỪNG BYTE với bản shell, vì vai đến sau đối soát bằng CHÍNH lệnh shell đó:
 *  • `LC_ALL=C sort` = thứ tự BYTE ⇒ so bằng `Buffer.compare`, KHÔNG dùng so chuỗi UTF-16 của JS
 *    (hai thứ lệch nhau ở ký tự ngoài BMP ⇒ hash lệch mà không ai đoán ra vì sao);
 *  • `shasum <f>` in `<sha1>  <f>\n` — HAI dấu cách; sai một dấu cách là lệch hash;
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
 * Dựng phần MÁY-ĐỌC của sổ. Phần KHAI là chữ của NGƯỜI và ở lại chính tệp này: `code-reviewer` đọc
 * mục khai TRƯỚC khi review, mà changelog thì viết SAU review — để khai ở changelog là tạo vòng lặp
 * chết, reviewer không còn gì để đọc. Máy chỉ chừa CHỖ, không viết hộ.
 */
export function renderLedger({ root, results, head, dirty, why, outIgnore, ignoreWhy }) {
  const na = (r) => `KHÔNG XÁC ĐỊNH — ${r}`;
  const w = Math.max(...results.map((r) => r.cmd.length));
  const lines = [`HEAD:  ${head ?? na(why)}`, `DIRTY: ${dirty ?? na(why)}`];
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
