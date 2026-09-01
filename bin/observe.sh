#!/usr/bin/env bash
# observe.sh — lấy bằng chứng QUAN SÁT từ hệ đang chạy (adapter đa loại dự án).
#
# KHÁC bản script của bộ khung cũ ở ĐÚNG hai chỗ, và cố ý không hơn:
#   • khối `═══ CONFIG ═══` (project-init gõ vào từng bản copy) ⇒ nay nhận qua BIẾN MÔI TRƯỜNG
#     do `cc-harness observe` bơm vào sau khi đọc `claude_config.json`;
#   • khối `cc_parse_root` ⇒ nay nhận `CC_ROOT` đã phân giải sẵn (bin/lib/root.mjs làm việc đó).
# Phần dò nền tảng (lsof · docker · ps · stat · xcrun · adb) giữ NGUYÊN VĂN: nó phụ thuộc hệ điều
# hành rất sâu và đã chạy thật lâu nay — viết lại bằng Node chỉ đổi lấy một lớp bug mới.
#
# Hai trục trực giao:
#   OBSERVE_TARGET — ĐÍCH quan sát, quyết định cách xác minh NGUỒN/TƯƠI:
#     in-process : lệnh chạy trực tiếp từ working tree ⇒ đúng nguồn + đúng phiên bản BY CONSTRUCTION
#     served     : tiến trình dài hạn local ⇒ owner check (port→pid→cwd | docker label) + freshness
#     deployed   : hệ ở xa ⇒ artifact phải TỰ KHAI build-id, so với git HEAD của clone này
#   OBSERVE_KIND — CÁCH lấy bằng chứng: command | screenshot-ios | screenshot-android | none
#
# NGUYÊN TẮC CỨNG: quan sát KHÔNG BAO GIỜ chặn task ⇒ LUÔN exit 0. Không lấy được bằng chứng hợp lệ
# ⇒ báo mức THẤP HƠN + lý do; agent ghi PENDING vào ledger và LAND bình thường.
#
# `set -u` THÔI — cố ý KHÔNG thêm `-o pipefail`. Script này đầy `cmd 2>/dev/null || true` và
# `… | grep -c`, mà luật cứng của nó là LUÔN exit 0; pipefail đổi mã thoát của cả pipeline nên chỉ
# thêm rủi ro lật nhầm một điều kiện, đổi lại không được gì. Bản gốc chạy trên macOS cũng chỉ `set -u`.
set -u

OBSERVE_TARGET="${CC_OBSERVE_TARGET:-in-process}"
OBSERVE_KIND="${CC_OBSERVE_KIND:-none}"
SERVED_PORT="${CC_SERVED_PORT:-}"
SERVED_VIA="${CC_SERVED_VIA:-process}"
SERVED_DOCKER_PROJECT="${CC_SERVED_DOCKER_PROJECT:-}"
SERVED_FRESHNESS="${CC_SERVED_FRESHNESS:-}"
DEPLOYED_ID_CMD="${CC_DEPLOYED_ID_CMD:-}"
SRC_DIRS="${CC_SRC_DIRS:-src}"
OBSERVE_OUT_DIR="${CC_OBSERVE_OUT_DIR:-docs/wip/observe}"

# ROOT do cc-harness phân giải và truyền vào — script này KHÔNG tự đoán (luật 8: file sống trong
# plugin, làm việc trên cây người dùng ⇒ đường dẫn phải đến từ tham số).
ROOT="${CC_ROOT:-}"
if [ -z "$ROOT" ] || [ ! -d "$ROOT" ]; then
  echo "LEVEL: L1"
  echo "REASON: CC_ROOT rỗng hoặc không phải thư mục ('${ROOT}') — gọi qua \`cc-harness observe\`,"
  echo "        đừng chạy thẳng script này. Ledger ghi 'Quan sát: L1 — PENDING' + checklist, LAND"
  echo "        bình thường."
  exit 0
fi
cd "$ROOT" || { echo "LEVEL: L1"; echo "REASON: không cd được vào root '$ROOT'"; exit 0; }
trap 'echo "root: $ROOT" >&2; echo "root: $ROOT"' EXIT

verify_target() {
  case "$OBSERVE_TARGET" in
    in-process)
      echo "NGUỒN: OK — in-process, chạy trực tiếp từ working tree (không cần xác minh)"; return 0 ;;
    served)
      [ -z "$SERVED_PORT" ] && { echo "NGUỒN: ⚠️ target=served nhưng SERVED_PORT rỗng — khai trong CONFIG"; return 0; }
      case "$SERVED_VIA" in
        docker)
          cid=$(docker ps --filter "publish=$SERVED_PORT" --format '{{.ID}}' 2>/dev/null | head -1)
          [ -z "$cid" ] && { echo "NGUỒN: ⚠️ không container nào publish port $SERVED_PORT"; return 1; }
          proj=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$cid" 2>/dev/null)
          if [ "$proj" != "$SERVED_DOCKER_PROJECT" ]; then
            echo "NGUỒN: ⚠️ container port $SERVED_PORT thuộc project '$proj' (kỳ vọng '$SERVED_DOCKER_PROJECT') — bằng chứng VÔ HIỆU"; return 1
          fi
          echo "NGUỒN: OK — container $cid thuộc project $SERVED_DOCKER_PROJECT" ;;
        *)
          pid=$(lsof -ti "tcp:$SERVED_PORT" -sTCP:LISTEN 2>/dev/null | head -1)
          [ -z "$pid" ] && { echo "NGUỒN: ⚠️ không tiến trình nào nghe port $SERVED_PORT — khởi động service của repo này trước"; return 1; }
          cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)
          case "$cwd" in
            "$ROOT"|"$ROOT"/*) echo "NGUỒN: OK — pid $pid (port $SERVED_PORT) thuộc repo này" ;;
            *) echo "NGUỒN: ⚠️ port $SERVED_PORT thuộc tiến trình NƠI KHÁC (cwd: ${cwd:-?}) — bằng chứng VÔ HIỆU cho session này"; return 1 ;;
          esac
          if [ "$SERVED_FRESHNESS" = "process-start" ]; then
            start_epoch=$(ps -o lstart= -p "$pid" 2>/dev/null | xargs -I{} date -j -f "%a %b %d %T %Y" "{}" +%s 2>/dev/null || echo "")
            # Đường LINUX (đọc /proc), chạy SAU khi `ps -o lstart | date -j -f` của BSD/macOS đã
            # thử ở dòng trên. macOS không có /proc nên nhánh này vô hại ở đó.
            [ -z "$start_epoch" ] && start_epoch=$(stat -c %Y "/proc/$pid" 2>/dev/null || echo "") # portability-ok: fallback Linux, BSD đã thử trước
            newest=0
            for d in $SRC_DIRS; do
              [ -d "$d" ] || continue
              m=$( (find "$d" -type f -exec stat -f %m {} + 2>/dev/null || find "$d" -type f -exec stat -c %Y {} + 2>/dev/null) | sort -rn | head -1)
              [ -n "$m" ] && [ "$m" -gt "$newest" ] && newest=$m
            done
            if [ -n "$start_epoch" ] && [ "$newest" -gt "$start_epoch" ]; then
              echo "TƯƠI: ⚠️ code sửa SAU khi tiến trình start — rebuild/restart rồi lấy bằng chứng"; return 1
            fi
            echo "TƯƠI: OK — tiến trình mới hơn lần sửa code cuối"
          fi ;;
      esac ;;
    deployed)
      if [ -z "$DEPLOYED_ID_CMD" ]; then
        echo "NGUỒN: ⚠️ target=deployed nhưng chưa khai DEPLOYED_ID_CMD — bằng chứng KHÔNG xác minh được nguồn, ghi rõ điều này vào ledger"; return 0
      fi
      remote_id=$(bash -c "$DEPLOYED_ID_CMD" 2>/dev/null | tr -d '[:space:]')
      head_id=$(git rev-parse HEAD 2>/dev/null)
      short_id=$(git rev-parse --short HEAD 2>/dev/null)
      if [ -z "$remote_id" ]; then
        echo "NGUỒN: ⚠️ DEPLOYED_ID_CMD không trả build-id (hệ xa chưa lên? endpoint sai?)"; return 1
      fi
      case "$head_id" in
        "$remote_id"*|*"$remote_id") echo "NGUỒN: OK — build-id hệ xa ($remote_id) khớp HEAD ($short_id)"; return 0 ;;
      esac
      echo "NGUỒN: ⚠️ build-id hệ xa ($remote_id) KHÁC HEAD của clone này ($short_id) — hệ xa chạy code khác/cũ, bằng chứng VÔ HIỆU"; return 1 ;;
  esac
  return 0
}

probe_only=false
[ "${1:-}" = "--probe" ] && probe_only=true
slug="${1:-shot}"; [ "$slug" = "--probe" ] && slug="probe"
custom_cmd=(); seen_dd=false
for a in "$@"; do $seen_dd && custom_cmd+=("$a"); [ "$a" = "--" ] && seen_dd=true; done
ts=$(date +%Y%m%d-%H%M%S)
# screenshot khi target=deployed (device thật) là L2; còn lại L3
shot_level() { [ "$OBSERVE_TARGET" = "deployed" ] && echo "L2" || echo "L3"; }

case "$OBSERVE_KIND" in
  screenshot-ios)
    if ! command -v xcrun >/dev/null 2>&1; then
      echo "LEVEL: L1"; echo "REASON: máy không có Xcode CLI — mượn mắt user (checklist + PENDING)"; exit 0
    fi
    booted=$(xcrun simctl list devices booted 2>/dev/null | grep -c Booted || true)
    if $probe_only; then
      if [ "$booted" -gt 0 ]; then echo "LEVEL: $(shot_level)"; else echo "LEVEL: $(shot_level) (chưa boot)"; fi
      verify_target || true; exit 0
    fi
    if [ "$booted" -gt 0 ]; then
      if ! verify_target; then echo "LEVEL: L1"; echo "REASON: NGUỒN không hợp lệ (trên) — không chụp để khỏi tạo bằng chứng giả"; exit 0; fi
      mkdir -p "$OBSERVE_OUT_DIR"; out="$OBSERVE_OUT_DIR/$ts-$slug.png"
      if xcrun simctl io booted screenshot "$out" >/dev/null 2>&1; then
        echo "LEVEL: $(shot_level)"; echo "EVIDENCE: $out"; exit 0
      fi
    fi
    echo "LEVEL: L1"; echo "REASON: không có simulator đang chạy — LAND bình thường, ledger ghi PENDING + checklist"; exit 0;;
  screenshot-android)
    if command -v adb >/dev/null 2>&1 && adb devices 2>/dev/null | grep -q "device$"; then
      if $probe_only; then echo "LEVEL: $(shot_level)"; verify_target || true; exit 0; fi
      if ! verify_target; then echo "LEVEL: L1"; echo "REASON: NGUỒN không hợp lệ — không chụp"; exit 0; fi
      mkdir -p "$OBSERVE_OUT_DIR"; out="$OBSERVE_OUT_DIR/$ts-$slug.png"
      if adb exec-out screencap -p > "$out" 2>/dev/null && [ -s "$out" ]; then
        echo "LEVEL: $(shot_level)"; echo "EVIDENCE: $out"; exit 0
      fi
    fi
    echo "LEVEL: L1"; echo "REASON: không có emulator/device adb — PENDING + checklist"; exit 0;;
  command)
    if $probe_only; then
      if verify_target; then echo "LEVEL: L0 (sẵn sàng)"; else echo "LEVEL: L0 (nguồn chưa hợp lệ)"; fi; exit 0
    fi
    if [ ${#custom_cmd[@]} -eq 0 ]; then
      echo "LEVEL: L0"; echo "REASON: kind=command cần lệnh bằng chứng — dùng: observe.sh <slug> -- <lệnh>"; exit 0
    fi
    if ! verify_target; then
      echo "LEVEL: L0 (nguồn chưa hợp lệ)"; echo "REASON: sửa NGUỒN/TƯƠI ở trên rồi chạy lại — không lấy bằng chứng từ hệ sai/cũ"; exit 0
    fi
    mkdir -p "$OBSERVE_OUT_DIR"; out="$OBSERVE_OUT_DIR/$ts-$slug.txt"
    { echo "\$ ${custom_cmd[*]}"; "${custom_cmd[@]}" 2>&1; echo; echo "exit=$?"; } > "$out"
    echo "LEVEL: L0"; echo "EVIDENCE: $out"; exit 0;;
  none)
    echo "LEVEL: L0"; echo "REASON: dự án khai không cần quan sát runtime — bằng chứng là test output"; exit 0;;
  *)
    echo "LEVEL: L1"; echo "REASON: OBSERVE_KIND '$OBSERVE_KIND' chưa hỗ trợ — mượn mắt user (checklist + PENDING)"; exit 0;;
esac
