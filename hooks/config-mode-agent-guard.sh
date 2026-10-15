#!/usr/bin/env bash
# PreToolUse (matcher Task) — config-mode guard, WARN-MODE.
# KHÔNG BAO GIỜ deny (lộ trình warn→deny giống cc-lock), và KHÔNG BAO GIỜ exit ≠ 0.
#
# Định tuyến model chạy ở MỌI mode; phần CẢNH BÁO chỉ ở mode=usage. Guard soi spawn implementer|planner|debugger bằng model MẠNH
# (opus/fable/inherit) hoặc RỖNG (rỗng = ăn default frontmatter Opus) ⇒ WARN. Ngoại lệ IM LẶNG:
#   • subagent_type khác (code-reviewer, explorer, verifier, …)   • model đã rẻ (sonnet/haiku/…)
#   • mode khác `usage`                                           • prompt chứa "ESCALATE"
#   • mọi lỗi môi trường (JSON rác, thiếu node, không git)
#
# Từ 1.4.x hook này CÒN định tuyến model: spawn chưa ghi `model` ⇒ ghi `policy.modelRouting[vai][mode]`
# qua `updatedInput` (MỘT JSON gộp với cảnh báo; hook DUY NHẤT phát updatedInput cho matcher Task).
# Tên vai chuẩn hoá tiền tố `cc-harness:`. Spawn tự ghi model thắng bảng.
#
# Toàn bộ quyết định nằm ở bin/lib/config-mode-guard.mjs — shell chỉ chuyển stdin sang node.
# Bản gốc parse payload bằng `jq` và tự tắt khi thiếu jq; macOS (nền tảng CHÍNH) không ship jq nên
# guard chết IM LẶNG đúng chỗ nó cần sống. Node đằng nào cũng bắt buộc ⇒ bỏ hẳn phụ thuộc đó.
set -u

# HAI GỐC: SELF_ROOT tìm ruột plugin, PLUGIN_ROOT tìm tài sản plugin (policy/defaults.json).
SELF_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$SELF_ROOT}"
CLI="$SELF_ROOT/bin/lib/config-mode-guard-cli.mjs"

[ -f "$CLI" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0   # thiếu node ⇒ im; SessionStart đã nói việc này rồi

node "$CLI" --plugin-root "$PLUGIN_ROOT"
exit 0
