#!/usr/bin/env bash
# Cổng "claim task TRƯỚC khi sửa code" (cổng cứng số 2 của bộ luật, §0; chi tiết §14).
# MỘT tệp, BA sự kiện — vì trạng thái của cổng là MỘT vòng đời task, và ba sự kiện là ba mốc của nó:
#
#   PreToolUse  Edit|Write|MultiEdit  → chặn (required) hoặc nhắc (optional) lượt sửa đầu dưới src_dir
#   PreToolUse  Bash                  → nhận diện lệnh GHI vào src_dir (sed -i · > · tee · mv…) ⇒ NHẮC, không chặn
#   PostToolUse mcp__…agent-tasks__*  → MỞ khoá khi claim THÀNH CÔNG · KHOÁ LẠI khi task_complete/task_release
#   Stop                              → lượt này đã sửa src mà không giữ claim ⇒ chặn kết thúc MỘT lần, đòi nói ra
#
# Vì sao có hook này: ở v1.0.0, `agent_tasks` có khoá config + probe doctor + tiền tố skill nhưng
# **0 dòng luật** — README tự khai "chỗ nối đã chừa sẵn". v1.1.0 viết §14 và dựng cổng này.
#
# VÌ SAO v1.3.0 VIẾT LẠI — cổng v1.1.0 câm 100% mà trông như đang chạy, và còn DẠY model bỏ qua nó:
#   1. Matcher/`startsWith` dùng tiền tố `mcp__agent-tasks__`, nhưng tool của MCP server ĐI KÈM PLUGIN
#      mang tên `mcp__plugin_agent-tasks_agent-tasks__<tool>` (docs Claude Code, mục MCP: "A hook
#      matcher written against the bare server key will not fire for a plugin-bundled server").
#      ⇒ nhánh MỞ KHOÁ không bao giờ chạy ⇒ claim xong vẫn bị deny ⇒ lượt 3 van tự nhường đường.
#      Kết cục cho model: claim hay không claim thì kết quả Y NHAU sau 2 lượt deny. Đó chính là
#      "Opus bỏ qua agent-tasks một cách có chủ ý" — cổng đã huấn luyện nó làm thế.
#   2. Mở khoá ở PreToolUse = mở theo Ý ĐỊNH gọi tool, không theo KẾT QUẢ: claim thất bại (item đã
#      có phiên khác giữ) vẫn mở khoá. Nay mở ở PostToolUse khi `claimed === true`.
#   3. Đơn vị vũ trang là MỘT YÊU CẦU (`UserPromptSubmit` xoá `.ok`), nhưng claim sống theo TASK:
#      user gõ "tiếp đi" ⇒ bị deny lại dù đang giữ claim ⇒ thêm một bài học "cổng là nhiễu".
#      Nay `.ok` sống tới khi `task_complete`/`task_release`; mỗi yêu cầu mới chỉ NHẮC một lần
#      "đang giữ #N — việc này còn thuộc task đó?" (§14 luật 7).
#   4. Không có gì canh lúc BÁO XONG: model qua van rồi im. Nay `Stop` chặn MỘT lần khi lượt này đã
#      sửa src mà không giữ claim, đòi model claim / khai ad-hoc / hỏi user — không được im.
#   5. Đường "user duyệt ad-hoc" (§14 luật 2b) KHÔNG có cách mở cổng nào ngoài chờ van ⇒ nay có
#      `cc-harness tasks adhoc --reason "<lời user>"`: ghi nhận có lý do, và bị TỪ CHỐI nếu trong
#      yêu cầu này cổng vừa deny (tức user chưa có cơ hội trả lời).
#
# HAZARD — cổng này vỡ được theo HAI chiều ngược nhau; mọi nhánh dưới đây phục vụ một trong hai:
#   (a) DENY sai/kẹt ⇒ agent không sửa được gì. Chống bằng: van an toàn (quá CC_TASKS_MAX_DENY lượt
#       trong một yêu cầu ⇒ nhường đường), fail-OPEN ở MỌI tiền đề thiếu, và Bash CHỈ nhắc.
#   (b) guard CÂM ⇒ §14 lại chỉ là lời hứa. Chống bằng: nhận CẢ HAI tiền tố tên tool (đi kèm plugin
#       và cài như MCP server rời), mở khoá theo KẾT QUẢ, và `Stop` không cho im lặng.
#
# CHỈ chặn tệp trong `src_dir`: sửa docs · brief · changelog · config KHÔNG bị chặn — nếu chặn, agent
# không viết nổi cái brief để hỏi user về task.
#
# Tệp state (thư mục CC_TASKS_STATE, khoá `<DIR>__<sid>`), ai xoá cái gì:
#   .ok       phiên đang giữ claim (JSON: mode claim|adhoc · iid · at · reason). Xoá bởi
#             task_complete/task_release thành công. `cbm-graph-first-rearm.sh` KHÔNG xoá.
#   .n        số lượt deny trong yêu cầu hiện tại (van). Rearm xoá.
#   .touched  lượt này đã cho một lượt sửa src đi qua mà không có claim (đầu vào của Stop). Rearm xoá.
#   .seen     đã nhắc một lần trong yêu cầu này (chống lặp). Rearm xoá.
#   <DIR>__adhoc.pending  do `cc-harness tasks adhoc` ghi khi không biết sid; hook nhận vào `.ok`.
set -u

DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE="${CC_TASKS_STATE:-${TMPDIR:-/tmp}/cc-tasks-gate}"
# `CC_TASKS_PLUGINS` là SEAM ĐỂ KIỂM ĐƯỢC, không phải cấu hình cho người dùng — xem `CC_CBM_BIN`
# trong `cbm-graph-first.sh`. Đường chạy thật không bao giờ đặt biến này.
MANIFEST="${CC_TASKS_PLUGINS:-$HOME/.claude/plugins/installed_plugins.json}"

# Tiền lọc bằng grep TRƯỚC khi trả giá một tiến trình node: hook này chạy trước MỌI Edit/Write/Bash
# và sau mọi lượt Stop của MỌI dự án đã cài plugin. Dự án không khai `required|optional` (kể cả
# không có config, hay khai `off`) ⇒ 0 byte output, 0 tiến trình node — đúng lời hứa "im lặng
# tuyệt đối" của `off`, và rẻ hơn bản cũ (bản cũ spawn node rồi mới đọc config).
grep -qE '"agent_tasks"[[:space:]]*:[[:space:]]*"(required|optional)"' "$DIR/claude_config.json" 2>/dev/null || exit 0
command -v node >/dev/null 2>&1 || exit 0   # thiếu node ⇒ im; không có gì chạy được để mà báo

input=$(cat)

# `input` đã hút hết stdin ⇒ PHẢI pipe lại cho node, không thì node đọc stdin RỖNG và thoát im lặng
# — tức hook câm 100% mà `exit 0`, đúng lớp false-negative im lặng mà bộ luật cấm.
printf '%s' "$input" | node -e '
const fs = require("fs");
const path = require("path");

const [DIR, STATE, MANIFEST] = process.argv.slice(1);

// `Number("abc")` = NaN, và `n >= NaN` LUÔN false ⇒ van an toàn chết câm, cổng deny vĩnh viễn.
// Env dị dạng phải rơi về mặc định, không được biến thành khoá cửa.
const MAX_RAW = Number(process.env.CC_TASKS_MAX_DENY);
const MAX_DENY = Number.isFinite(MAX_RAW) && MAX_RAW >= 0 ? MAX_RAW : 2;

/**
 * Tên tool của agent-tasks. Server đi kèm plugin ⇒ `mcp__plugin_agent-tasks_agent-tasks__<tool>`;
 * cài như MCP server rời tên `agent-tasks` ⇒ `mcp__agent-tasks__<tool>`. Nhận CẢ HAI — đoán sai
 * một tiền tố là cổng câm 100% (đã xảy ra ở v1.1.0–v1.2.3). ⚠️ Giữ ĐỒNG BỘ với matcher trong
 * `hooks/hooks.json` và dòng tiền tố ở §14; `doctor` có lưới đối soát matcher ↔ tên server thật.
 */
const TASKS_TOOL = /^mcp__(plugin_agent-tasks_)?agent-tasks__(.+)$/;
/**
 * Tool nào tính là ĐÃ CLAIM. Tra từ mã nguồn plugin agent-tasks 0.2.1 (`lib/tool-defs.mjs`), KHÔNG
 * đoán. Whitelist chứ không blacklist, để tool mới của server không âm thầm trở thành cửa mở khoá.
 * `tasks_list` · `task_get` · `tasks_my_claims` CỐ Ý không nằm đây: xem hàng đợi ≠ giành việc.
 */
const CLAIM = new Set(["task_intake", "task_claim_next", "task_claim"]);
const UNCLAIM = new Set(["task_complete", "task_release"]);
const EDIT = new Set(["Edit", "Write", "MultiEdit"]);

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let data;
  try { data = JSON.parse(raw) || {}; } catch { process.exit(0); }   // JSON hỏng ⇒ không bao giờ cản
  const ev = String(data.hook_event_name || "PreToolUse");
  const tool = String(data.tool_name || "");
  const sid = String(data.session_id || "nosid");

  // ── tiền đề 1: mức của dự án ─────────────────────────────────────────────────
  // `required` ⇒ chặn. `optional` ⇒ luật §14 vẫn áp, cổng chỉ NHẮC (kênh additionalContext, đã đo
  // là tới model — xem CONTRIBUTING "Ràng buộc nền tảng"). `off`/không đọc được ⇒ đã bị grep lọc
  // ở lớp bash; tới đây mà vẫn không đọc được thì im (fail-open).
  //
  // Đọc TAY thay vì qua `config.mjs`: thêm một lần nạp module vào đường nóng là nhân đôi chi phí
  // cố định. ⚠️ Tên khoá này phải giữ ĐỒNG BỘ với schema trong `bin/lib/config.mjs`.
  let cfg = null;
  try { cfg = JSON.parse(fs.readFileSync(path.join(DIR, "claude_config.json"), "utf8")); } catch { process.exit(0); }
  const level = String(((cfg || {}).integrations || {}).agent_tasks || "");
  if (level !== "required" && level !== "optional") process.exit(0);
  const REQUIRED = level === "required";

  // Phép lọc tên tệp PHẢI giống hệt `cbm-graph-first-rearm.sh` (TASK_KEY) và `bin/lib/tasks-gate.mjs`
  // — lệch một ký tự là rearm xoá vào chỗ trống và CLI ghi vào tệp không ai đọc, cùng IM LẶNG.
  const safe = (s) => String(s).replace(/[^\w.-]/g, "_");
  const key = safe(`${DIR}__${sid}`);
  const F = {
    ok: path.join(STATE, `${key}.ok`),
    n: path.join(STATE, `${key}.n`),
    touched: path.join(STATE, `${key}.touched`),
    seen: path.join(STATE, `${key}.seen`),
    pending: path.join(STATE, `${safe(DIR)}__adhoc.pending`),
  };
  const mkState = () => { try { fs.mkdirSync(STATE, { recursive: true }); } catch { /* noop */ } };
  const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
  const touch = (p, body = "") => { mkState(); try { fs.writeFileSync(p, body); return true; } catch { return false; } };
  const rm = (p) => { try { fs.unlinkSync(p); } catch { /* noop */ } };
  const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")) || {}; } catch { return {}; } };
  const readN = () => { try { return Number(fs.readFileSync(F.n, "utf8")) || 0; } catch { return 0; } };

  const emit = (o) => { process.stdout.write(JSON.stringify(o)); process.exit(0); };
  const emitPre = (o) => emit({ hookSpecificOutput: { hookEventName: "PreToolUse", ...o } });
  // Nhường đường nhưng NÓI RA. Cố ý KHÔNG set `permissionDecision:"allow"`: hook này chỉ cần
  // *không chặn*, và "allow" tường minh sẽ bỏ qua các lớp quyền khác — quyền tối thiểu.
  const pass = (msg) => emitPre({ additionalContext: msg });

  /**
   * `cc-harness tasks adhoc` không biết sid ⇒ để lại `.pending` ở cấp DIR; hook nhận nó vào `.ok`
   * của phiên hiện tại. TỪ CHỐI nếu trong yêu cầu này cổng đã deny (`.n` > 0): deny rồi lập tức tự
   * khai ad-hoc nghĩa là user CHƯA có cơ hội trả lời — đó là phản xạ né cổng, không phải quyết định
   * của user. Trả về chuỗi lý do từ chối, hoặc null.
   */
  const adoptPending = () => {
    if (!exists(F.pending)) return null;
    const p = readJSON(F.pending);
    rm(F.pending);
    if (readN() > 0) {
      return `⛔ Không nhận "ad-hoc": trong yêu cầu này cổng vừa từ chối ${readN()} lượt, tức user CHƯA trả lời. ` +
        `"Ad-hoc" là quyết định CỦA USER (§14 luật 2) — hỏi một câu (tạo task, hay ad-hoc), DỪNG lượt, ` +
        `và chỉ chạy \`cc-harness tasks adhoc\` sau khi user đã nói.`;
    }
    touch(F.ok, JSON.stringify({ mode: "adhoc", reason: p.reason || "", at: p.at || new Date().toISOString() }));
    touch(F.seen);
    return null;
  };

  const describeOk = (ok) => ok.mode === "adhoc"
    ? `chế độ AD-HOC (user duyệt${ok.reason ? `: "${ok.reason}"` : ""})`
    : `task ${ok.iid ? `#${ok.iid}` : "(không rõ iid)"}${ok.at ? `, claim lúc ${ok.at}` : ""}`;

  const srcDir = String(((cfg || {}).project || {}).src_dir || "").replace(/^\.\/+/, "").replace(/\/+$/, "");
  const inSrc = (file) => {
    if (!srcDir || !file) return false;
    const rel = path.relative(DIR, path.resolve(DIR, file)).split(path.sep).join("/");
    return !rel.startsWith("..") && rel.startsWith(`${srcDir}/`);
  };

  // ════════════════════════════════════════════════════════════════════════════
  // PostToolUse — mốc MỞ/KHOÁ theo KẾT QUẢ thật của tool agent-tasks
  // ════════════════════════════════════════════════════════════════════════════
  if (ev === "PostToolUse") {
    const m = TASKS_TOOL.exec(tool);
    if (!m) process.exit(0);
    const name = m[2];
    const resp = data.tool_response;
    // Kết quả MCP tới hook dưới dạng { content:[{type:"text",text}], structuredContent?, isError? }
    // hoặc mảng content. `ok()` của agent-tasks để JSON ở `structuredContent` và (khi không có
    // text riêng) cả trong text. Đọc structured trước, rơi về parse text, rồi rơi về regex.
    let body = null;
    let isError = false;
    const blocks = Array.isArray(resp) ? resp : (resp && Array.isArray(resp.content) ? resp.content : []);
    if (resp && typeof resp === "object" && !Array.isArray(resp)) {
      isError = resp.isError === true;
      if (resp.structuredContent && typeof resp.structuredContent === "object") body = resp.structuredContent;
    }
    if (!body) {
      for (const b of blocks) {
        if (!b || typeof b.text !== "string") continue;
        try { body = JSON.parse(b.text); break; } catch { /* text người đọc, thử block sau */ }
      }
    }
    const text = blocks.map((b) => (b && typeof b.text === "string" ? b.text : "")).join("\n");

    if (CLAIM.has(name)) {
      if (isError) process.exit(0);
      // `claimed === true` là tiêu chí; `task_intake` có thể TẠO item mà KHÔNG claim (phiên đang bận)
      // ⇒ `claimed:false` ⇒ chưa mở. Không đọc được cấu trúc ⇒ rơi về CÂU THÀNH CÔNG của từng tool (tra ở tools.mjs 0.2.1):
      // claim_next: "Đã giành #N — …" · intake: "Đã tạo #N và claim luôn". Câu "Đã tạo #N … KHÔNG claim"
      // của intake CỐ Ý không khớp — item có mà chưa giành thì cổng vẫn đóng.
      const said = /Đã giành #(\d+)/.exec(text) || /Đã tạo #(\d+) và claim luôn/.exec(text);
      const claimed = body ? body.claimed === true : Boolean(said);
      const iid = body && body.work_item_iid != null ? body.work_item_iid : (said ? said[1] : null);
      if (!claimed) process.exit(0);
      touch(F.ok, JSON.stringify({ mode: "claim", iid, tool: name, at: new Date().toISOString() }));
      touch(F.seen);   // claim xong rồi sửa ngay trong cùng yêu cầu ⇒ không nhắc "đang giữ" thừa
      process.exit(0);
    }
    if (UNCLAIM.has(name)) {
      if (isError) process.exit(0);
      // Đường thành công của complete/release LUÔN trả JSON (`ok()` không có text riêng) ⇒ không có
      // cấu trúc = không có bằng chứng thành công ⇒ KHÔNG khoá lại. Khoá nhầm là deny một phiên đang
      // giữ claim hợp lệ (hazard a); để mở nhầm chỉ là giữ nguyên hiện trạng.
      if (!body || !(body.completed === true || body.released === true)) process.exit(0);
      const ok = readJSON(F.ok);
      const arg = (data.tool_input || {}).work_item_iid;
      // Chỉ khoá lại khi đóng/nhả ĐÚNG task đang giữ (hoặc không biết iid nào để so). Đóng một task
      // khác trong lúc giữ task này (§14 luật 7 cấm, nhưng xảy ra được) không được xoá claim hiện tại.
      if (ok.mode === "adhoc") process.exit(0);
      if (ok.iid != null && arg != null && String(ok.iid) !== String(arg)) process.exit(0);
      rm(F.ok);
      process.exit(0);
    }
    process.exit(0);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Stop — lượt này đã sửa src mà không giữ claim ⇒ không cho kết thúc trong im lặng (MỘT lần)
  // ════════════════════════════════════════════════════════════════════════════
  if (ev === "Stop") {
    if (!REQUIRED) process.exit(0);                    // optional: chỉ nhắc ở PreToolUse, không giữ lượt
    if (data.stop_hook_active === true) process.exit(0); // đã chặn một lần rồi ⇒ không chặn vòng vô hạn
    const rejected = adoptPending();
    if (!rejected && exists(F.ok)) process.exit(0);
    if (!exists(F.touched)) process.exit(0);
    // Chặn bằng EXIT 2 + stderr, không bằng JSON: đó là đường được docs cam kết cho MỌI event chặn được
    // ("Stop: exit 2 ⇒ prevents Claude from stopping", stderr đưa cho Claude). Khuôn JSON của Stop có
    // hai cách viết lưu hành (top-level `decision` hay trong `hookSpecificOutput`) và chọn sai là block
    // rơi xuống đất IM LẶNG — đúng lớp lỗi hook này sinh ra để chống. Bash bọc ngoài PHẢI truyền mã thoát.
    const block = (reason) => { process.stderr.write(reason); process.exit(2); };
    block(
        (rejected ? `${rejected}\n\n` : "") +
        `🎫 Lượt này đã sửa tệp dưới \`${srcDir || "src_dir"}/\` mà phiên KHÔNG giữ claim task nào (§14). ` +
        `Trước khi kết thúc, làm ĐÚNG MỘT trong ba, rồi mới báo xong:\n` +
        `  (1) việc này thuộc một task ⇒ claim NGAY (tool agent-tasks \`task_claim\` / \`task_claim_next\`, ` +
        `hoặc \`task_intake\` cho việc mới) và cập nhật trạng thái;\n` +
        `  (2) user ĐÃ nói làm ad-hoc ⇒ chạy \`cc-harness tasks adhoc --reason "<lời user>"\` và ghi ` +
        `"ad-hoc, user duyệt" vào response + changelog/commit (§14 luật 6);\n` +
        `  (3) chưa hỏi ⇒ response cuối PHẢI hỏi user một câu: tạo task, hay ad-hoc.\n` +
        `Kết thúc mà im lặng về việc này là làm việc ngoài sổ.`,
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PreToolUse
  // ════════════════════════════════════════════════════════════════════════════
  if (ev !== "PreToolUse") process.exit(0);

  // ── Bash: nhận diện lệnh GHI vào src_dir ⇒ NHẮC, không chặn ─────────────────
  // Sửa tệp qua `sed -i` · `>` · `tee` · `mv` · `git apply` không đi qua Edit/Write, nên bản cũ mù
  // hoàn toàn ở đây — và chế độ auto của Claude Code còn KHUYẾN KHÍCH sửa tệp bằng Bash. Heuristic
  // nên chỉ nhắc (kênh additionalContext) và ghi `.touched` cho Stop; deny theo heuristic là hazard (a).
  if (tool === "Bash") {
    if (!srcDir || exists(F.ok)) process.exit(0);
    const cmd = String((data.tool_input || {}).command || "");
    const esc = srcDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const mentionsSrc = new RegExp(`(^|[\\s"\x27=(])(\\./)?${esc}/`).test(cmd);
    if (!mentionsSrc) process.exit(0);
    // Chỉ nhận tín hiệu GHI rõ ràng; `cp src/a /tmp` là ĐỌC src nên cp/mv đòi src ở ĐÍCH (đối số cuối).
    // Heuristic này chỉ dẫn tới nhắc + `.touched` (Stop giữ lượt một lần), nên dương tính giả có giá:
    // một lượt thừa. Thà bỏ sót còn hơn nhắc sai.
    const SRC = `(\\./)?${esc}/`;
    const writeish =
      new RegExp(`(^|[^<>])>{1,2}\\s*["\x27]?${SRC}`).test(cmd) ||                       // > src/x · >> src/x
      /\b(sed|perl)\s+(-[a-zA-Z]*i|--in-place)/.test(cmd) ||                          // sed -i · perl -pi (đã có src trong lệnh)
      new RegExp(`(^|[\\s;&|])tee\\s+(-a\\s+)?["\x27]?${SRC}`).test(cmd) ||             // tee src/x
      new RegExp(`(^|[\\s;&|])(cp|mv)\\s[^;&|]*\\s["\x27]?${SRC}\\S*["\x27]?\\s*($|[;&|])`).test(cmd) || // đích là src/
      new RegExp(`(^|[\\s;&|])rm\\s[^;&|]*${SRC}`).test(cmd) ||                          // rm … src/x
      /(^|[\s;&|])patch\s/.test(cmd) ||
      /\bgit\s+(apply|checkout|restore|mv|rm|stash\s+pop)\b/.test(cmd) ||
      new RegExp(`\\b(rsync|truncate)\\s[^;&|]*${SRC}`).test(cmd);
    if (!writeish) process.exit(0);
    touch(F.touched);
    if (exists(F.seen)) process.exit(0);
    touch(F.seen);
    return pass(
      `🎫 Lệnh này có vẻ GHI vào \`${srcDir}/\` mà phiên chưa giữ claim task nào (§14). Không chặn — nhưng: ` +
      `việc này có task chưa? Có ⇒ claim (tool agent-tasks \`task_claim\`/\`task_claim_next\`); mới ⇒ \`task_intake\`; ` +
      `user đã bảo ad-hoc ⇒ \`cc-harness tasks adhoc --reason "..."\`; chưa hỏi ⇒ hỏi một câu trước.` +
      (REQUIRED ? ` Lượt Stop sẽ không cho báo xong trong im lặng.` : ""),
    );
  }

  if (!EDIT.has(tool)) process.exit(0);
  if (!srcDir) {
    // Không khai `src_dir` ⇒ KHÔNG chặn gì: không biết đâu là code thì chặn bừa là chặn cả brief.
    // Nói ra một lần mỗi yêu cầu, chỉ ở mức required (optional mà nhắc thiếu config là ồn).
    if (!REQUIRED || exists(F.seen)) process.exit(0);
    touch(F.seen);
    return pass(
      `ℹ️ Cổng claim-task KHÔNG áp được: \`project.src_dir\` chưa khai trong claude_config.json nên ` +
      `không biết đâu là code production. Khai nó, hoặc nhớ luật §14 bằng tay: claim task trước khi sửa code.`,
    );
  }
  if (!inSrc(String((data.tool_input || {}).file_path || ""))) process.exit(0);   // ngoài src_dir ⇒ không chặn

  const rejected = adoptPending();

  // ── đang giữ claim ⇒ đường phổ biến nhất. Mỗi YÊU CẦU mới nhắc đúng một lần "còn thuộc task đó?"
  if (exists(F.ok)) {
    if (exists(F.seen)) process.exit(0);
    touch(F.seen);
    const ok = readJSON(F.ok);
    return pass(
      `🎫 Phiên đang giữ ${describeOk(ok)}. Yêu cầu này còn thuộc việc đó không? ` +
      `Việc KHÁC ⇒ đóng (\`task_complete\`) hoặc nhả (\`task_release\`) rồi claim/intake task mới — §14 luật 7: một task một lúc.`,
    );
  }

  // ── optional: luật áp, cổng KHÔNG chặn — nhắc một lần mỗi yêu cầu, đúng lúc sắp sửa code ──────
  if (!REQUIRED) {
    touch(F.touched);
    if (exists(F.seen)) process.exit(0);
    touch(F.seen);
    return pass(
      (rejected ? `${rejected}\n` : "") +
      `🎫 §14: dự án bật agent-tasks và phiên chưa claim task nào — việc này có task chưa? ` +
      `Có ⇒ claim (tool agent-tasks \`task_claim\`/\`task_claim_next\`); mới ⇒ \`task_intake\` (brief 7 mục, §10); ` +
      `user đã bảo ad-hoc ⇒ \`cc-harness tasks adhoc --reason "<lời user>"\`; chưa hỏi ⇒ hỏi một câu. ` +
      `(Mức optional: không chặn.)`,
    );
  }

  // ── required, chưa claim ─────────────────────────────────────────────────────
  // tiền đề: plugin phải đã cài — cổng canh một tool KHÔNG TỒN TẠI thì chỉ chặn được người dùng của chính nó.
  let installed = null;
  try {
    const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
    installed = Object.keys(m.plugins || {}).some((k) => k.split("@")[0] === "agent-tasks");
  } catch { installed = null; }
  if (installed !== true) {
    touch(F.touched);
    if (exists(F.seen)) process.exit(0);
    touch(F.seen);
    return pass(
      `⚠️ Dự án khai \`agent_tasks: "required"\` nhưng plugin \`agent-tasks\` ${installed === null ? "KHÔNG kiểm được (không đọc được manifest)" : "CHƯA cài"} ` +
      `⇒ cổng claim-task nhường đường. Luật §14 VẪN ÁP: việc này có task chưa? Không có ⇒ HỎI user ` +
      `(tạo task, hay làm ad-hoc), đừng tự quyết. Cài: claude plugin install agent-tasks`,
    );
  }

  // van an toàn (chiều hazard (a))
  const n = readN();
  if (n >= MAX_DENY) {
    touch(F.touched);
    return pass(
      `⚠️ Đã từ chối ${n} lượt "claim task trước" trong yêu cầu này ⇒ nhường đường cho phần còn lại. ` +
      `Nhưng code đang land NGOÀI SỔ: không ai biết ai đang làm gì, và hai phiên có thể làm trùng. ` +
      `Lượt Stop sẽ không cho báo xong trong im lặng — claim, khai ad-hoc (nếu user đã nói), hoặc hỏi user.`,
    );
  }
  // KHÔNG ghi được state ⇒ PHẢI nhường đường: không đếm được thì không được chặn, vì van an toàn và
  // đường mở khoá cùng nằm ở đây — hỏng cả hai thì phiên kẹt vĩnh viễn. (Cùng lớp lỗi đã đo được ở
  // `cbm-graph-first.sh`: STATE chmod 0555 ⇒ 6/6 lượt deny, gọi tool xong vẫn deny.)
  if (!touch(F.n, String(n + 1))) {
    return pass(
      `⚠️ Cổng claim-task không ghi được state tại ${STATE} ⇒ nhường đường. ` +
      `Sửa quyền ghi thư mục đó, hoặc đặt CC_TASKS_STATE.`,
    );
  }

  emitPre({
    permissionDecision: "deny",
    permissionDecisionReason:
      (rejected ? `${rejected}\n\n` : "") +
      `🎫 Claim task TRƯỚC khi sửa code — đây là lượt sửa ĐẦU TIÊN của yêu cầu này dưới \`${srcDir}/\`.\n` +
      `Chưa claim mà sửa là làm việc ngoài sổ: hai phiên có thể nhận cùng một việc mà không ai biết.\n\n` +
      `  Việc ĐÃ CÓ trong hàng đợi (tool của MCP server agent-tasks — tên đầy đủ có trong danh sách tool):\n` +
      `    task_claim_next { }               # bốc item phù hợp tiếp theo\n` +
      `    task_claim      { work_item_iid } # item cụ thể\n` +
      `  Việc MỚI chưa từng vào hệ thống:\n` +
      `    task_intake     { title, acceptance[], brief, goal?, scope?, care?, hazard? }\n` +
      `      title = tên việc BẠN viết sau khi hiểu · acceptance = tiêu chí KIỂM ĐƯỢC (QC đối chiếu) · brief = lời user\n` +
      `      HỎI user trước (skill agent-tasks:task-new). care=chat ⇒ nhãn careful ⇒ hazard BẮT BUỘC\n` +
      `  User ĐÃ nói "làm ad-hoc, không cần task":\n` +
      `    cc-harness tasks adhoc --reason "<lời user>"   # ghi nhận, rồi sửa tiếp\n\n` +
      `Không có task và user CHƯA nói gì ⇒ HỎI user một câu (tạo task, hay ad-hoc) và DỪNG lượt — đừng tự quyết. ` +
      `Cổng mở khi claim THÀNH CÔNG và giữ tới lúc task_complete/task_release. Chi tiết: \`cc-harness rules §14\`.\n` +
      `(Từ chối ${MAX_DENY} lượt là van tự nhường đường — nhưng lúc đó code land ngoài sổ, và lượt Stop sẽ đòi nói ra.)`,
  });
});
' "$DIR" "$STATE" "$MANIFEST"
# Mã thoát của pipeline = mã thoát của node (lệnh cuối). Stop chặn bằng exit 2 ⇒ PHẢI truyền ra, không
# được `exit 0` cứng như bản cũ — nếu không block bị nuốt và hook trông như đang canh mà không canh.
exit $?
