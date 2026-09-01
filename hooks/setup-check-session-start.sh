#!/usr/bin/env bash
# SessionStart — chạy `cc-harness doctor` đầu mỗi phiên, FAIL/WARN thì bơm kết quả vào context để
# agent thấy NGAY thay vì đi làm rồi mới vấp.
#
# Bản trước gọi `script/check-setup.sh` của repo sản phẩm — bố cục đó không còn tồn tại ở mô hình
# plugin (không mount, không sinh script). `doctor` nay là cùng một vai: config · bộ luật · design
# system · trust · tích hợp ngoài · bản export còn khớp không.
#
# LUÔN exit 0: hook này không được làm vỡ phiên. Nhưng KHÔNG im khi có vấn đề — cổng setup câm là
# đúng thứ nó sinh ra để chống.
set -u

# HAI GỐC: SELF_ROOT tìm ruột plugin (cli.mjs), PLUGIN_ROOT tìm tài sản plugin (rules/, policy/).
SELF_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$SELF_ROOT}"
CLI="$SELF_ROOT/bin/lib/cli.mjs"
proj="${CLAUDE_PROJECT_DIR:-$(pwd)}"

[ -f "$CLI" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0   # thiếu node ⇒ im; không có gì chạy được để mà báo

out=$(node "$CLI" doctor --root "$proj" --plugin-root "$PLUGIN_ROOT" 2>&1)
code=$?

escape_for_json() {
  s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  # Ký tự điều khiển THÔ (ESC màu, 0x01…) làm JSON vỡ ⇒ context không tới nơi. Phải đứng SAU các
  # phép trên: chúng đã biến \n \r \t thành hai ký tự thường.
  s="${s//[[:cntrl:]]/}"
  printf '%s' "$s"
}

if [ "$code" -ne 0 ]; then
  ctx="⛔ SETUP FAIL (cc-harness doctor exit $code) — KHÔNG nhận task nào cho tới khi sửa xong; dán nguyên văn phần dưới cho user.\n\n$(escape_for_json "$out")"
elif printf '%s' "$out" | grep -q 'NO-PLUGIN'; then
  ctx="⚠️ SETUP WARN — máy THIẾU plugin cc-lock (guard khoá file đa-session KHÔNG chạy): BẮT BUỘC nhắc user cài NGAY trong response ĐẦU TIÊN của phiên, dán nguyên văn khối hướng dẫn bên dưới.\n\n$(escape_for_json "$out")"
elif printf '%s' "$out" | grep -q '⚠'; then
  ctx="⚠️ SETUP WARN (không chặn task — nhắc user khi tiện):\n\n$(escape_for_json "$out")"
else
  exit 0
fi

printf '{\n  "hookSpecificOutput": {\n    "hookEventName": "SessionStart",\n    "additionalContext": "%s"\n  }\n}\n' "$ctx"
exit 0
