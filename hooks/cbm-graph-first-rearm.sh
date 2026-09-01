#!/usr/bin/env bash
# UserPromptSubmit + SessionStart(clear|compact) — TÁI VŨ TRANG các cổng khoá-theo-phiên.
#
# ⚠️ Tên tệp nói "graph-first" vì đó là cổng đầu tiên cần nó, nhưng file này phục vụ **HAI** cổng:
#   · `cbm-graph-first.sh`     — "graph TRƯỚC, grep SAU"        (state: CC_GRAPH_FIRST_STATE)
#   · `agent-tasks-gate.sh`    — "claim task TRƯỚC khi sửa code" (state: CC_TASKS_STATE)
#   · `component-test-gate.sh` — tiêu chí viết test component    (state: CC_COMPONENT_TEST_GATE_STATE)
# Cả hai khoá theo `session_id` nên cùng vỡ theo một kiểu, và cùng được vá ở đây. Thêm cổng
# khoá-theo-phiên thứ ba ⇒ thêm một lời gọi `rearm` bên dưới, ĐỪNG tạo hook rearm riêng: mỗi hook
# SessionStart là một lượt chạy trước MỌI phiên, chi phí đó nhân với toàn bộ công việc.
#
# Vì sao bắt buộc có: `session_id` KHÔNG đổi qua `/compact` và `/clear` (đo 2026-08-04 — phiên
# `50d9b445-…` giữ nguyên id sau compact). Cổng `cbm-graph-first.sh` khoá theo `session_id`, nên
# không có hook này thì **mở khoá sống sót qua compact** ⇒ cổng câm đúng ở ca là LÝ DO nó tồn tại:
# sau compact, tiền lệ tuân thủ trong context đã mất mà cổng lại vẫn coi phiên "đã hỏi graph rồi".
#
# Xoá state ⇒ lượt tìm-kiếm đầu tiên SAU đó bị chặn lại một lần, đúng lúc cần nhất.
# Cũng reset bộ đếm van an toàn: ngân sách 3 lượt là của một mạch làm việc, không phải của cả đời phiên.
#
# ⚠️ ĐƠN VỊ VŨ TRANG ĐỔI Ở v1.1.0: từ MỘT PHIÊN sang MỘT YÊU CẦU CỦA USER (`UserPromptSubmit`).
# Vì sao: đơn vị công việc thật là một yêu cầu — mỗi yêu cầu mới là một cuộc điều tra mới, cần bắt
# đầu lại từ graph. Bản cũ chỉ vũ trang ở `clear|compact`, nên giá để thoát cổng cho CẢ PHIÊN là
# ĐÚNG MỘT lời gọi `search_graph`: phiên 60 lượt tra cứu bị áp luật ở lượt 1 và tự do ở 59 lượt sau.
# Đó là toàn bộ nội dung của lỗi "thường xuyên bỏ qua codebase memory".
#
# Giá phải trả, khai rõ: thêm MỘT lượt tool cho mỗi yêu cầu có tra cứu. Đó đúng là thứ đang thiếu.
# Trần tuyệt đối `CC_GRAPH_FIRST_HARD_MAX` (mặc định 12, KHÔNG bị hook này reset) giữ cho phiên
# bệnh lý không bị nhắc mãi — xem `cbm-graph-first.sh`.
#
# Vẫn giữ nhánh `SessionStart(clear|compact)`: `/clear` không sinh `UserPromptSubmit` ngay, và giữ
# cả hai là rẻ, không mâu thuẫn. KHÔNG có `startup` (phiên mới vốn chưa có state) và KHÔNG có
# `resume` (resume giữ nguyên context, tiền lệ còn nguyên).
# Không xoá được (quyền, đĩa) ⇒ im lặng thoát: cổng tự có đường fail-open riêng, và WARN ở đây
# xuất hiện trước MỌI phiên nên nhiễu nhiều hơn tin.
set -u

DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
NAME="$(printf '%s' "$DIR" | sed 's#^/##; s#/#-#g')"
# Phải lọc GIỐNG HỆT `cbm-graph-first.sh` (hàm `safe`), nếu không hai bên nói về hai tên tệp khác
# nhau và `rearm` xoá vào chỗ trống — cổng không bao giờ được vũ trang lại, IM LẶNG.
NAME="$(printf '%s' "$NAME" | sed 's#[^A-Za-z0-9._-]#_#g')"

# Chỉ xoá state CỦA DỰ ÁN NÀY: `$STATE` dùng chung cho mọi repo trên máy, xoá sạch sẽ tái vũ trang
# oan các phiên đang chạy ở repo khác. Tên tệp là `<NAME>__<sid>.{ok,n}` (xem hook tương ứng).
# CHỈ xoá `.ok` (mở khoá) và `.n` (bộ đếm mỗi-yêu-cầu). **KHÔNG xoá `.total`** — đó là trần tuyệt
# đối mỗi phiên; reset nó theo từng yêu cầu thì trần biến thành vô nghĩa và phiên bị nhắc mãi.
rearm() {
  [ -d "$1" ] || return 0
  rm -f "$1/${NAME}__"*.ok "$1/${NAME}__"*.n 2>/dev/null
  return 0
}

rearm "${CC_GRAPH_FIRST_STATE:-${TMPDIR:-/tmp}/cc-graph-first}"
# `agent-tasks-gate.sh` khoá theo `<DIR>__<sid>` (đường dẫn đầy đủ, không phải NAME kiểu cbm) nên
# phải xoá theo khuôn CỦA NÓ — dùng chung hàm `rearm` ở trên thì không khớp tệp nào và cổng đó không
# bao giờ được vũ trang lại, IM LẶNG.
#
# ⚠️ Tiền tố là BẮT BUỘC, không phải trang trí: `$STATE` dùng chung cho mọi repo trên máy, nên
# `rm -f *.ok` sẽ vũ trang lại OAN các phiên đang chạy ở repo khác. Phép lọc phải giống hệt phía
# gate (`String(...).replace(/[^\w.-]/g,"_")`, và `\w` của JS = [A-Za-z0-9_]).
TASK_KEY="$(printf '%s' "$DIR" | sed 's#[^A-Za-z0-9._-]#_#g')"
rearm_tasks() {
  [ -d "$1" ] || return 0
  rm -f "$1/${TASK_KEY}__"*.ok "$1/${TASK_KEY}__"*.n 2>/dev/null
  return 0
}
rearm_tasks "${CC_TASKS_STATE:-${TMPDIR:-/tmp}/cc-tasks-gate}"
rearm "${CC_COMPONENT_TEST_GATE_STATE:-${TMPDIR:-/tmp}/cc-component-test-gate}"
exit 0
