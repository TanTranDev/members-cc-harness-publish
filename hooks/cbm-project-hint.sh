#!/usr/bin/env bash
# SessionStart — NÓI RA khi máy chưa cài `codebase-memory-mcp`.
#
# Hook này CHỈ còn một việc: cảnh báo khi thiếu BIN. Phần "luôn truyền tham số `project`" và bảng
# `project` là luật §0 (cổng cứng, mục 1), danh sách 7 tên tool ở §7 — bơm cả bảng đó mỗi phiên là nói hai lần
# cùng một câu trên đúng đường bơm đắt nhất của bộ khung.
#
# Vì sao nhánh thiếu BIN phải ỒN: trước 2026-07-29 nó `exit 0` IM LẶNG, và đó là false-negative đắt
# nhất của tuyến cbm — agent không có graph **và không biết mình không có** ⇒ grep cả repo rồi tin
# dữ liệu đã đủ. Đúng thứ luật "no silent skip" cấm.
#
# "Một lần" ở đây = một lần mỗi lượt SessionStart, KHÔNG phải một lần mỗi phiên: matcher là
# `startup|resume|clear|compact` nên WARN lặp lại sau mỗi `/clear` · `/compact` · resume. Có chủ
# đích — context vừa bị xoá thì nhắc lại là đúng, và vẫn không cần state.
set -euo pipefail

# Phải nhận CẢ biến thể có đuôi của Windows, GIỐNG HỆT `cbm-graph-first.sh`: lệch nhau thì máy cài
# bằng `.cmd` vừa nhận WARN "chưa cài" ở đây, vừa nhận "cổng không áp được" ở kia — hai câu nói về
# hai sự thật khác nhau cho cùng một máy.
BIN="${CC_CBM_BIN:-$HOME/.local/bin/codebase-memory-mcp}"
for c in "$BIN" "$BIN.exe" "$BIN.com" "$BIN.cmd" "$BIN.bat"; do
  [ -f "$c" ] && exit 0
done

# Chuỗi TĨNH ⇒ dựng JSON bằng printf, KHÔNG qua node: khán giả của WARN này chính là máy trơ, và
# máy trơ có thể trơ luôn cả node — đo được: thiếu node ⇒ nhánh qua node in "command not found"
# rồi không có WARN nào, tức cái vá chính của lô câm đúng loại máy nó nhắm.
printf '%s' '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"⚠️ codebase-memory CHƯA CÀI trên máy này ($HOME/.local/bin/codebase-memory-mcp không thấy).\n⇒ Cổng cứng số 1 (graph TRƯỚC, grep SAU) KHÔNG áp được ở phiên này: mọi tra cứu graph không khả dụng.\n⇒ Phiên này là GREP-ONLY. Lập kế hoạch theo đó, và khai vào bằng chứng rằng tra cứu là grep/Read chứ không phải graph — ĐỪNG kết luận \"không có X\" chỉ vì grep không thấy.\nCài: xem hướng dẫn của codebase-memory-mcp, rồi mở phiên mới."}}'
exit 0
