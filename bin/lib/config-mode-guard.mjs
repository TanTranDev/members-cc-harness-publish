// config-mode-guard.mjs — PreToolUse(Task) hook: (1) ĐỊNH TUYẾN model theo policy.modelRouting ở MỌI mode
// (`routeSpawn`), (2) guard cảnh báo CHỈ ở mode `usage` (`checkSpawn`). KHÔNG BAO GIỜ deny.
//
// Phần guard chỉ soi 3 vai hay bị gõ Opus theo quán tính (implementer|planner|debugger) khi mode = `usage`.
// Ngoại lệ IM LẶNG: vai khác · model đã rẻ · mode khác `usage` · prompt có ESCALATE (thang máy
// 2-fail là ngoại lệ CÓ CẤU TRÚC) · mọi lỗi môi trường.
//
// VÌ SAO KHÔNG DÙNG `jq`: bản gốc parse payload bằng jq và tự tắt khi thiếu jq. Nhưng macOS —
// nền tảng CHÍNH — không ship jq, nên guard chết IM LẶNG ở đúng chỗ nó cần sống. Node thì đằng nào
// cũng đã bắt buộc (hook đã gọi nó để đọc mode), nên bỏ jq là bớt một phụ thuộc mà không mất gì.
import { resolvePolicy } from './policy-resolve.mjs';
import { isRoutableModel } from './policy.mjs';

const WATCHED = new Set(['implementer', 'planner', 'debugger']);
const PLUGIN_PREFIX = 'cc-harness:';

/**
 * Tên VAI từ `subagent_type`. Agent của plugin mang tiền tố `cc-harness:` (đo 2026-10: payload của
 * Claude Code 2.1.292 ghi `cc-harness:explorer`); bản đầu so tên TRẦN nên guard `usage` KHÔNG BAO
 * GIỜ khớp một spawn plugin — chết im lặng. Chỉ bóc đúng tiền tố của plugin này: `other:verifier`
 * là agent của plugin khác, không phải vai của ta.
 *
 * Tên TRẦN (không tiền tố) VẪN được coi là vai: có bản Claude Code không gắn tiền tố plugin, bỏ tên
 * trần là làm guard/routing chết im lặng ở đó. RỦI RO đã chấp nhận (user chốt): một agent RIÊNG của
 * dự án trùng tên vai (`verifier`, `planner`…) cũng bị đổi model theo bảng khi spawn chưa ghi model.
 * @returns {string} '' nếu không phải chuỗi
 */
export function roleOf(subagentType) {
  if (typeof subagentType !== 'string') return '';
  return subagentType.startsWith(PLUGIN_PREFIX) ? subagentType.slice(PLUGIN_PREFIX.length) : subagentType;
}
/**
 * Model MẠNH ⇒ ứng viên cảnh báo. Rỗng KHÔNG còn mặc nhiên là mạnh: từ 1.3.1 frontmatter `implementer`
 * là `sonnet` (mặc định rẻ, Opus phải xin tường minh), còn `planner`/`debugger` vẫn Opus — nên rỗng
 * chỉ mạnh với hai vai đó.
 */
const OPUS_DEFAULT = new Set(['planner', 'debugger']);
const isStrong = (m, subagent) => (m === '' ? OPUS_DEFAULT.has(subagent) : /opus|fable|inherit/i.test(m));

/**
 * @param {object} payload PreToolUse payload đã parse
 * @param {{root?:string, pluginRoot?:string, config?:object}} ctx
 * @returns {object} `{}` = im lặng; `{systemMessage}` = cảnh báo
 */
export function checkSpawn(payload, ctx = {}) {
  const subagent = roleOf(payload?.tool_input?.subagent_type);
  if (!WATCHED.has(subagent)) return {};

  const model = typeof payload?.tool_input?.model === 'string' ? payload.tool_input.model : '';
  if (!isStrong(model, subagent)) return {}; // sonnet/haiku… ⇒ đúng tinh thần usage

  // Thang máy escalate 2-fail luôn được phép — ngoại lệ có cấu trúc, cố ý phân biệt HOA/thường.
  const prompt = typeof payload?.tool_input?.prompt === 'string' ? payload.tool_input.prompt : '';
  if (prompt.includes('ESCALATE')) return {};

  // Mode là per-CLONE ⇒ resolve theo cwd của phiên spawn, không theo cwd của hook.
  const root = ctx.root || payload?.cwd || process.cwd();
  let mode;
  try {
    mode = resolvePolicy({ root, pluginRoot: ctx.pluginRoot, config: ctx.config }).mode;
  } catch { return {}; } // guard là lưới PHỤ: lỗi môi trường ⇒ im, không chặn task
  if (mode !== 'usage') return {};

  const label = model || '<rỗng ⇒ default Opus>';
  return {
    systemMessage: `⚙️ config-mode USAGE: spawn '${subagent}' (model: ${label}). Mode tiết kiệm khuyên`
      + ' dùng Sonnet — model mạnh CHỈ khi: vùng đắt/contract/escalate (implementer) · thiết kế mới'
      + ' (planner) · bug lạ/đa hệ (debugger). Nếu cố ý đúng ngoại lệ đó, nêu lý do rồi tiếp tục'
      + ' (guard chỉ CẢNH BÁO, không chặn).',
  };
}


/**
 * Định tuyến model lúc spawn: `policy.modelRouting[vai][mode]` ⇒ `updatedInput.model`, CHỈ khi spawn
 * chưa ghi model (spawn tự ghi THẮNG bảng — quyết định của user). RIÊNG prompt có `ESCALATE` ⇒ KHÔNG
 * đặt gì (cùng ngoại lệ với checkSpawn): main ghi model khi escalate là thói quen, không phải bảo đảm —
 * implementer/debugger rẻ ở `usage` mà bị bảng ép Sonnet thì thang máy 2-fail mất tác dụng.
 * `inherit`, vai không có trong bảng, policy hỏng (kể cả
 * code-reviewer hạ dưới sàn Opus — resolvePolicy trả ok=false) ⇒ KHÔNG ghi gì.
 *
 * ĐO 2026-10 (Claude Code 2.1.292, `claude -p --plugin-dir`): hook trả `hookSpecificOutput` chỉ có
 * `hookEventName` + `updatedInput` (KHÔNG `permissionDecision`) ⇒ subagent CHẠY model đã ghi
 * (frontmatter sonnet, ghi haiku ⇒ tự khai haiku-4-5). Bỏ `permissionDecision` để KHÔNG nhảy qua hộp
 * xác nhận quyền của user (`allow` có thể bỏ qua nó); `ask` thì ép hỏi mọi spawn — quá ồn. Hộp xác
 * nhận tương tác không đo được trong `-p` (không có người trả lời): đó là lý do chọn dạng ít đụng nhất.
 *
 * @param {object} payload @param {{root?:string, pluginRoot?:string, config?:object}} ctx
 * @returns {object} `{}` hoặc `{updatedInput}` (toàn bộ tool_input + model)
 */
export function routeSpawn(payload, ctx = {}) {
  try {
    const ti = payload?.tool_input;
    if (!ti || typeof ti !== 'object') return {};
    const role = roleOf(ti.subagent_type);
    if (!role) return {};
    if (typeof ti.model === 'string' && ti.model.trim() !== '') return {}; // spawn tự ghi ⇒ thắng
    if (typeof ti.prompt === 'string' && ti.prompt.includes('ESCALATE')) return {}; // thang máy escalate
    const root = ctx.root || payload?.cwd || process.cwd();
    const r = resolvePolicy({ root, pluginRoot: ctx.pluginRoot, config: ctx.config });
    if (!r.ok || !r.policy) return {};
    const want = r.policy.modelRouting?.[role]?.[r.mode];
    if (typeof want !== 'string' || !isRoutableModel(want)) return {};
    return { updatedInput: { ...ti, model: want } };
  } catch { return {}; } // lưới PHỤ: không làm hỏng spawn
}

/**
 * MỘT quyết định cho một hook: định tuyến trước, rồi guard soi spawn ĐÃ định tuyến (model hiệu lực),
 * gộp vào MỘT JSON. Hai hook cùng phát `updatedInput` sẽ đè nhau — vì vậy chỉ hook này phát.
 * @returns {object} `{}` = im; ngược lại JSON hook output
 */
export function decideSpawn(payload, ctx = {}) {
  const routed = routeSpawn(payload, ctx);
  const effective = routed.updatedInput ? { ...payload, tool_input: routed.updatedInput } : payload;
  const warn = checkSpawn(effective, ctx);
  const out = {};
  if (routed.updatedInput) out.hookSpecificOutput = { hookEventName: 'PreToolUse', updatedInput: routed.updatedInput };
  if (warn.systemMessage) out.systemMessage = warn.systemMessage;
  return out;
}
