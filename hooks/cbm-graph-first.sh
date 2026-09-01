#!/usr/bin/env bash
# PreToolUse — cổng "graph TRƯỚC, grep SAU" (cổng cứng số 1 của bộ luật, §0).
#
# Vì sao có hook này: §7 lâu nay sống bằng **momentum của context**, không bằng cơ chế —
# `cbm-augment.sh` chỉ *bơm thêm* graph, không bao giờ chặn. Đo được: sau một `/compact`,
# phiên tụt ngay về grep-trước dù bộ luật vẫn được bơm đủ mỗi lượt và mọi hook SessionStart
# đều chạy. Nhắc kỹ hơn trong prose sẽ hỏng lại ở lần compact sau; chỉ cơ chế mới giữ được.
#
# ⚠️ PHẠM VI THẬT — đo được, hẹp hơn trực giác: đơn vị khoá là `session_id`, và **subagent dùng
# CHUNG `session_id` với phiên chính** (đo 2026-08-04: một subagent gọi `search_graph` làm đổi
# mtime đúng tệp `.ok` của main, không sinh tệp mới). Hệ quả: main mở khoá rồi thì **subagent
# KHÔNG bị cổng này áp**, và cả hai chia chung quota `MAX_DENY`. Payload PreToolUse hiện không
# có trường nào phân biệt subagent với main, nên đây là GIỚI HẠN được khai, không phải lỗi ẩn.
# `/compact` và `/clear` cũng giữ nguyên `session_id` ⇒ cổng được tái vũ trang bằng hook riêng
# `cbm-graph-first-rearm.sh` (SessionStart `clear|compact`), không phải bằng chính file này.
#
# BẤT BIẾN — grep KHÔNG BAO GIỜ bị cấm, nó chỉ bị đẩy xuống SAU graph:
#   · grep/Read là **bằng chứng cuối** (§7: "graph để TÌM, không phải bằng chứng cuối");
#   · graph chỉ mua TỐC ĐỘ, và nó có thể LẠC so với working tree ⇒ mỗi lần chặn đều đính
#     kèm số file lạc + tên file, để agent biết chỗ nào không được tin;
#   · chặn đúng MỘT lượt đầu phiên: hỏi graph một lần ⇒ mở khoá vĩnh viễn trong phiên.
#
# HAZARD — cổng này vỡ được theo HAI chiều ngược nhau; mọi nhánh dưới đây phục vụ một trong hai:
#   (a) DENY sai/kẹt ⇒ agent không tra cứu được gì. Chống bằng: van an toàn (quá
#       CC_GRAPH_FIRST_MAX_DENY lượt ⇒ nhường đường), và fail-OPEN ở MỌI tiền đề thiếu —
#       chưa cài BIN · chưa index xong · BIN lỗi/treo · JSON hỏng · thiếu node.
#   (b) guard CÂM ⇒ §7 lại chỉ là lời hứa. Chống bằng: matcher có `Bash` (bài học
#       `959ee2d`: một session khám phá codebase bằng 26 tool call, 0 Grep/Glob) và lưới
#       mutation cho từng nhánh DENY ở `.claude/templates/cbm-graph-first.test.mjs`.
#
# Fail-open ở (a) KHÔNG được im lặng (§0 no-silent-skip): mọi đường nhường đều nói lý do,
# TRỪ hai ca đã ồn ở chỗ khác — chưa cài BIN (`cbm-project-hint.sh` đã WARN đầu phiên) và
# tool ngoài phạm vi (nói gì cũng là nhiễu).
set -u

input=$(cat)

# `CC_CBM_BIN` là SEAM ĐỂ KIỂM ĐƯỢC, không phải cấu hình cho người dùng: không có nó thì cách duy
# nhất để chạy thử cổng này là ghi một tệp giả vào `$HOME/.local/bin/`, tức làm bẩn máy thật và có
# nguy cơ che mất bản cài sau này. Đường chạy thật không bao giờ đặt biến này.
BIN="${CC_CBM_BIN:-$HOME/.local/bin/codebase-memory-mcp}"

# Guard "đã cài chưa" phải nhận CẢ biến thể có đuôi của Windows, nếu không thì ca "cài bằng .cmd"
# thoát IM LẶNG ngay tại đây và nhánh chẩn đoán nền tảng bên dưới không bao giờ chạy — tức lỗi câm
# thay cho một câu nói rõ. Đã đo: `[ -x ]` của Git Bash trả TRUE cho tệp không đuôi, nhưng
# `execFileSync` thì ENOENT; hai lớp phải nhìn cùng một tập tệp mới nói chuyện được với nhau.
cbm_present() {
  for c in "$BIN" "$BIN.exe" "$BIN.com" "$BIN.cmd" "$BIN.bat"; do
    [ -f "$c" ] && return 0
  done
  return 1
}
cbm_present || exit 0
command -v node >/dev/null 2>&1 || exit 0

DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
# Quy ước path của codebase-memory (khớp `cbm-project-hint.sh`): bỏ `/` đầu, còn lại → `-`.
NAME="$(printf '%s' "$DIR" | sed 's#^/##; s#/#-#g')"
STATE="${CC_GRAPH_FIRST_STATE:-${TMPDIR:-/tmp}/cc-graph-first}"

# `input` đã hút hết stdin ở trên ⇒ PHẢI pipe lại cho node, không thì node đọc stdin RỖNG và
# thoát im lặng — tức hook câm 100% mà `exit 0` (đúng lớp lỗi false-negative im lặng §0 cấm).
printf '%s' "$input" | node -e '
const fs = require("fs");
const path = require("path");
const { execFileSync, spawn } = require("child_process");

const [BIN, DIR, NAME, STATE] = process.argv.slice(1);
// `Number("abc")` = NaN, và `n >= NaN` LUÔN false ⇒ van an toàn chết câm, cổng deny vĩnh viễn.
// Env dị dạng phải rơi về mặc định, không được biến thành khoá cửa.
const MAX_DENY_RAW = Number(process.env.CC_GRAPH_FIRST_MAX_DENY);
const MAX_DENY = Number.isFinite(MAX_DENY_RAW) && MAX_DENY_RAW >= 0 ? MAX_DENY_RAW : 3;
// Trần TUYỆT ĐỐI mỗi phiên, KHÔNG bị `rearm` reset. Cần có vì vũ trang theo yêu cầu làm bộ đếm
// `MAX_DENY` về 0 sau mỗi lượt prompt: không có trần này thì một phiên bệnh lý bị nhắc mãi.
const HARD_MAX_RAW = Number(process.env.CC_GRAPH_FIRST_HARD_MAX);
const HARD_MAX = Number.isFinite(HARD_MAX_RAW) && HARD_MAX_RAW >= 0 ? HARD_MAX_RAW : 12;

// Tool codebase-memory nào tính là ĐÃ TRA GRAPH. `index_status`/`list_projects`/`detect_changes`
// KHÔNG nằm đây: hỏi trạng thái kho ≠ tra kho. Whitelist (không blacklist) để tool mới của server
// không âm thầm trở thành cửa mở khoá.
const LOOKUP = new Set([
  "search_graph", "trace_path", "get_code_snippet", "query_graph", "get_architecture", "search_code",
]);
const SEARCH = new Set(["Grep", "Glob", "Bash"]);

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let data;
  try { data = JSON.parse(raw) || {}; } catch { process.exit(0); }   // JSON hỏng ⇒ không bao giờ cản
  const tool = String(data.tool_name || "");
  const sid = String(data.session_id || "nosid");

  // Dự án khai `integrations.cbm: "off"` ⇒ IM LẶNG TUYỆT ĐỐI: không DENY, không WARN, không ghi
  // state. Đó là lời hứa của bộ khung với dự án không dùng graph ("khai off ⇒ im lặng HỢP PHÁP").
  // v1.0.0 KHÔNG đọc config ở đây, nên `off` chưa bao giờ có hiệu lực với cổng này.
  //
  // Đọc TAY thay vì qua `config.mjs`: hook chạy trước MỌI Grep/Glob/Bash, thêm một tiến trình node
  // nữa là nhân đôi chi phí cố định của đường nóng. Chấp nhận được vì (a) đúng MỘT khoá enum,
  // (b) mọi đường hỏng đều rơi về "optional" tức cổng vẫn chạy, và (c) nếu khoá bị đổi tên thì
  // `off` mất hiệu lực ⇒ agent bị DENY ⇒ lỗi ỒN, không câm. ⚠️ Tên khoá phải giữ ĐỒNG BỘ với
  // schema trong `bin/lib/config.mjs`.
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(DIR, "claude_config.json"), "utf8"));
    if (cfg && cfg.integrations && cfg.integrations.cbm === "off") process.exit(0);
  } catch { /* không có / hỏng / không đọc được ⇒ coi như "optional": cổng vẫn chạy */ }

  // State theo (project, phiên): phiên mới PHẢI hỏi lại graph — đó chính là ca sau `/compact`,
  // `/clear`, và mỗi subagent. Dùng TMPDIR chứ không dùng repo: state phiên không phải thứ để
  // lẫn vào working tree (nó sẽ làm bẩn DIRTY hash của ledger).
  // `NAME` là tên project của codebase-memory (suy từ đường dẫn) ⇒ gửi cho BIN thì phải NGUYÊN VĂN.
  // Nhưng dùng nó làm TÊN TỆP thì phải lọc: trên Windows đường dẫn có `:` (`C:/Users/...`) và tên
  // tệp chứa `:` là KHÔNG HỢP LỆ ⇒ mọi phép ghi state thất bại ⇒ cổng fail-open ở mọi lượt. Đo
  // được: 6/6 lượt rơi vào nhánh "không ghi được state". Ồn (có lý do) nhưng cổng thành trang trí.
  const safe = (x) => String(x).replace(/[^\w.-]/g, "_");
  const key = `${safe(NAME)}__${safe(sid)}`;
  const okFile = path.join(STATE, `${key}.ok`);
  const nFile = path.join(STATE, `${key}.n`);      // đếm theo MỘT YÊU CẦU — `rearm` xoá
  const tFile = path.join(STATE, `${key}.total`);  // đếm theo CẢ PHIÊN — `rearm` KHÔNG xoá
  const mkState = () => { try { fs.mkdirSync(STATE, { recursive: true }); } catch { /* noop */ } };

  // ── Nhánh MỞ KHOÁ ────────────────────────────────────────────────────────────
  if (tool.startsWith("mcp__codebase-memory-mcp__")) {
    if (LOOKUP.has(tool.split("__").pop())) {
      mkState();
      try { fs.writeFileSync(okFile, ""); } catch { /* mở khoá hỏng ⇒ cùng lắm bị nhắc lại */ }
    }
    process.exit(0);
  }

  if (!SEARCH.has(tool)) process.exit(0);

  // Bash: chỉ tính lệnh DÒ CODEBASE. Hai thứ phải tách bạch, và cổng này chỉ được chặn thứ nhất:
  //   · `grep -rn "X" src/`      → dò codebase   ⇒ graph giúp được ⇒ tính
  //   · `npm test | grep PASS`   → LỌC OUTPUT    ⇒ graph vô can    ⇒ bỏ qua
  // Phân biệt bằng VỊ TRÍ: `grep` mở đầu một lệnh là dò; `grep` sau PIPE đơn là lọc thứ lệnh trước
  // vừa in ra. Bản đầu dùng `[\s;&|(]` nên gộp cả hai ⇒ DENY oan mọi lệnh lọc output; bắt được vì
  // chính cổng này chặn lệnh gate của tác giả nó. `\|\|` phải là alternative RIÊNG — nhét `|` vào
  // lớp ký tự là gộp lại pipe với toán tử OR lần nữa.
  if (tool === "Bash") {
    // Chuẩn hoá TRƯỚC khi coi xuống-dòng là biên lệnh, theo đúng thứ tự này:
    //   1. `\⏎`  nối dòng   → một khoảng trắng
    //   2. `|⏎`, `&&⏎`      → giữ nguyên toán tử, bỏ xuống dòng
    // Thiếu bước 2 thì `npm test |⏎grep PASS` lại thành false-positive — đúng bug vừa vá, tái sinh
    // qua cửa khác. Bỏ hẳn `⏎` thì lệnh Bash NHIỀU DÒNG (hình dạng agent dùng liên tục) lọt sạch.
    const cmd = String((data.tool_input || {}).command || "")
      .replace(/\\\n/g, " ")
      .replace(/([|&])\s*\n\s*/g, "$1 ");
    // Tiền tố trong suốt: thứ đứng trước `grep` mà KHÔNG đổi bản chất "đang dò codebase".
    // `git grep` · `xargs grep` · `rtk grep` (repo này có hook viết lại lệnh sang `rtk`, và
    // `settings.json` allow-list chúng) · `sudo`/`time`/`nice`/`nohup`/`env`/`command` ·
    // gán biến `LC_ALL=C grep` · từ khoá thân vòng lặp `do`/`then`/`else`.
    const PREFIX = String.raw`(?:[A-Za-z_]\w*=\S*|sudo|time|env|command|nice|nohup|rtk|xargs|git|do|then|else)\s+`;
    // `| xargs grep` là NGOẠI LỆ của luật pipe: `xargs` biến stdin thành THAM SỐ chứ không lọc
    // dòng, nên `find . | xargs grep X` vẫn là dò codebase thật.
    const HEAD = String.raw`(?:^|[;&(\n]|\|\||\|\s*xargs\s+)`;
    if (!new RegExp(`${HEAD}\\s*(?:${PREFIX})*(?:grep|rg)\\s`).test(cmd)) process.exit(0);
  }

  if (fs.existsSync(okFile)) process.exit(0);        // đã hỏi graph ⇒ đường phổ biến nhất, rẻ nhất

  const emit = (o) => {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", ...o } }));
    process.exit(0);
  };
  // Nhường đường nhưng NÓI RA. Cố ý KHÔNG set `permissionDecision:"allow"`: hook này chỉ cần
  // *không chặn*, và "allow" tường minh sẽ bỏ qua các lớp quyền khác — quyền tối thiểu.
  const pass = (msg) => emit({ additionalContext: msg });

  /** Gọi BIN; mọi lỗi/treo ⇒ null (fail-open). Dòng log `level=info…` đứng trước JSON ⇒ lọc. */
  const call = (bin, t) => {
    try {
      const out = execFileSync(bin, ["cli", t, "--project", NAME], {
        encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"],
      });
      const line = out.split("\n").find((l) => l.trim().startsWith("{"));
      return line ? JSON.parse(line) : null;
    } catch { return null; }
  };

  // TIỀN ĐỀ NỀN TẢNG, phải kiểm TRƯỚC `index_status`: trên Windows, `execFileSync` KHÔNG chạy được
  // tệp không có đuôi — kể cả một PE hợp lệ (đo được: copy `node.exe` thành `noext` ⇒ ENOENT). Mà
  // `[ -x ]` của Git Bash lại trả TRUE cho đúng tệp đó, nên lớp shell ở trên cho đi qua.
  //
  // Hệ quả nếu không có nhánh này: mọi lượt rơi vào "chưa sẵn sàng (status=không đọc được)" ⇒ người
  // đọc đi chạy `index_repository` trong khi vấn đề là NỀN TẢNG. Chẩn đoán sai đắt hơn không chẩn
  // đoán: nó gửi người ta sửa đúng cách ở sai chỗ.
  //
  // `.cmd`/`.bat` CỐ Ý không hỗ trợ: Node ≥18.20 chặn `execFile` với chúng vì CVE-2024-27980
  // (cmd.exe parse lại tham số ⇒ chèn lệnh được), và `NAME` ở đây suy từ đường dẫn nên có thể mang
  // ký tự lạ. Mở cửa đó là đổi một cổng cưỡng chế lấy một lỗ thực thi.
  const probeBin = (() => {
    if (process.platform !== "win32") return { bin: BIN, why: null };
    for (const ext of [".exe", ".com"]) {
      if (fs.existsSync(BIN + ext)) return { bin: BIN + ext, why: null };
    }
    for (const ext of [".cmd", ".bat"]) {
      if (fs.existsSync(BIN + ext)) {
        return { bin: null, why: `chỉ thấy ${path.basename(BIN)}${ext} — cổng KHÔNG chạy tệp .cmd/.bat (Node chặn vì CVE-2024-27980, và tên project ở đây suy từ đường dẫn)` };
      }
    }
    return { bin: null, why: `${path.basename(BIN)} không có đuôi .exe — Windows KHÔNG thực thi được tệp không đuôi qua execFile, kể cả PE hợp lệ` };
  })();

  if (!probeBin.bin) {
    return pass(
      `⚠️ Cổng "graph TRƯỚC, grep SAU" **KHÔNG áp được trên máy này**: ${probeBin.why}.
` +
      `⇒ Phiên này thực tế là GREP-ONLY. Đây KHÔNG phải "graph chưa index" — đừng chạy ` +
      `index_repository để chữa; nó là giới hạn nền tảng.
` +
      `⇒ Lập kế hoạch theo đó, và khai vào bằng chứng rằng tra cứu là grep/Read chứ không phải graph. ` +
      `ĐỪNG kết luận "không có X" chỉ vì grep không thấy.`,
    );
  }

  const st = call(probeBin.bin, "index_status");
  if (!st || st.status !== "ready" || !(st.nodes > 0)) {
    return pass(
      `ℹ️ codebase-memory chưa sẵn sàng cho "${NAME}" (status=${st?.status ?? "không đọc được"}) ⇒ ` +
      `KHÔNG chặn grep. Grep cứ dùng bình thường; muốn có bậc TÌM nhanh thì chạy ` +
      `index_repository cho project này.`,
    );
  }

  // Van an toàn (chiều hazard (a)): agent bướng/graph không giúp được ⇒ nhường đường sau
  // MAX_DENY lượt. Kẹt vĩnh viễn là hỏng nặng hơn nhiều so với một lượt grep chưa hỏi graph.
  let n = 0;
  let t = 0;
  try { n = Number(fs.readFileSync(nFile, "utf8")) || 0; } catch { /* chưa có ⇒ 0 */ }
  try { t = Number(fs.readFileSync(tFile, "utf8")) || 0; } catch { /* chưa có ⇒ 0 */ }
  if (n >= MAX_DENY) {
    return pass(
      `⚠️ Đã nhắc ${n} lần "hỏi graph trước" trong yêu cầu này mà chưa có lời gọi codebase-memory ` +
      `nào ⇒ nhường đường cho phần còn lại của yêu cầu. Grep chạy bình thường, nhưng caller/impact ` +
      `mà grep bỏ sót thì graph (search_graph/trace_path/query_graph, project="${NAME}") vẫn là ` +
      `cách rẻ nhất để bắt.`,
    );
  }
  if (t >= HARD_MAX) {
    return pass(
      `⚠️ Cổng "graph trước" đã nhắc ${t} lần trong CẢ PHIÊN này mà vẫn chưa thành thói ⇒ nhường ` +
      `đường hẳn cho tới hết phiên (trần tuyệt đối ${HARD_MAX}). Nhắc thêm chỉ là nhiễu; nhưng ` +
      `kết luận "không có X" bằng grep vẫn cần xác minh.`,
    );
  }
  // KHÔNG ghi được state ⇒ PHẢI nhường đường. Bản trước ghi `catch {}` kèm comment "van vẫn mở ở
  // lượt sau" — SAI: ghi hỏng thì `n` mãi bằng 0, van KHÔNG BAO GIỜ mở, và `okFile` cũng không ghi
  // được nên gọi graph cũng không cứu. Kết quả là DENY vĩnh viễn không lối thoát (probe: STATE dir
  // chmod 0555 ⇒ 6/6 lượt deny, gọi search_graph xong vẫn deny). Đúng chiều hazard (a), dạng nặng
  // nhất, và mutation không bắt được vì đây là NHÁNH THIẾU chứ không phải nhánh sai.
  mkState();
  try {
    fs.writeFileSync(nFile, String(n + 1));
    fs.writeFileSync(tFile, String(t + 1));
  } catch (e) {
    return pass(
      `⚠️ Cổng "graph trước" không ghi được state tại ${STATE} (${e?.code ?? "lỗi ghi"}) ⇒ nhường ` +
      `đường. Không đếm được thì KHÔNG được chặn: van an toàn và đường mở khoá cùng nằm ở đây, hỏng ` +
      `cả hai thì phiên kẹt vĩnh viễn. Sửa quyền ghi thư mục đó, hoặc đặt CC_GRAPH_FIRST_STATE.`,
    );
  }

  // Nhãn LẠC: graph mua tốc độ, không mua sự thật. Có lệch ⇒ nói rõ lệch bao nhiêu, ở FILE NÀO.
  const dc = call(probeBin.bin, "detect_changes");
  const changed = Array.isArray(dc?.changed_files) ? [...new Set(dc.changed_files)] : [];
  let drift = "";
  if (changed.length) {
    const shown = changed.slice(0, 5).join(", ");
    drift =
      `\n⚠️ Graph LẠC ${changed.length} file so với working tree: ${shown}` +
      `${changed.length > 5 ? ", …" : ""}\n` +
      `   ⇒ graph chỉ để TÌM NHANH. Kết luận phải xác minh bằng Read/grep trước khi sửa. ` +
      `Đã kích re-index nền.`;
    // Re-index nền, detached: không bao giờ chặn caller (cùng triết lý cbm-autosync).
    try {
      const sync = `${process.env.HOME}/.local/bin/cbm-autosync`;
      if (fs.existsSync(sync)) {
        spawn(sync, ["index", DIR], { detached: true, stdio: "ignore" }).unref();
      }
    } catch { /* autosync là tiện ích, không phải tiền đề */ }
  }

  emit({
    permissionDecision: "deny",
    permissionDecisionReason:
      `🔍 graph TRƯỚC, grep SAU — lượt tìm-kiếm ĐẦU TIÊN của yêu cầu này.\n` +
      `Hỏi graph một lần rồi grep tự do; grep vẫn là bằng chứng cuối, chỉ không phải bước đầu.\n\n` +
      `  search_graph  { project: "${NAME}", name_pattern: "<tên>" }   # symbol/định nghĩa\n` +
      `  trace_path    { project: "${NAME}", function_name: "<tên>" }  # chuỗi gọi\n` +
      `  query_graph   { project: "${NAME}", query: "<cypher>" }       # hằng/biến: IMPORTS/USAGE\n\n` +
      `Graph: ${st.nodes} node · ${st.edges} edge · ${st.status}.${drift}\n` +
      `(Không tra được bằng graph — văn bản, config, md — thì cứ gọi một tool codebase-memory ` +
      `bất kỳ ở trên để mở khoá, hoặc nhắc lại ${MAX_DENY} lượt là van tự nhường đường.)`,
  });
});
' "$BIN" "$DIR" "$NAME" "$STATE"
exit 0
