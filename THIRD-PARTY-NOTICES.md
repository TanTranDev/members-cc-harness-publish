# Third-party notices / Thông báo về phần của bên thứ ba

`LICENSE` (giấy phép độc quyền của cc-harness) **KHÔNG áp dụng** cho những phần liệt kê ở đây, và
**không hạn chế** bất kỳ quyền nào bạn đã có với chúng theo giấy phép gốc — kể cả khi bạn lấy chúng
trực tiếp từ nguồn gốc.

Tệp này là **điều kiện của giấy phép MIT**, không phải phép lịch sự: MIT cho phép sublicense (nên
cc-harness được đặt điều khoản riêng cho bản kết hợp) nhưng **bắt buộc** mang theo thông báo bản
quyền và toàn văn giấy phép. Gỡ tệp này là vi phạm MIT.

---

## 1. superpowers — MIT

- **Nguồn**: https://github.com/obra/superpowers
- **Bản đối chiếu**: nhánh `main` (đối chiếu 2026-08-31); phần vendor ban đầu từ
  `superpowers@claude-plugins-official` v5.1.0
- **Giấy phép**: MIT
- **Bản quyền**: Copyright (c) 2025 Jesse Vincent

### Phần dẫn xuất trong repo này

**14 skill** dưới `skills/` có cùng tên với skill của superpowers và là bản vendor hoặc bản đã sửa
từ đó. Một số đã được viết lại đáng kể cho bộ khung này (rõ nhất là `brainstorming`), nhưng viết lại
một công trình MIT vẫn tạo ra **công trình phái sinh** — thông báo vẫn phải đi kèm:

```
brainstorming                    receiving-code-review        using-git-worktrees
dispatching-parallel-agents      requesting-code-review       using-superpowers
executing-plans                  subagent-driven-development   verification-before-completion
finishing-a-development-branch   systematic-debugging          writing-plans
                                 test-driven-development       writing-skills
```

Gồm cả các tệp phụ trong những thư mục đó (`visual-companion.md`, `scripts/`, các tệp `*-prompt.md`,
`condition-based-waiting*`, `root-cause-tracing.md`, `defense-in-depth.md`, `find-polluter.sh`,
`testing-anti-patterns.md`, `persuasion-principles.md`, `graphviz-conventions.dot`,
`render-graphs.js`, `references/*-tools.md`).

Hook `superpowers-session-start.sh` cũng là bản vendor từ đó. Nó **đã được gỡ ở v1.1.0** — không
còn trong repo; lý do gỡ ghi ở `hooks/hooks.json` mục `_ghi_chú`.

### Toàn văn giấy phép MIT

```
MIT License

Copyright (c) 2025 Jesse Vincent

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. Phần KHÔNG phải của bên thứ ba

Mọi thứ còn lại là công trình gốc của Chủ sở hữu và thuộc `LICENSE`:

| Phần | Nội dung |
|---|---|
| `rules/` | bộ luật gốc (§0–§14), cơ chế tách tầng LÕI/TRA |
| `bin/` | CLI `cc-harness` và toàn bộ `bin/lib/*.mjs` |
| `hooks/` | 14 hook, TRỪ `superpowers-session-start.sh` (đã gỡ) |
| `agents/` | 12 subagent |
| `policy/` | tham số vận hành ba tầng |
| `examples/` | ví dụ override cho RN mini-app |
| **7 skill** | `behavior-specs` · `changelog` · `confirm-understanding` · `custom-claude-config-mode` · `handoff` · `migrate` · `writing-component-tests` |

---

## 3. Đã GỠ ở v1.1.0 để giảm bề mặt tái phân phối

Tệp `anthropic-best-practices.md` (từng nằm dưới `skills/writing-skills/`, **nay không còn trong
repo**) — bản copy 46 KB tài liệu công khai của Anthropic,
đến repo này qua bản vendor superpowers. MIT của superpowers không đổi được bản quyền của Anthropic
trong nội dung đó, và tái phân phối tài liệu của bên khác **bên trong** một plugin có điều khoản hạn
chế là bề mặt không cần thiết. `skills/writing-skills/SKILL.md` nay trỏ tới trang công khai
https://code.claude.com/docs/en/skills.

---

## 4. Thêm phần của bên thứ ba về sau

Vendor thêm bất cứ thứ gì ⇒ thêm một mục ở tệp này TRƯỚC khi commit, gồm: nguồn · phiên bản/ngày đối
chiếu · giấy phép · **toàn văn** giấy phép nếu nó đòi (MIT, BSD, Apache đều đòi) · danh sách đường
dẫn trong repo. Vendor mà không khai là vi phạm giấy phép của người ta, và nó **im lặng** — không lỗi
build nào bắt được.
