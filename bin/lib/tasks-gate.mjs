// tasks-gate.mjs — mặt CLI của cổng "claim task TRƯỚC khi sửa code" (`hooks/agent-tasks-gate.sh`).
//
// Hai lệnh:
//   cc-harness tasks adhoc --reason "<lời user>"   ghi nhận user ĐÃ duyệt làm ngoài sổ ⇒ mở cổng cho phiên
//   cc-harness tasks status                         in state của cổng cho dự án này (chẩn đoán)
//
// Vì sao cần `adhoc`: §14 luật 2 cho hai đường hợp lệ — tạo task, hoặc user nói rõ "ad-hoc". Đường
// thứ hai trước v1.3.0 KHÔNG có cách nào mở cổng ngoài chờ van an toàn nhường đường sau 2 lượt deny,
// tức đường hợp lệ và đường lách cổng trông y như nhau. Lệnh này làm đường hợp lệ TƯỜNG MINH: có lý
// do, có dấu vết trong transcript (một lời gọi Bash), và bị từ chối khi user chưa có cơ hội trả lời.
//
// Bốn giá trị dưới đây PHẢI giữ đồng bộ với hook (không có lưới tự động — xem CLAUDE.md của repo):
//   · thư mục state   `CC_TASKS_STATE` → `${TMPDIR:-/tmp}/cc-tasks-gate`
//   · phép lọc tên     `[^\w.-]` → `_`
//   · khoá tệp        `<DIR>__<sid>.{ok,n,touched,seen}` · `<DIR>__adhoc.pending`
//   · nội dung `.ok`  JSON { mode: "claim"|"adhoc", iid?, reason?, at }
import fs from 'node:fs';
import path from 'node:path';

const safe = (s) => String(s).replace(/[^\w.-]/g, '_');

export function stateDir(env = process.env) {
  if (env.CC_TASKS_STATE) return env.CC_TASKS_STATE;
  // Giống HỆT bash `${TMPDIR:-/tmp}/cc-tasks-gate` — không dùng os.tmpdir(): trên macOS nó cắt dấu
  // `/` cuối của TMPDIR (vô hại) nhưng trên Windows trả `%TEMP%` trong khi Git Bash của hook dùng
  // `/tmp` ⇒ hai bên nhìn hai thư mục khác nhau, lệnh này ghi vào nơi hook không đọc — câm.
  return `${(env.TMPDIR || '/tmp').replace(/\/+$/, '')}/cc-tasks-gate`;
}

/** Session id mà Claude Code cấp cho Bash tool. Không có ⇒ null, rơi về `.pending` cấp DIR. */
export function sessionId(env = process.env) {
  return env.CLAUDE_CODE_SESSION_ID || env.CLAUDE_SESSION_ID || null;
}

function level(config) {
  return String(config?.integrations?.agent_tasks ?? '');
}

const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) || {}; } catch { return {}; } };
const readN = (p) => { try { return Number(fs.readFileSync(p, 'utf8')) || 0; } catch { return 0; } };

/**
 * @param {{root:string, config:object|null, sub?:string, reason?:string, env?:object}} o
 * @returns {{lines:string[], code:number}}
 */
export function tasksCommand({ root, config, sub, reason, env = process.env }) {
  const lines = [];
  const lv = level(config);
  const STATE = stateDir(env);
  const dirKey = safe(root);

  if (sub === 'status') {
    lines.push(`cổng claim-task · dự án ${root}`);
    lines.push(`  integrations.agent_tasks = ${lv || '(không khai)'}  ⇒  ${
      lv === 'required' ? 'CHẶN lượt sửa đầu dưới src_dir khi chưa claim; Stop đòi nói ra'
      : lv === 'optional' ? 'chỉ NHẮC, không chặn'
      : 'cổng KHÔNG chạy'}`);
    lines.push(`  src_dir = ${config?.project?.src_dir || '(chưa khai ⇒ cổng không biết đâu là code, không chặn)'}`);
    lines.push(`  state   = ${STATE}`);
    let names = [];
    try { names = fs.readdirSync(STATE).filter((f) => f.startsWith(`${dirKey}__`)); } catch { /* chưa có */ }
    if (!names.length) { lines.push('  (chưa có state nào cho dự án này — chưa phiên nào đụng cổng)'); return { lines, code: 0 }; }
    const bySid = new Map();
    for (const f of names) {
      const m = /^(.+)__([^_].*)\.(ok|n|touched|seen|pending)$/.exec(f);
      if (!m) continue;
      const sid = m[2] === 'adhoc' ? '(pending — chưa gắn phiên)' : m[2];
      if (!bySid.has(sid)) bySid.set(sid, {});
      bySid.get(sid)[m[3]] = path.join(STATE, f);
    }
    for (const [sid, s] of bySid) {
      const ok = s.ok ? readJSON(s.ok) : null;
      lines.push(`  phiên ${sid}`);
      if (ok) lines.push(`    giữ: ${ok.mode === 'adhoc' ? `AD-HOC (user duyệt: "${ok.reason || ''}")` : `task #${ok.iid ?? '?'} (${ok.tool || 'claim'})`} từ ${ok.at || '?'}`);
      else lines.push('    giữ: (không — chưa claim, hoặc đã complete/release)');
      if (s.n) lines.push(`    deny trong yêu cầu này: ${readN(s.n)}`);
      if (s.touched) lines.push('    đã sửa src KHÔNG có claim trong yêu cầu này ⇒ Stop sẽ đòi nói ra');
      if (s.pending) lines.push(`    ad-hoc chờ gắn phiên: "${readJSON(s.pending).reason || ''}"`);
    }
    return { lines, code: 0 };
  }

  if (sub === 'adhoc') {
    const why = String(reason || '').trim();
    if (!why) {
      lines.push('✖ cc-harness tasks adhoc: thiếu --reason "<lời user>" — ghi lại câu user đã nói (§14 luật 2: "Ghi lại câu trả lời của user").');
      return { lines, code: 2 };
    }
    if (lv !== 'required' && lv !== 'optional') {
      lines.push(`· dự án khai integrations.agent_tasks = ${lv || '(không khai)'} ⇒ không có cổng nào để mở. Không ghi gì.`);
      return { lines, code: 0 };
    }
    try { fs.mkdirSync(STATE, { recursive: true }); } catch (e) {
      lines.push(`✖ không tạo được ${STATE} (${e.code || e.message}) — cổng cũng sẽ nhường đường ở lỗi này; đặt CC_TASKS_STATE tới chỗ ghi được.`);
      return { lines, code: 1 };
    }
    const at = new Date().toISOString();
    const sid = sessionId(env);
    if (sid) {
      const key = safe(`${root}__${sid}`);
      const nFile = path.join(STATE, `${key}.n`);
      const n = readN(nFile);
      // Deny rồi LẬP TỨC tự khai ad-hoc trong cùng yêu cầu = user chưa có cơ hội trả lời. Đây là
      // phản xạ né cổng, không phải quyết định của user — từ chối, và nói phải làm gì.
      if (n > 0) {
        lines.push(`⛔ Không nhận: trong yêu cầu này cổng vừa từ chối ${n} lượt, tức user CHƯA trả lời.`);
        lines.push('   "Ad-hoc" là quyết định CỦA USER (§14 luật 2). Hỏi một câu (tạo task, hay ad-hoc), DỪNG lượt,');
        lines.push('   và chạy lại lệnh này ở lượt sau — khi câu trả lời của user đã có trong hội thoại.');
        return { lines, code: 1 };
      }
      fs.writeFileSync(path.join(STATE, `${key}.ok`), JSON.stringify({ mode: 'adhoc', reason: why, at }));
      fs.writeFileSync(path.join(STATE, `${key}.seen`), '');
      lines.push(`✔ ghi nhận: phiên làm AD-HOC, user duyệt — "${why}"`);
    } else {
      fs.writeFileSync(path.join(STATE, `${dirKey}__adhoc.pending`), JSON.stringify({ reason: why, at }));
      lines.push(`✔ ghi nhận: AD-HOC, user duyệt — "${why}" (chưa biết session id ⇒ cổng sẽ gắn vào phiên ở lượt sửa kế tiếp)`);
    }
    lines.push('  Cổng claim-task mở cho phiên này tới hết phiên. Khi land: ghi "ad-hoc, user duyệt" vào changelog/commit (§14 luật 6).');
    return { lines, code: 0 };
  }

  lines.push('Dùng: cc-harness tasks adhoc --reason "<lời user>"  |  cc-harness tasks status');
  return { lines, code: 2 };
}
