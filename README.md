# cc-harness — bộ khung quy trình Claude Code, dạng plugin

Cài **một lần per máy**. Mọi dự án trên máy dùng chung bộ khung; mỗi dự án tuỳ biến bằng **một
file** `claude_config.json` ở root repo của nó.

Repo dự án **không còn** mount symlink, không còn `script/` sinh từ template, không còn drift.

## Cài

Plugin phát hành từ repo **dist** — repo đó chỉ chứa phần CHẠY, không có tài liệu nội bộ.

```bash
claude plugin marketplace add <owner>/<repo-dist>
claude plugin install cc-harness@<tên-marketplace>
```

Phát triển tại chỗ (repo dev, không qua marketplace):

```bash
claude --plugin-dir /path/to/members-cc-harness
```

### Cài từ repo PRIVATE

Claude Code cài plugin bằng **`git clone`**, dùng git credential helper sẵn có của máy. Ba điều phải
biết trước, cả ba đều đã gặp trong tài liệu chính thức:

**1. `owner/repo` clone qua SSH theo MẶC ĐỊNH.** Muốn dùng PAT qua HTTPS thì phải nói ra:

```bash
export CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1     # hoặc khai marketplace bằng URL https:// tường minh
```

**2. Refresh nền TẮT credential helper.** Nên với private + HTTPS, `git pull` nền không auth được và
Claude Code rơi về **re-clone toàn bộ**. Vá bằng URL rewrite nhúng token — nó có hiệu lực cả ở lượt
nền vì không đi qua helper:

```bash
git config --global   url."https://x-access-token:$GIT_PAT@github.com/<owner>/<repo-dist>".insteadOf       "https://github.com/<owner>/<repo-dist>"
```

⚠️ **Scope tới đúng đường dẫn repo, KHÔNG phải hostname.** Một rewrite có base chỉ là `github.com`
sẽ áp cho **mọi** fetch/push tới GitHub trên máy đó và **ghi đè credential thường của bạn, kể cả khi
push repo của chính bạn**. Token nằm **plaintext** trong gitconfig ⇒ dùng token **read-only**.

Thêm một lớp bảo hiểm để phiên không vỡ khi lượt nền thất bại:

```bash
export CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE=1
```

**3. SSH không bị ảnh hưởng bởi mục 2.** Máy cá nhân của thành viên nên dùng SSH (key trong
`ssh-agent`, host trong `known_hosts`) — không có token plaintext, không có rủi ro rewrite. Để PAT cho
CI, nơi không có SSH key: `GH_TOKEN=<pat> gh auth setup-git`.

### Ghim bản

Plugin source nhận cả `ref` (branch/tag) và `sha`; **`sha` thắng `ref`** khi khai cả hai. Ghim theo
`sha` thì bản cài vẫn dựng được **dù tag đã bị xoá**, miễn commit còn reachable.

## Cấu hình dự án

```bash
cc-harness init      # sinh claude_config.json + mở quyền chạy cc-harness cho dự án
cc-harness doctor    # kiểm mọi thứ, kể cả trạng thái trust
```

`init` **không bao giờ đè** `claude_config.json` đã có, và **merge** (không ghi đè)
`.claude/settings.json`.

> ⚠️ **Quyền chỉ có hiệu lực khi workspace đã được TRUST.** Claude Code bỏ qua toàn bộ
> `permissions.allow` của một dự án chưa trust, nên lệnh `cc-harness` vẫn bị hỏi quyền dù `init`
> đã khai đúng. Mở Claude Code **tương tác** một lần tại thư mục dự án và đồng ý hộp thoại trust.
> `cc-harness doctor` kiểm và nói thẳng trạng thái này — đây là bẫy đã gặp thật, và triệu chứng
> của nó (bị hỏi quyền) chỉ thẳng vào chỗ SAI.

Nội dung file:

```jsonc
{
  "$schema": "cc-harness/1",
  "project":       { "name": "my-app", "src_dir": "src", "aliases": { "@/": "src/" } },
  "skills":        { "required": ["cc-design:design-system-web"],
                     "hints": { "src/api/": "my-org:openapi-rules" } },
  "design_system": { "ds-web": "cc-design:design-system-web" },   // đường tương thích, chỉ UI
  "rules":         { "overrides": [
                       { "section": "§1", "op": "replace", "file": "docs/rules/contract.md" },
                       { "section": "§20", "op": "append", "file": "docs/rules/backend.md" },
                       { "section": "§4", "op": "remove", "reason": "dự án không dựng feature kiểu đó" }
                     ] },
  "gate":          { "commands": ["npm run typecheck", "npm run lint", "npm test"] },
  "structure":     { "max_loc": 600, "shared_features": ["chat-core"] },
  "review":        { "confirm": "on", "soft_cap": 3 },
  "observe":       { "target": "served", "kind": "command", "port": 3000 },
  "integrations":  { "cc_lock": "required", "cbm": "required", "rtk": "optional", "agent_tasks": "off" },
  "policy":        { "mode": "quality" }
}
```

Không có file này ⇒ plugin **vẫn chạy** với bộ luật gốc và **nói ra mỗi phiên** là dự án chưa
cấu hình. Không có đường im lặng.

📖 **Từng khoá, mặc định, ai đọc nó, và ba mẫu đầy đủ (Go · Python · React Native): `CONFIG.md`.**

## Bộ luật: chỉ §0 được bơm, phần còn lại TRA khi cần

Bộ luật cắt theo **nhịp đọc**, không theo chủ đề:

| Tầng | Đọc lúc nào | Đường tới Claude |
|---|---|---|
| **LÕI** — §0: cổng cứng · phân loại việc · luật output · nguồn sự thật | giây 0, mọi phiên | bơm `SessionStart` |
| **TRA** — §1…§13 | khi đang làm đúng việc đó | `cc-harness rules <id>`, và một dòng index trong LÕI |

Đo trên máy: **10,9 KB bơm mỗi phiên** thay cho 92,6 KB của v1.0.0 — cùng một bộ luật, không mục
nào bị xoá. Mục nào ở tầng nào do annotation `<!-- inject: core -->` trong `rules/FRAMEWORK.md`
quyết định; mặc định là TRA, vào LÕI phải khai tường minh.

## Tuỳ biến bộ luật — base + override theo mục

Plugin ship **đúng một** bộ luật gốc: `rules/FRAMEWORK.md`. Dự án không copy nó; dự án khai
những mục mình muốn đổi.

```bash
cc-harness rules --index           # bảng mục: id · dùng khi nào (thứ KHÔNG bơm sẵn)
cc-harness rules §2                # in ĐÚNG một mục, đã trộn override của dự án
cc-harness rules --list-sections   # bảng section-id + tầng, để khai vào config
cc-harness rules --diff            # override nào đã áp
cc-harness rules --show            # toàn văn bộ luật cuối cùng
```

⚠️ Dự án `replace` một mục LÕI thì **giữ lại dòng `<!-- inject: core -->`** trong tệp override.
Quên thì plugin vẫn bơm (nó có danh sách LÕI khai cứng) nhưng sẽ cảnh báo mỗi phiên.

| `op` | Nghĩa | Ràng buộc |
|---|---|---|
| `replace` | thay trọn mục (kể cả các mục con của nó) | section phải TỒN TẠI |
| `append` | thêm mục MỚI vào cuối | section phải CHƯA tồn tại |
| `remove` | gỡ trọn mục | **bắt buộc `reason`**, và mỗi phiên đều nhắc lại |

`remove` cố ý **ồn**: gỡ một mục luật thì mọi phiên đều thấy dòng *"dự án này đã GỠ §X vì …"*.
Cho phép tuỳ biến, nhưng không cho phép lỗ luật im lặng.

Mẫu có sẵn trong `examples/rn-miniapp/` — đúng phần đã gỡ khỏi bộ luật gốc vì nó chỉ đúng với một
loại dự án: `contract.md` (§1 contract Module Federation) và `conventions.md` (§6 quy ước RN, kèm
mục TextInput chống cắt descender). Dự án RN mini-app chép về rồi trỏ tới:

```jsonc
{ "section": "§1", "op": "replace", "file": "docs/rules/contract.md" }
```

## Lệnh

```bash
cc-harness init [--dry-run]        # sinh claude_config.json + mở quyền
cc-harness doctor                  # cổng setup: config · luật · design system · tích hợp ngoài
cc-harness config --check          # kiểm claude_config.json
cc-harness rules --index | <id> | --show | --diff | --list-sections
cc-harness structure [--update-baseline]   # 4 luật kiến trúc §2, ratchet theo baseline
cc-harness spec [<path>] [--allow-removals]  # format spec + guard mất-mát scenario
cc-harness changelog [<YYYYMMDD>|--last <N>] # đọc gộp changelog fragment
cc-harness observe [--probe|<slug> [-- <lệnh>]]   # bằng chứng quan sát
```

Còn lại ở lô sau: `gate` · `export`.

**Ba mức nghiêm khắc, cố ý khác nhau** — đọc kỹ trước khi dùng trong CI:

| Vai | Lệnh | Không phân giải được root thì… |
|---|---|---|
| **Cổng** | `structure` · `spec` | **exit 2 + nói cách sửa.** Không có cây để kiểm mà báo xanh chính là false-green |
| **Tư vấn** | `changelog` · `doctor` | cảnh báo rồi chạy tiếp với thư mục hiện hành |
| **Không bao giờ chặn** | `observe` | **luôn exit 0.** Không lấy được bằng chứng ⇒ hạ MỨC + nêu lý do, agent ghi `PENDING` vào ledger và land bình thường |

Mọi lệnh đều **in `root:` đã dùng** — chạy nhầm cây là thứ phải NHÌN THẤY được, không phải đoán.
Root tìm bằng cách leo lên từ thư mục hiện hành cho tới khi gặp `claude_config.json`, nên chạy từ
thư mục con vẫn đúng; ép tường minh bằng `--root <path>`.

## Tích hợp ngoài

Harness **áp luật** dùng chúng; **config là của plugin đó**, harness không đọc, không mang theo.

| Khoá | Plugin/tool | Harness làm gì |
|---|---|---|
| `cc_lock` | `cc-lock@members-cc-lock` | áp luật khoá file trước khi sửa hot-zone; probe đã cài chưa |
| `cbm` | `codebase-memory-mcp` | áp cổng cứng số 1 "graph TRƯỚC, grep SAU" — vũ trang lại theo MỖI yêu cầu của user; probe có graph không |
| `rtk` | `rtk` | áp luật bằng chứng phải là output thô; probe hook có nén lệnh gate không |
| `agent_tasks` | plugin `agent-tasks` | áp **§14**: claim task trước khi sửa code · brief 7 mục vào item · chia việc = tạo item có `parent`/`depends-on`. Cổng chặn cứng còn hoãn (chưa tra được tên tool thật) |

Mỗi khoá nhận `required` · `optional` · `off`. Khai `required` mà thiếu ⇒ cảnh báo kèm cách cài.
Khai `off` ⇒ im lặng **hợp pháp**, vì đã khai.

## Phát triển

```bash
claude plugin validate .
claude --plugin-dir "$PWD"     # chạy plugin tại chỗ để thử
```

⚠️ **v1.1.0 không còn lưới test tự động**: toàn bộ `__tests__/` đã được xoá khi dựng lại bộ khung,
nên `npm test` và `npm run mutate` **không có**. Nghiệm thu bằng tay: `cc-harness doctor` phải xanh,
và mỗi cổng trong `hooks/` có phần *Nghiệm thu* mô tả trong chính comment đầu tệp.

> **Bản phát hành này chỉ chứa phần CHẠY.** Tài liệu thiết kế, luật nội bộ của người bảo trì, và kế
> hoạch nâng cấp nằm ở repo phát triển (private) — cố ý không đi kèm. Không có tệp nào trong bản này
> trỏ vào chúng, nên nếu anh thấy một tham chiếu treo thì đó là lỗi, hãy báo.

## Giấy phép

**Độc quyền — không phải mã nguồn mở.** Không có quyền nào được cấp mặc định; **sử dụng thương mại
luôn cần cho phép bằng văn bản** của chủ sở hữu. Truy cập được repo, token, hay bản phát hành **không**
phải là quyền sử dụng. Toàn văn: `LICENSE`.

Phần dẫn xuất từ [`obra/superpowers`](https://github.com/obra/superpowers) (14 skill) ở dưới **MIT,
© 2025 Jesse Vincent** — `LICENSE` không áp cho chúng và không hạn chế quyền bạn đã có với chúng theo
MIT. Danh sách + toàn văn MIT: `THIRD-PARTY-NOTICES.md`.
