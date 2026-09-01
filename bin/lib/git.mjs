// git.mjs — lớp git dùng chung cho `risk` và `spec`.
//
// BA rổ trạng thái, KHÔNG hai và KHÔNG bốn:
//   • hai thì "git không dùng được ở đây" lẫn vào "git chạy được mà không có dữ liệu" ⇒ nửa MÁY
//     của ledger im lặng không chạy mà output y hệt cây sạch;
//   • bốn thì call site so `===` từng rổ sẽ để giá trị mới tuột cả ba cửa.
//
// Bốn quyết định dưới đây là SỐ ĐO từ bộ khung gốc, không phỏng đoán:
//   • phân loại "git không chạy được" theo `typeof e.status !== 'number'`, KHÔNG theo ENOENT một
//     mình: PATH rỗng ⇒ ENOENT+null · chmod 000 ⇒ EACCES+null · `-C <dir sai>` ⇒ 128 (SỐ);
//   • PHẢI `-C dir`, không option `cwd`: `{cwd:<dir không tồn tại>}` cho ENOENT y hệt ca thiếu git;
//   • PHẢI peel `HEAD^{commit}`: `--verify HEAD` exit 0 với sha 40-hex RÁC;
//   • HEAD không parse được ⇒ git từ chối cả `--is-inside-work-tree`, nhưng `.git` VẪN đó ⇒ 'no-head'.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const NO_GIT = 'git KHÔNG chạy được ở máy này (thiếu git trong PATH · không exec được)'
  + ' — KHÔNG lệnh git nào chạy được ở lượt này';
// KHÔNG nói "không nằm trong repo git nào": SAI ở repo BARE (git chạy tốt, `--is-inside-work-tree`
// trả 'false' + exit 0) và ở `-C <đường dẫn không tồn tại>`. Điều duy nhất suy được CHẮC CHẮN:
// git chạy được, mà ở đường dẫn đó không có cây làm việc nào.
const NOT_REPO = 'KHÔNG phải cây làm việc git — git chạy được, nhưng ở đường dẫn này không có cây'
  + ' làm việc (thư mục thường · repo bare · đường dẫn không đọc được)';
const NO_HEAD = 'trong git repo nhưng KHÔNG có HEAD dùng được (chưa commit · nhánh orphan ·'
  + ' HEAD/ref hỏng hoặc thiếu · git từ chối đọc cây)';

function insideGitDir(dir) {
  let d = path.resolve(dir);
  for (;;) {
    if (fs.existsSync(path.join(d, '.git'))) return true;
    const up = path.dirname(d);
    if (up === d) return false;
    d = up;
  }
}

/**
 * @param {string} dir thư mục cần soi (truyền cho git bằng `-C`)
 * @returns {{status:'ok'|'no-repo'|'no-head', why:string}} `why` = '' khi status là 'ok'
 */
export function gitTreeStatus(dir) {
  const run = (...args) => execFileSync('git', ['-C', dir, ...args],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  try {
    if (run('rev-parse', '--is-inside-work-tree') !== 'true') return { status: 'no-repo', why: NOT_REPO };
  } catch (e) {
    // Lỗi KHÔNG từ child-process (ReferenceError vì thiếu import, TypeError vì lỗi gõ…) PHẢI ồn:
    // nuốt nó vào rổ 'no-repo' biến BUG CỦA TA thành lời khai "git không chạy được" + exit 0.
    // Nhận diện theo dấu vết child_process ⇒ allowlist, fail-closed.
    if (!(e && typeof e === 'object' && ('status' in e || 'spawnargs' in e))) throw e;
    if (typeof e?.status !== 'number') return { status: 'no-repo', why: NO_GIT };
    // git in Y HỆT `fatal: not a git repository` cho CẢ ca `.git` bị chặn LẪN ca `.git` CÓ mà HEAD
    // hỏng ⇒ thông điệp của git không tách được hai họ. `insideGitDir` là dấu hiệu duy nhất tách được.
    return insideGitDir(dir) ? { status: 'no-head', why: NO_HEAD } : { status: 'no-repo', why: NOT_REPO };
  }
  try { run('rev-parse', '--verify', 'HEAD^{commit}'); return { status: 'ok', why: '' }; }
  catch { return { status: 'no-head', why: NO_HEAD }; }
}

/**
 * Runner "mềm": lệnh hỏng ⇒ trả '' thay vì ném, vì manifest là vai TƯ VẤN và không được chặn task.
 * Người gọi PHẢI hỏi `gitTreeStatus` trước để biết '' nghĩa là "không có dữ liệu" hay "không chạy được".
 *
 * stderr bị nuốt có chủ đích: base sai / ngoài repo làm `git diff` xả cả trang usage, lấn đúng dòng
 * chẩn đoán thật. Mọi nhánh không-có-dữ-liệu đều tự nói bằng WARN của chính tool.
 */
export function gitRunner(cwd) {
  const soft = (...args) => {
    try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim(); }
    catch { return ''; }
  };
  /** `rev` phân giải được thành một commit THẬT? (base do người gõ ⇒ gõ sai là ca thường gặp) */
  soft.revIsCommit = (rev) => {
    try {
      execFileSync('git', ['rev-parse', '--verify', `${rev}^{commit}`],
        { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      return true;
    } catch { return false; }
  };
  return soft;
}
