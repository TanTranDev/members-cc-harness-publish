# `claude_config.json` — hướng dẫn cấu hình

Một dự án dùng cc-harness tuỳ biến bằng **đúng một file**: `claude_config.json` ở ROOT repo.
Sinh bằng `cc-harness init`, kiểm bằng `cc-harness config --check`.

Không có file này ⇒ plugin **vẫn chạy** bằng bộ luật gốc, và **nói ra mỗi phiên** là dự án chưa cấu
hình. Không có đường im lặng.

---

## Nguyên tắc trước khi đọc bảng khoá

**1. Bỏ trống là một lời khai, không phải chỗ trang trí.** Khoá nào dò không được thì `init` để rỗng
và nói ra. Điền một giá trị bịa thì tool sẽ chạy lệnh không tồn tại rồi báo đỏ mãi — tệ hơn để rỗng.

**2. Khoá lạ ⇒ WARN, không nuốt im lặng.** Gõ sai tên khoá thì `config --check` nói ra. Khoá **đã bị
bỏ** ở bản mới thì nó nói rõ *bỏ vì sao và thay bằng gì* — chứ không để bạn đi sửa chính tả cho một
cơ chế đã không còn tồn tại.

**3. Khung KHÔNG biết stack của bạn.** File này chỉ nói những thứ **máy** cần đọc. Thứ **người và
agent** cần đọc — stack thật, lệnh dev, bản đồ tầng ↔ thư mục, quy ước tên — nằm ở `PROJECT.md`.

---

## File tối thiểu chạy được

```jsonc
{
  "$schema": "cc-harness/1",
  "project": { "name": "my-app" },
  "gate":    { "commands": ["<lệnh kiểm của dự án>"] }
}
```

Mọi khoá còn lại có mặc định hợp lý. Thêm dần khi cần, đừng khai trước.

---

## Bảng khoá — đầy đủ, đúng schema hiện tại

| Khoá | Kiểu | Ai đọc | Mặc định khi bỏ trống |
|---|---|---|---|
| `$schema` | string | — | không kiểm, để nhận dạng |
| `project.name` | string | mọi lệnh (in ra) | tên thư mục |
| `project.src_dir` | string | `structure` · `observe` · cổng claim-task | không có ⇒ `structure` không quét, cổng claim-task không chặn |
| `project.aliases` | object | `structure` (phân giải import) | `{}` |
| `gate.commands` | array | `cc-harness gate` | không có khoá `gate` ⇒ không chạy gate |
| `structure.max_loc` | number | `structure` | 600 |
| `structure.shared_features` | array | `structure` | `[]` |
| `structure.baseline` | string | `structure` | `script/structure-baseline.json` |
| `review.confirm` | `"on"` \| `"off"` | agent (bơm vào phiên khi ≠ mặc định) | `on` |
| `review.soft_cap` | number | agent | 3 |
| `skills.required` | array | agent (bơm mỗi phiên) | `[]` |
| `skills.hints` | object | agent | `{}` |
| `design_system.ds-web` | string | agent · cổng design | không có |
| `design_system.ds-mobile` | string | agent · cổng design | không có |
| `rules.overrides` | array | `rules` · đường bơm luật | `[]` — dùng bộ luật gốc |
| `observe.target` | `in-process` \| `served` \| `deployed` | `observe` | `in-process` |
| `observe.kind` | `command` \| `screenshot-ios` \| `screenshot-android` \| `none` | `observe` | `command` |
| `observe.port` · `via` · `docker_project` · `freshness` · `deployed_id_cmd` · `src_dirs` · `out_dir` | tuỳ | `observe` | tuỳ đích |
| `integrations.cc_lock` · `cbm` · `rtk` · `agent_tasks` | `required` \| `optional` \| `off` | `doctor` · các cổng hook | `optional` |
| `policy.mode` | `quality` \| `balance` \| `usage` | `policy` | `quality` |

**Khoá ĐÃ BỎ** — khai vào sẽ nhận WARN nói rõ lý do:

| Khoá | Bỏ ở | Thay bằng |
|---|---|---|
| `risk` (`hot_zones`, `fan_in_warn`) | v1.1.0 | `review.confirm` + tiêu chí theo *thứ diff đã làm* (§12). Danh sách single-writer về `cc-lock.config.json` của plugin cc-lock |
| `gate.prepush` | v1.1.0 | git hook của dự án gọi `cc-harness gate`. Khoá cũ được validate mà **không ai đọc** — lỗi câm |

---

## Từng khoá, và cách khai cho stack của bạn

### `project`

```jsonc
"project": { "name": "my-app", "src_dir": "src", "aliases": { "@/": "src/" } }
```

- **`src_dir`** — thư mục mã nguồn chính. `cc-harness structure` chỉ quét trong đây, và cổng
  claim-task chỉ chặn tệp trong đây (sửa `docs/`, config, brief thì không bị chặn).
  Ví dụ theo stack: `src` (JS/TS, Java) · `internal` hoặc `cmd` (Go) · `lib` (Ruby, Elixir) ·
  tên package (Python) · `Sources` (Swift).
  **Mono-repo**: khai thư mục chứa code của dịch vụ bạn đang làm; `init` dò `src` → `lib` → `app` →
  `internal` → `cmd` → `pkg`, lấy cái đầu tiên thấy.
- **`aliases`** — chỉ cần khi stack của bạn CÓ alias import (`paths` của tsconfig, `moduleNameMapper`,
  `resolve.alias` của bundler). Go · Python · Rust · Java thường **không có** ⇒ để rỗng.
  Đây là chỗ config nghiêng về stack có bundler; bỏ trống thì không mất gì ngoài việc `structure`
  không nhận ra import viết bằng alias.

### `gate.commands` — chỗ đổi stack, và chỉ chỗ này

`cc-harness gate` chạy **đúng mảng này, theo thứ tự**, thu mã thoát từng lệnh, rồi sinh ledger bằng
chứng. Đổi stack **chỉ là đổi mảng này** — không sửa gì trong khung.

```jsonc
"gate": { "commands": ["npm run typecheck", "npm run lint", "npm test"] }          // JS/TS
"gate": { "commands": ["go vet ./...", "golangci-lint run", "go test ./..."] }     // Go
"gate": { "commands": ["ruff check .", "mypy .", "pytest -q"] }                    // Python
"gate": { "commands": ["cargo clippy -- -D warnings", "cargo test"] }              // Rust
"gate": { "commands": ["./gradlew check"] }                                        // Kotlin/Java
"gate": { "commands": ["mvn -q verify"] }                                          // Maven
"gate": { "commands": ["bundle exec rubocop", "bundle exec rspec"] }               // Ruby
"gate": { "commands": ["dotnet format --verify-no-changes", "dotnet test"] }        // .NET
"gate": { "commands": ["mix format --check-formatted", "mix test"] }               // Elixir
"gate": { "commands": ["swift build", "swift test"] }                              // Swift
```

Hai ràng buộc **cưỡng chế**, không phải khuyến nghị:

- **Mảng rỗng ⇒ ERROR.** Gate chạy 0 lệnh rồi ghi một cuốn sổ "xanh" là đúng nghĩa false-green.
  Dự án chưa có lệnh kiểm nào thì **bỏ hẳn khoá `gate`**, đừng khai mảng rỗng.
- **Mỗi lệnh phải là MỘT dòng.** Ledger là tệp máy-đọc theo dòng (`- <lệnh>  → exit N`), nên lệnh
  nhiều dòng vừa làm nơi đọc parse sai, vừa cho phép chèn một dòng `→ exit 0` GIẢ vào sổ bằng chứng.

Lệnh cần shell (`&&`, pipe, biến) ⇒ gói vào một script của dự án rồi khai script đó.

### `structure` — bốn luật kiến trúc, có ratchet

```jsonc
"structure": { "max_loc": 600, "shared_features": ["chat-core"],
               "baseline": "script/structure-baseline.json" }
```

`cc-harness structure` quét bốn loại vi phạm trong `src_dir`: tệp quá trần LOC · import chéo feature
(trừ whitelist, và chỉ qua public API) · tầng core import ngược lên feature · import sâu vượt public
API.

- **`max_loc`** — một trần cho MỌI loại tệp, không có nhánh theo đuôi tệp. **Nâng trần là quyết định
  của USER, agent không tự nới**: tệp sắp chạm ngưỡng là tín hiệu TÁCH.
- **`shared_features`** — module nghiệp vụ được nhiều feature dùng nguyên con. Vào whitelist phải đủ
  ba: ≥ 3 nơi dùng THẬT (không phải "sẽ dùng") · không hạ được xuống core · **USER duyệt**.
- **`baseline`** — nợ hiện có đóng băng ở đây. Vi phạm MỚI ⇒ FAIL; vi phạm cũ trong baseline ⇒ pass
  nhưng **tệp nợ không được dài thêm**. Trả nợ xong ⇒ `cc-harness structure --update-baseline`.
  Sửa baseline để "cho qua" là red flag review.

### `review` — cổng review

```jsonc
"review": { "confirm": "on", "soft_cap": 3 }
```

- **`confirm: "on"`** (mặc định) — agent **đánh giá và đề xuất**, USER chốt mỗi việc có vào luồng
  review không. Kiểm soát chặt nhất.
- **`confirm: "off"`** — agent tự đánh giá theo dấu hiệu (§12) rồi tự spawn, không hỏi. Khai `off`
  thì một dòng nhắc được bơm vào mỗi phiên, để agent biết mình đang ở chế độ nào.
- **`soft_cap`** — trần **MỀM** số vòng review. Hết trần ⇒ dừng, trình user *tiếp hay dừng*; user nói
  tiếp thì trần đặt lại. Không phải trần cứng: việc nặng review đến khi an toàn.

**Đề xuất là BẮT BUỘC ở CẢ HAI chế độ.** `off` chỉ bỏ vòng chờ người, không bỏ nghĩa vụ khai.

### `skills` — bơm skill riêng của stack

```jsonc
"skills": {
  "required": ["cc-design:design-system-web", "my-org:go-service-rules"],
  "hints": { "src/api/": "my-org:openapi-rules", "migrations/": "my-org:db-migration" }
}
```

- **`required`** — nhắc trong khối đầu mỗi phiên: *"nạp skill này TRƯỚC khi viết code thuộc phạm vi
  của nó"*.
- **`hints`** — `{ "<tiền tố đường dẫn>": "<skill>" }`, nhắc khi chạm chỗ đó.
- **Tên phải có namespace** `<plugin>:<skill>`. Gõ tên trần ⇒ WARN, vì Claude sẽ **không tìm thấy** và
  đó là lỗi im lặng.

Đây là đường **tổng quát** — dự án Go/Python/backend không có bề mặt UI nào vẫn khai được skill của
mình ở đây.

### `design_system` — đường tương thích, chỉ cho UI

```jsonc
"design_system": { "ds-web": "cc-design:design-system-web", "ds-mobile": "my-inhouse-ds" }
```

Chỉ phủ hai bề mặt UI, và có thêm một cổng `PreToolUse`: sửa tệp UI mà chưa nạp skill tương ứng thì
bị DENY. Dự án không có UI ⇒ **bỏ hẳn khoá này** và dùng `skills.required`.

Giá trị nhận hai dạng: `"<plugin>:<skill>"` (không kiểm được — plugin nằm ngoài repo) hoặc
`"<tên trần>"` = skill trong `.claude/skills/<tên>/` của CHÍNH dự án (kiểm được, và `doctor` nói ra
nếu thiếu).

### `rules.overrides` — tuỳ biến bộ luật theo mục

```jsonc
"rules": { "overrides": [
  { "section": "§1", "op": "replace", "file": "docs/rules/contract.md" },
  { "section": "§20", "op": "append",  "file": "docs/rules/backend.md" },   // §20 CHƯA tồn tại — đó là điều kiện của `append`
  { "section": "§4", "op": "remove",  "reason": "dự án không dựng feature kiểu đó" }
] }
```

| `op` | Nghĩa | Ràng buộc |
|---|---|---|
| `replace` | thay trọn mục, **kể cả các mục con của nó** | mục phải TỒN TẠI |
| `append` | thêm mục MỚI vào cuối | mục phải CHƯA tồn tại |
| `remove` | gỡ trọn mục | **bắt buộc `reason`**, và mỗi phiên đều nhắc lại |

- Bảng id: `cc-harness rules --index` · một mục: `cc-harness rules §2` · toàn văn:
  `cc-harness rules --show` · đã áp gì: `cc-harness rules --diff`.
- **`replace` nuốt trọn mục con** — thay §3 là xoá cả bốn mục con của nó, kể cả phần generic đáng giữ.
  Copy về thì **ghép** phần generic vào tệp của mình, đừng chỉ dán phần riêng.
- **`replace` một mục LÕI phải giữ dòng `<!-- inject: core -->`** trong tệp override. Quên thì plugin
  vẫn bơm (nó có danh sách LÕI khai cứng) nhưng cảnh báo mỗi phiên.
- **Mỗi mục override nên có `<!-- when: ... -->`** — đó là dòng DUY NHẤT agent thấy về mục đó trước khi
  quyết định có tra hay không.
- `remove` cố ý **ỒN**: mọi phiên đều thấy *"dự án này đã GỠ §X vì …"*. Cho phép tuỳ biến, không cho
  phép lỗ luật im lặng.

Mẫu đã điền cho một mini-app React Native: `examples/rn-miniapp/` (kèm README nêu ba điều dễ làm sai).

### `observe` — bằng chứng quan sát, KHÔNG BAO GIỜ chặn task

```jsonc
"observe": { "target": "in-process", "kind": "command" }                       // CLI · lib · backend
"observe": { "target": "served", "kind": "command", "port": 3000 }             // web dev server
"observe": { "target": "served", "kind": "screenshot-ios" }                    // simulator
"observe": { "target": "deployed", "kind": "command", "deployed_id_cmd": "…" } // môi trường thật
```

- **`in-process`** — CLI, lib, test, backend nghiệm thu bằng integration test. Chạy thẳng từ working
  tree, **không cần rig, không cần khoá**. Đây là mặc định, và là đích đúng cho phần lớn dự án.
- **`served`** / **`deployed`** — dùng thiết bị/host chung ⇒ là tài nguyên độc quyền, cần phối hợp.
- `kind` có hai giá trị chỉ đúng với mobile (`screenshot-ios`, `screenshot-android`). Stack khác dùng
  `command`; dự án không có bề mặt quan sát nào dùng `none`.

`cc-harness observe` **luôn exit 0**: không lấy được bằng chứng ⇒ hạ MỨC + nêu lý do, agent ghi
`PENDING` và land bình thường.

### `integrations` — bốn tích hợp ngoài

```jsonc
"integrations": { "cc_lock": "required", "cbm": "required", "rtk": "optional", "agent_tasks": "off" }
```

| Khoá | Tool | Khung làm gì |
|---|---|---|
| `cc_lock` | plugin `cc-lock` | áp luật khoá tệp trước khi sửa vùng single-writer; probe đã cài chưa |
| `cbm` | `codebase-memory-mcp` | cổng cứng "graph TRƯỚC, grep SAU", vũ trang lại theo MỖI yêu cầu |
| `rtk` | `rtk` | áp luật bằng chứng phải là output thô |
| `agent_tasks` | plugin `agent-tasks` | áp §14 + cổng claim-task; brief 7 mục vào item |

Ba trạng thái, và chúng thật sự khác nhau:

- **`required`** — thiếu ⇒ `doctor` WARN kèm lệnh cài, và agent phải nhắc user ngay response đầu phiên.
  Cổng tương ứng chạy ở mức chặt nhất.
- **`optional`** (mặc định) — luật vẫn áp, cổng canh ở mức thường, thiếu tool ⇒ WARN một lần.
- **`off`** — **im lặng TUYỆT ĐỐI**: không DENY, không WARN, không ghi state. Đây là lời hứa của khung
  với dự án không dùng tích hợp đó — nhưng phải do bạn khai, không phải khung tự đoán.

**Config của tích hợp là của plugin đó**, khung không đọc, không mang theo. Ví dụ danh sách khoá tệp
của cc-lock sống ở `<repo>/cc-lock.config.json`.

### `policy.mode` — công tắc chính sách model

```jsonc
"policy": { "mode": "quality" }
```

`quality` (mặc định, không thu hẹp gì) · `balance` (nấc giữa) · `usage` (tiết kiệm nhất). Bất biến ở
MỌI mode: sàn model cho review việc đắt · 3-strikes · trần vòng review · fan-out ≤ 3 · ngưỡng suy
luận. Mode **không tắt được cổng review**.

Mỗi clone/worktree chạy mode riêng bằng `/custom-claude-config-mode`; khoá này là mặc định của dự án.

---

## Ba dòng `.gitignore` bắt buộc

`cc-harness init` thêm giúp; `cc-harness doctor` kiểm bằng `git check-ignore` và WARN nếu thiếu:

```gitignore
docs-raw/     # nguyên liệu ngoài từ user (spec API, ảnh chuẩn)
docs/wip/     # brief · ledger · plan — output của agent
specs/        # spec hành vi
```

**Vì sao ba thứ này không được lên remote:** chúng **mô tả HIỆN TẠI** nên trôi khi code đi tiếp, và
một tài liệu outdate trên remote **tệ hơn không có** — người sau tin nó rồi làm theo hợp đồng không
còn đúng. Thứ **ghi QUÁ KHỨ** (changelog, knowledge base) thì vẫn commit: sự thật lịch sử không trôi.

---

## Kiểm sau khi khai

```bash
cc-harness config --check      # khoá lạ · khoá đã bỏ · sai kiểu · sai enum
cc-harness rules --diff        # override nào đã áp, mục nào bị gỡ
cc-harness rules --index       # dòng `when:` đọc có nghĩa không
cc-harness doctor              # quyền · trust · gitignore · tích hợp · bản export
cc-harness structure           # baseline có xanh không
cc-harness gate                # gate.commands có chạy thật không
```

`doctor` phân biệt ba trạng thái **trust**, và đây là bẫy đã gặp thật: Claude Code **bỏ qua toàn bộ
`permissions.allow`** của một workspace chưa trust, nên lệnh `cc-harness` vẫn bị hỏi quyền dù `init`
đã khai đúng. Mở Claude Code **tương tác** một lần tại thư mục dự án và đồng ý hộp thoại trust.

---

## Ba mẫu đầy đủ

### Backend Go

```jsonc
{
  "$schema": "cc-harness/1",
  "project":      { "name": "orders-svc", "src_dir": "internal" },
  "gate":         { "commands": ["go vet ./...", "golangci-lint run", "go test ./..."] },
  "structure":    { "max_loc": 500, "shared_features": ["money"] },
  "skills":       { "required": ["my-org:go-service-rules"],
                    "hints": { "internal/api/": "my-org:openapi-rules" } },
  "review":       { "confirm": "on", "soft_cap": 3 },
  "observe":      { "target": "in-process", "kind": "command" },
  "integrations": { "cc_lock": "required", "cbm": "required", "rtk": "off", "agent_tasks": "required" },
  "policy":       { "mode": "quality" }
}
```

### Thư viện Python

```jsonc
{
  "$schema": "cc-harness/1",
  "project":      { "name": "dataframe-tools", "src_dir": "src" },
  "gate":         { "commands": ["ruff check .", "mypy .", "pytest -q"] },
  "structure":    { "max_loc": 400 },
  "review":       { "confirm": "off", "soft_cap": 4 },
  "observe":      { "target": "in-process", "kind": "command" },
  "integrations": { "cc_lock": "off", "cbm": "optional", "rtk": "off", "agent_tasks": "off" }
}
```

Dự án này không có UI, không có alias, không có tích hợp nào ⇒ khai `off` cho đủ bốn. Khai `off` là
lời khai hợp pháp; khung im lặng vì **bạn đã nói**, không phải vì nó đoán.

### Mini-app React Native

```jsonc
{
  "$schema": "cc-harness/1",
  "project":       { "name": "chat-miniapp", "src_dir": "src", "aliases": { "@/": "src/" } },
  "gate":          { "commands": ["npm run typecheck", "npm run lint", "npm test"] },
  "structure":     { "max_loc": 600, "shared_features": ["chat-core"] },
  "design_system": { "ds-mobile": "cc-design:design-system-mobile" },
  "rules": { "overrides": [
    { "section": "§1", "op": "replace", "file": "docs/rules/contract.md"     },
    { "section": "§2", "op": "replace", "file": "docs/rules/architecture.md" },
    { "section": "§3", "op": "replace", "file": "docs/rules/testing.md"      },
    { "section": "§6", "op": "replace", "file": "docs/rules/conventions.md"  }
  ] },
  "observe":       { "target": "served", "kind": "screenshot-ios" },
  "integrations":  { "cc_lock": "required", "cbm": "required", "rtk": "optional", "agent_tasks": "required" },
  "policy":        { "mode": "quality" }
}
```

Bốn tệp override copy từ `examples/rn-miniapp/`.

---

## Hai chỗ config còn nghiêng theo stack — khai rõ

Bộ luật đã sạch stack (đo được: 0 dấu vết). Config thì còn hai chỗ nghiêng, cả hai **tuỳ chọn** nên
stack khác chỉ cần bỏ trống:

| Chỗ | Nghiêng về | Bỏ trống thì mất gì |
|---|---|---|
| `project.aliases` | stack có bundler/alias import (TS `paths`, webpack, jest) | `structure` không nhận ra import viết bằng alias — nó vẫn quét trần LOC và import tương đối bình thường |
| `observe.kind` có `screenshot-ios` / `screenshot-android` | mobile | không mất gì: `command` phủ mọi stack, `none` cho dự án không có bề mặt quan sát |

Không có chỗ nào **bắt buộc** khai theo một stack cụ thể. Ba mẫu ở trên là Go · Python · React Native,
và cả ba đều dùng cùng một schema, không có khoá nào chỉ-một-stack-mới-khai-được.
