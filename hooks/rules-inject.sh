#!/usr/bin/env bash
# SessionStart — bơm bộ luật đã trộn (base của plugin + override của dự án) vào context phiên.
#
# Shell chỉ làm ĐÚNG một việc: gọi Node. Mọi thứ khác — đọc config, trộn, cache, dựng JSON — nằm
# ở bin/lib/inject.mjs. Bản escape-JSON-bằng-bash của bộ khung cũ đã đi vào lịch sử vì bộ luật có
# backslash, nháy kép và emoji; JSON.stringify không có lớp lỗi đó.
set -u

# SELF_ROOT tìm RUỘT (inject.mjs — luôn đi cùng hook này).
# PLUGIN_ROOT tìm TÀI SẢN (rules/…) — do Claude Code cấp.
# Tách hai gốc là bắt buộc: gộp chúng thì một biến môi trường lệch sẽ làm Node ném MODULE_NOT_FOUND
# thay vì bơm luật. Lỗi này đã xảy ra ở CẢ shim bin/cc-harness lẫn đây — cùng một lớp.
SELF_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$SELF_ROOT}"

# Thiếu node ⇒ NÓI RA bằng chính kênh bơm context, rồi vẫn exit 0. Hook không được giết phiên.
if ! command -v node >/dev/null 2>&1; then
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"⚠️ cc-harness: thiếu `node` trong PATH ⇒ KHÔNG nạp được bộ luật của bộ khung. Báo user cài Node rồi mở phiên mới."}}\n'
  exit 0
fi

CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT" node "$SELF_ROOT/bin/lib/inject.mjs" || {
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"⚠️ cc-harness: hook trộn luật thất bại bất thường. Chạy `cc-harness rules --show` để xem lý do."}}\n'
}
exit 0
