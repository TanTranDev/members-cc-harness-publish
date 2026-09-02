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

# ĐÃ GỠ (2026-09-02) — nhánh `grep -q 'NO-PLUGIN'`. ĐỪNG dựng lại mà chưa đọc hết đoạn này.
#
# Nó là NGƯỜI TIÊU THỤ của một sentinel do `script/check-setup.sh` ở mô hình CŨ sinh ra. Khi hook
# này được viết lại để gọi `cc-harness doctor`, người tiêu thụ được bê nguyên sang còn người SINH
# thì ở lại mô hình cũ. Khảo cổ toàn bộ lịch sử: chuỗi `NO-PLUGIN` chỉ từng tồn tại ở hai tệp —
# chính hook này và `agents/project-init.md` (mô tả hành vi của script cũ) — **KHÔNG `.mjs` nào**
# từng sinh ra nó. Tức nhánh này chưa từng chạy một lần nào kể từ lúc chuyển sang plugin.
#
# Vì sao GỠ chứ không hồi sinh — ba lý do, xếp theo sức nặng:
#  1. Việc nó muốn làm ĐÃ CÓ đường hợp lệ: dự án khai `integrations.cc_lock: "required"` mà máy
#     thiếu plugin ⇒ `doctor` phát WARN kèm cách cài, và nhánh `⚠` bên dưới bơm nó vào context.
#  2. Hồi sinh nó = nhắc cả khi dự án khai `optional`, tức đè lên chính lời khai của dự án.
#     `optional` nghĩa là "không có cũng được"; một cổng cãi lại config là một cổng bị tắt.
#  3. Hồi sinh nó đẻ ra một cặp phải-giữ-đồng-bộ-bằng-tay mới (sentinel trong `doctor.mjs` ↔ `grep`
#     ở đây) — đúng lớp lỗi câm đã sinh ra chính nhánh chết này: người sinh và người tiêu thụ ở hai
#     tệp, không có gì bắt chúng khớp, nên một bên chết mà bên kia vẫn trông như đang chạy.
#
# Gỡ một nhánh chưa từng khớp ⇒ hành vi KHÔNG đổi. Đó là lý do việc này an toàn.
# Muốn có nấc "phải nhắc NGAY" thì đó là một MỨC MỚI giữa WARN và FAIL — quyết định của user,
# không phải thứ hồi sinh lặng lẽ bằng một dòng `grep`.
if [ "$code" -ne 0 ]; then
  ctx="⛔ SETUP FAIL (cc-harness doctor exit $code) — KHÔNG nhận task nào cho tới khi sửa xong; dán nguyên văn phần dưới cho user.\n\n$(escape_for_json "$out")"
elif printf '%s' "$out" | grep -q '⚠'; then
  ctx="⚠️ SETUP WARN (không chặn task — nhắc user khi tiện):\n\n$(escape_for_json "$out")"
else
  exit 0
fi

printf '{\n  "hookSpecificOutput": {\n    "hookEventName": "SessionStart",\n    "additionalContext": "%s"\n  }\n}\n' "$ctx"
exit 0
