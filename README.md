# cc-harness

Bộ khung quy trình cho Claude Code, dạng plugin. Cài **một lần cho cả máy**; mỗi dự án tuỳ biến bằng
**một tệp** `claude_config.json` ở gốc repo của nó.

**Không phụ thuộc tech stack.** Bộ khung không biết dự án của bạn viết bằng gì, và không cần biết:
thứ duy nhất đổi theo stack là **danh sách lệnh gate** — một mảng chuỗi trong config. Xem *[Đổi stack
là đổi một mảng](#đổi-stack-là-đổi-một-mảng)*.

Cài xong, phiên Claude Code của bạn có thêm: **21 skill** · **12 subagent** · **14 cổng hook** ·
**12 lệnh CLI** · một bộ luật 56 mục mà chỉ phần LÕI được bơm vào context.

---

## Cài

```bash
claude plugin marketplace add TanTranDev/members-cc-harness-publish
claude plugin install cc-harness@members-cc-harness
```

Rồi **khởi động lại Claude Code**.

⚠️ Tên marketplace là **`members-cc-harness`** — khác tên repo (`…-publish`). Đây là chỗ dễ gõ sai.

### Cập nhật

```bash
claude plugin update cc-harness
```

⚠️ **Cập nhật đi theo số `version`, không theo commit.** `plugin update` so **VERSION** chứ không so
nội dung: version không đổi thì nó báo *"already at the latest version"* rồi không làm gì. Mỗi bản
phát hành đều bump version, nên lệnh trên là đủ.

### Nếu repo phát hành ở chế độ PRIVATE

Claude Code cài plugin bằng `git clone`, dùng git credential helper của máy. Ba điều phải biết:

**1. `owner/repo` clone qua SSH theo MẶC ĐỊNH.** Muốn PAT qua HTTPS thì phải nói ra:

```bash
export CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1     # hoặc khai marketplace bằng URL https:// tường minh
```

**2. Lượt refresh nền TẮT credential helper.** Nên với private + HTTPS, `git pull` nền không auth
được và Claude Code rơi về **re-clone toàn bộ**. Vá bằng URL rewrite nhúng token — nó có hiệu lực cả
ở lượt nền vì không đi qua helper:

```bash
git config --global \
  url."https://x-access-token:$GIT_PAT@github.com/TanTranDev/members-cc-harness-publish".insteadOf \
      "https://github.com/TanTranDev/members-cc-harness-publish"
```

⚠️ **Scope tới đúng đường dẫn repo, KHÔNG phải hostname.** Một rewrite có base chỉ là `github.com` sẽ
áp cho **mọi** fetch/push tới GitHub trên máy đó và **ghi đè credential thường của bạn, kể cả khi
push repo của chính bạn**. Token nằm **plaintext** trong gitconfig ⇒ dùng token **read-only**.

Thêm một lớp để phiên không vỡ khi lượt nền thất bại:

```bash
export CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE=1
```

**3. SSH không bị ảnh hưởng bởi mục 2.** Máy cá nhân nên dùng SSH (key trong `ssh-agent`, host trong
`known_hosts`) — không có token plaintext, không có rủi ro rewrite. Để PAT cho CI, nơi không có SSH
key: `GH_TOKEN=<pat> gh auth setup-git`.

### Ghim một bản cụ thể

Plugin source nhận cả `ref` (branch/tag) và `sha`; **`sha` thắng `ref`** khi khai cả hai. Ghim theo
`sha` thì bản cài vẫn dựng được **dù tag đã bị xoá**, miễn commit còn reachable.

---

## Năm phút đầu trong một dự án

```bash
cc-harness init      # sinh claude_config.json + mở quyền chạy cc-harness cho dự án này
cc-harness doctor    # kiểm mọi thứ, kể cả trạng thái trust
```

`init` **không bao giờ đè** `claude_config.json` đã có, và **merge** (không ghi đè)
`.claude/settings.json`. Nó cũng dò manifest của dự án (`go.mod`, `pyproject.toml`, `Cargo.toml`,
`pom.xml`, `build.gradle.kts`, `composer.json`, `Gemfile`, `package.json`) để đề xuất sẵn lệnh gate
đúng stack.

> ⚠️ **Quyền chỉ có hiệu lực khi workspace đã được TRUST.** Claude Code bỏ qua toàn bộ
> `permissions.allow` của một dự án chưa trust, nên lệnh `cc-harness` vẫn bị hỏi quyền dù `init` đã
> khai đúng. Mở Claude Code **tương tác** một lần tại thư mục dự án và đồng ý hộp thoại trust.
> `cc-harness doctor` kiểm và nói thẳng trạng thái này — triệu chứng của nó (bị hỏi quyền) chỉ thẳng
> vào chỗ SAI.

Không có `claude_config.json` ⇒ plugin **vẫn chạy** với bộ luật gốc và **nói ra mỗi phiên** rằng dự
án chưa cấu hình. Không có đường im lặng.

---

## Đổi stack là đổi một mảng

```jsonc
"gate": { "commands": ["npm run typecheck", "npm run lint", "npm test"] }     // JS/TS
"gate": { "commands": ["go vet ./...", "golangci-lint run", "go test ./..."] } // Go
"gate": { "commands": ["ruff check .", "mypy .", "pytest -q"] }                // Python
"gate": { "commands": ["cargo clippy -- -D warnings", "cargo test"] }          // Rust
"gate": { "commands": ["./gradlew check"] }                                    // Kotlin/Java
"gate": { "commands": ["mvn -q verify"] }                                      // Maven
"gate": { "commands": ["bundle exec rubocop", "bundle exec rspec"] }           // Ruby
"gate": { "commands": ["dotnet format --verify-no-changes", "dotnet test"] }   // .NET
"gate": { "commands": ["mix format --check-formatted", "mix test"] }           // Elixir
"gate": { "commands": ["swift build", "swift test"] }                          // Swift
```

Đó là **toàn bộ** phần phụ thuộc stack. Không có khoá nào bắt buộc khai theo một ngôn ngữ cụ thể;
`CONFIG.md` có ba mẫu đầy đủ (**Go · Python · React Native**) dùng **cùng một schema**, và một mục
khai thẳng hai chỗ duy nhất còn nghiêng về stack có bundler — cả hai **tuỳ chọn**.

Hai ràng buộc được **cưỡng chế**, không phải khuyến nghị:

- **Mảng rỗng ⇒ ERROR.** Gate chạy 0 lệnh rồi ghi một cuốn sổ "xanh" là đúng nghĩa false-green.
- Lệnh nào exit ≠ 0 ⇒ ledger ghi đúng mã thoát đó. Không có đường "gate xanh vì tôi nói thế".

📖 Từng khoá, mặc định, ai đọc nó: **`CONFIG.md`**.

---

## Bộ luật: chỉ §0 được bơm, phần còn lại TRA khi cần

Bộ luật cắt theo **nhịp đọc**, không theo chủ đề:

| Tầng | Đọc lúc nào | Đường tới Claude |
|---|---|---|
| **LÕI** — §0: cổng cứng · phân loại việc · luật output · nguồn sự thật | giây 0, mọi phiên | bơm ở `SessionStart` |
| **TRA** — §1…§14 | khi đang làm đúng việc đó | `cc-harness rules <id>`, kèm một dòng index trong LÕI |

Đo trên máy: **≈ 11.900 byte** cho toàn bộ khối đầu phiên — cùng một bộ luật, không mục nào bị xoá.
Mục nào ở tầng nào do annotation `<!-- inject: core -->` trong `rules/FRAMEWORK.md` quyết định; mặc
định là TRA, vào LÕI phải khai tường minh.

### Tuỳ biến — base + override theo mục

Plugin ship **đúng một** bộ luật gốc. Dự án không copy nó; dự án khai những mục mình muốn đổi:

```jsonc
"rules": { "overrides": [
  { "section": "§1",  "op": "replace", "file": "docs/rules/contract.md" },
  { "section": "§20", "op": "append",  "file": "docs/rules/backend.md" },
  { "section": "§4",  "op": "remove",  "reason": "dự án không dựng feature kiểu đó" }
] }
```

| `op` | Nghĩa | Ràng buộc |
|---|---|---|
| `replace` | thay trọn mục (kể cả mục con) | section phải TỒN TẠI |
| `append` | thêm mục MỚI vào cuối | section phải CHƯA tồn tại |
| `remove` | gỡ trọn mục | **bắt buộc `reason`**, và mỗi phiên đều nhắc lại |

`remove` cố ý **ồn**: gỡ một mục luật thì mọi phiên đều thấy dòng *"dự án này đã GỠ §X vì …"*. Cho
phép tuỳ biến, nhưng không cho phép lỗ luật im lặng.

⚠️ `replace` một mục LÕI thì **giữ lại dòng `<!-- inject: core -->`** trong tệp override. Quên thì
plugin vẫn bơm (nó có danh sách LÕI khai cứng) nhưng sẽ cảnh báo mỗi phiên.

```bash
cc-harness rules --index           # bảng mục: id · dùng khi nào
cc-harness rules §2                # in ĐÚNG một mục, đã trộn override
cc-harness rules --list-sections   # section-id + tầng, để khai vào config
cc-harness rules --diff            # override nào đã áp
```

---

## Lệnh

```bash
cc-harness init [--dry-run]                    # sinh config + mở quyền
cc-harness doctor                              # cổng setup: config · luật · design system · tích hợp
cc-harness config --check                      # kiểm claude_config.json
cc-harness rules --index | <id> | --show | --diff | --list-sections
cc-harness structure [--update-baseline]       # 4 luật kiến trúc §2, ratchet theo baseline
cc-harness spec [<path>] [--allow-removals]    # format spec + guard mất-mát scenario
cc-harness gate --out <path>                   # chạy gate.commands tuần tự + ghi ledger
cc-harness changelog [<YYYYMMDD>|--last <N>]   # đọc gộp changelog fragment
cc-harness observe [--probe|<slug> [-- <lệnh>]]  # bằng chứng quan sát
cc-harness policy --check|--render|--mode|--set-mode <m>
cc-harness export                              # bản chạy độc lập vào script/ cho CI
```

**Ba mức nghiêm khắc, cố ý khác nhau** — đọc kỹ trước khi dùng trong CI:

| Vai | Lệnh | Không phân giải được root thì… |
|---|---|---|
| **Cổng** | `structure` · `spec` · `gate` | **exit 2 + nói cách sửa.** Không có cây để kiểm mà báo xanh chính là false-green |
| **Tư vấn** | `changelog` · `doctor` · `config` | cảnh báo rồi chạy tiếp với thư mục hiện hành |
| **Không bao giờ chặn** | `observe` | **luôn exit 0.** Không lấy được bằng chứng ⇒ hạ MỨC + nêu lý do; agent ghi `PENDING` vào ledger và land bình thường |

Mọi lệnh đều **in `root:` đã dùng** — chạy nhầm cây là thứ phải NHÌN THẤY được, không phải đoán. Root
tìm bằng cách leo lên từ thư mục hiện hành tới khi gặp `claude_config.json`, nên chạy từ thư mục con
vẫn đúng; ép tường minh bằng `--root <path>`.

---

## Tích hợp ngoài — tuỳ chọn, và tắt được

Harness **áp luật** dùng chúng; **config là của plugin đó**, harness không đọc, không mang theo.

| Khoá | Plugin/tool | Harness làm gì |
|---|---|---|
| `cc_lock` | `cc-lock` | áp luật khoá tệp trước khi sửa hot-zone; probe đã cài chưa |
| `cbm` | `codebase-memory-mcp` | áp cổng cứng *"graph TRƯỚC, grep SAU"* — vũ trang lại theo **mỗi yêu cầu** của user |
| `rtk` | `rtk` | áp luật bằng chứng phải là output thô |
| `agent_tasks` | `agent-tasks` | áp **§14**: claim task trước khi sửa code · brief 7 mục vào item · chia việc = tạo item có `parent`/`depends-on` |

Mỗi khoá nhận `required` · `optional` · `off`. Khai `required` mà thiếu ⇒ cảnh báo kèm cách cài.
Khai **`off` ⇒ im lặng HỢP PHÁP**, vì đã khai — cổng tương ứng không chạy, và không có dòng nhắc nào.

---

## Ví dụ đã điền

`examples/rn-miniapp/` là **một** dự án mẫu (React Native + Module Federation) — nó ở đó để cho thấy
**HÌNH THỨC** của một override: tệp trông thế nào, khai vào config ra sao. **Nội dung** của nó chỉ
đúng với stack đó (vd bẫy `TextInput` cắt descender), nên đừng chép nội dung sang dự án khác.

Dự án Go/Python/Rust/Java… dùng cùng cơ chế: viết tệp override của stack mình rồi trỏ tới bằng
`rules.overrides`. Không cần ví dụ riêng cho từng stack mới dùng được.

---

## Bản phát hành này chứa gì

Chỉ **phần CHẠY**. Tài liệu thiết kế, luật nội bộ của người bảo trì, và kế hoạch nâng cấp nằm ở repo
phát triển (private) — cố ý không đi kèm.

Không tệp nào trong bản này được phép trỏ vào chúng. Nếu bạn gặp một tham chiếu tới tài liệu nội bộ
của người bảo trì — thứ không có trong bản này để mà mở — **đó là lỗi phát hành**, hãy báo lại. Bản
phát hành có lưới máy kiểm điều đó, nên một tham chiếu treo lọt ra được là dấu hiệu lưới hỏng.

Kiểm bản đang có trong tay:

```bash
claude plugin validate .     # manifest hợp lệ
```

---

## Giấy phép

**Độc quyền — không phải mã nguồn mở.** Không có quyền nào được cấp mặc định; **sử dụng thương mại
luôn cần cho phép bằng văn bản** của chủ sở hữu. Truy cập được repo, token, hay bản phát hành **không**
phải là quyền sử dụng. Toàn văn: `LICENSE`.

Phần dẫn xuất từ [`obra/superpowers`](https://github.com/obra/superpowers) (14 skill) ở dưới **MIT,
© 2025 Jesse Vincent** — `LICENSE` không áp cho chúng và không hạn chế quyền bạn đã có với chúng theo
MIT. Danh sách + toàn văn MIT: `THIRD-PARTY-NOTICES.md`.
