// config-mode-guard.mjs — PreToolUse(Task) guard cho mode `usage`. WARN-MODE: KHÔNG BAO GIỜ deny.
//
// Chỉ soi 3 vai hay bị gõ Opus theo quán tính (implementer|planner|debugger) khi mode = `usage`.
// Ngoại lệ IM LẶNG: vai khác · model đã rẻ · mode khác `usage` · prompt có ESCALATE (thang máy
// 2-fail là ngoại lệ CÓ CẤU TRÚC) · mọi lỗi môi trường.
//
// VÌ SAO KHÔNG DÙNG `jq`: bản gốc parse payload bằng jq và tự tắt khi thiếu jq. Nhưng macOS —
// nền tảng CHÍNH — không ship jq, nên guard chết IM LẶNG ở đúng chỗ nó cần sống. Node thì đằng nào
// cũng đã bắt buộc (hook đã gọi nó để đọc mode), nên bỏ jq là bớt một phụ thuộc mà không mất gì.
import { resolvePolicy } from './policy-resolve.mjs';

const WATCHED = new Set(['implementer', 'planner', 'debugger']);
/** Model MẠNH, hoặc RỖNG (rỗng = ăn default Opus của frontmatter) ⇒ ứng viên cảnh báo. */
const isStrong = (m) => m === '' || /opus|fable|inherit/i.test(m);

/**
 * @param {object} payload PreToolUse payload đã parse
 * @param {{root?:string, pluginRoot?:string, config?:object}} ctx
 * @returns {object} `{}` = im lặng; `{systemMessage}` = cảnh báo
 */
export function checkSpawn(payload, ctx = {}) {
  const subagent = payload?.tool_input?.subagent_type;
  if (!WATCHED.has(subagent)) return {};

  const model = typeof payload?.tool_input?.model === 'string' ? payload.tool_input.model : '';
  if (!isStrong(model)) return {}; // sonnet/haiku… ⇒ đúng tinh thần usage

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
