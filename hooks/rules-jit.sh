#!/usr/bin/env bash
# PreToolUse(Edit|Write|MultiEdit · Task) — NẠP LUẬT ĐÚNG LÚC, một lần mỗi phiên cho mỗi gói.
#
# Vì sao có hook này (1.3.1): §0 (LÕI, ~12 KB) bơm ở đầu phiên; phần còn lại là tầng TRA, agent phải nhớ
# gõ `cc-harness rules §N` đúng lúc — và đo được là nó hay không gõ. Agent .md đời trước bù bằng cách
# bảo subagent "đọc §1 §2 §3 §6" ở MỌI lần spawn (~20 KB × 13 spawn/task ≈ 60–70k token chỉ để nạp lại
# luật). Kênh `additionalContext` của PreToolUse ĐÃ ĐO là tới model (CONTRIBUTING, 2026-09-11) ⇒ bơm
# đúng gói vào đúng thời điểm, đúng MỘT lần mỗi phiên:
#
#   sắp Edit/Write dưới src_dir  ⇒ gói `edit` = §3 (TDD) + §6 (quy ước)          ~10 KB
#   sắp Task (spawn subagent)    ⇒ gói `task` = §11 (điều phối · bàn giao · model) ~15 KB
#
# Bản bơm là bản ĐÃ TRỘN override của dự án (`cc-harness rules`), không phải base.
#
# ĐƠN VỊ: một PHIÊN (session_id), KHÔNG phải một yêu cầu — luật không đổi giữa hai yêu cầu, bơm lại là
# trả tiền hai lần. Vũ trang lại CHỈ ở SessionStart(clear|compact) vì lúc đó context đã mất
# (`cbm-graph-first-rearm.sh` làm việc này, có kiểm `hook_event_name`).
#
# ⚠️ Subagent dùng CHUNG session_id với phiên chính (đo ở §11) ⇒ gói `edit` tới tay AI EDIT ĐẦU TIÊN
# trong phiên: main spawn implementer trước khi tự sửa gì ⇒ implementer nhận — đúng chỗ cần. Main sửa
# trước ⇒ implementer sau đó KHÔNG nhận; bàn giao của main phải mang mục luật (§11 bắt buộc sẵn).
#
# Fail-open ở mọi tiền đề thiếu (thiếu node · không render được luật · không ghi được state) và KHÔNG
# BAO GIỜ chặn: đây là hook nạp tri thức, không phải cổng.
set -u

DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
SELF_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$SELF_ROOT}"
CLI="$SELF_ROOT/bin/lib/cli.mjs"
STATE="${CC_RULES_JIT_STATE:-${TMPDIR:-/tmp}/cc-rules-jit}"
# Trần mỗi gói: gói vượt trần thì cắt và NÓI cắt — bơm 40 KB vì một override phình là đổi một lỗi
# (thiếu luật) lấy một lỗi khác (tràn context).
MAX_BYTES="${CC_RULES_JIT_MAX:-24000}"

[ -f "$CLI" ] || exit 0
command -v node >/dev/null 2>&1 || exit 0

input=$(cat)
printf '%s' "$input" | node -e '
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const [DIR, CLI, PLUGIN_ROOT, STATE, MAX] = process.argv.slice(1);

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let data;
  try { data = JSON.parse(raw) || {}; } catch { process.exit(0); }
  const tool = String(data.tool_name || "");
  const sid = String(data.session_id || "nosid");

  // Gói theo tool. Bảng này là NGUỒN SỰ THẬT của "cái gì nạp lúc nào"; CLAUDE.md của repo đo ngân sách
  // từng gói sau mỗi lần sửa rules/.
  const BUNDLES = {
    edit: { tools: new Set(["Edit", "Write", "MultiEdit"]), ids: ["§3", "§6"], why: "sắp sửa code" },
    task: { tools: new Set(["Task"]), ids: ["§11"], why: "sắp spawn subagent" },
  };
  const bundle = Object.entries(BUNDLES).find(([, b]) => b.tools.has(tool));
  if (!bundle) process.exit(0);
  const [bname, b] = bundle;

  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(path.join(DIR, "claude_config.json"), "utf8")) || {}; } catch { /* không config ⇒ vẫn nạp luật gốc */ }

  // Gói `edit` chỉ khi sửa CODE: có `src_dir` ⇒ tệp phải nằm trong đó; không có ⇒ mọi tệp không phải
  // tài liệu/cấu hình. Sửa docs/brief/changelog không cần TDD.
  if (bname === "edit") {
    const file = String((data.tool_input || {}).file_path || "");
    if (!file) process.exit(0);
    const rel = path.relative(DIR, path.resolve(DIR, file)).split(path.sep).join("/");
    if (rel.startsWith("..")) process.exit(0);
    const srcDir = String(((cfg || {}).project || {}).src_dir || "").replace(/^\.\/+/, "").replace(/\/+$/, "");
    if (srcDir) { if (!rel.startsWith(`${srcDir}/`)) process.exit(0); }
    else if (/^(docs|docs-raw|specs)\//.test(rel) || /\.(md|txt|json|ya?ml|toml|lock)$/i.test(rel)) process.exit(0);
  }

  const safe = (s) => String(s).replace(/[^\w.-]/g, "_");
  const flag = path.join(STATE, `${safe(DIR)}__${safe(sid)}.${bname}`);
  if (fs.existsSync(flag)) process.exit(0);

  let text = "";
  try {
    text = execFileSync(process.execPath, [CLI, "--plugin-root", PLUGIN_ROOT, "--root", DIR, "rules", ...b.ids], {
      encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"],
    });
  } catch { process.exit(0); }   // render hỏng ⇒ im; SessionStart đã báo lỗi luật rồi
  text = text.trim();
  if (!text) process.exit(0);

  let cut = "";
  const max = Number(MAX) || 24000;
  if (Buffer.byteLength(text, "utf8") > max) {
    text = Buffer.from(text, "utf8").subarray(0, max).toString("utf8");
    cut = `\n\n⚠️ (gói vượt ${max} byte — đã cắt; phần còn lại: \`cc-harness rules ${b.ids.join(" ")}\`)`;
  }

  try { fs.mkdirSync(STATE, { recursive: true }); fs.writeFileSync(flag, ""); } catch { /* không ghi được ⇒ lần sau bơm lại, chấp nhận */ }

  const head = `📚 Nạp luật đúng lúc (${b.why} — một lần mỗi phiên): ${b.ids.join(" · ")}, bản đã trộn override của dự án.\n\n`;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: head + text + cut },
  }));
});
' "$DIR" "$CLI" "$PLUGIN_ROOT" "$STATE" "$MAX_BYTES"
exit 0
