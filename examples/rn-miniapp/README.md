# `examples/rn-miniapp/` — một dự án RN mini-app khai lại đủ phần stack

Bộ luật gốc **không gắn với stack nào**: nó chỉ ship nguyên lý bê-đi-được và chỗ dành sẵn. Thư mục này
là bằng chứng mô hình override đủ mạnh — **cùng một plugin, một dự án React Native + Module Federation
vẫn nhận được đúng bộ luật riêng của nó.**

## Cách dùng

Copy các tệp cần thiết vào `docs/rules/` của dự án, rồi khai một khối duy nhất:

```jsonc
{
  "$schema": "cc-harness/1",
  "project": { "name": "my-miniapp", "src_dir": "src", "aliases": { "@/": "src/" } },
  "gate":    { "commands": ["npm run typecheck", "npm run lint", "npm test"] },
  "rules": { "overrides": [
    { "section": "§1", "op": "replace", "file": "docs/rules/contract.md"     },
    { "section": "§2", "op": "replace", "file": "docs/rules/architecture.md" },
    { "section": "§3", "op": "replace", "file": "docs/rules/testing.md"      },
    { "section": "§4", "op": "replace", "file": "docs/rules/workflow.md"     },
    { "section": "§6", "op": "replace", "file": "docs/rules/conventions.md"  }
  ] }
}
```

| Tệp | Thay mục | Nội dung riêng của RN |
|---|---|---|
| `contract.md` | §1 | slug · `shared` deps · entry expose · AppRegistry name — contract Module Federation |
| `architecture.md` | §2 | cây `src/` thật: `App.tsx` là MF entry, `core/bridge/`, `core/theme/`, feature có `ui`/`model`/`api`/`hooks` |
| `testing.md` | §3 | jest preset RN, `react-test-renderer`, `@testing-library/react-hooks`, `__mocks__/` cho camera/picker |
| `workflow.md` | §4 | skeleton feature, wire vào `App.tsx`, tách `ui/sections/` |
| `conventions.md` | §6 | quy ước RN, kèm bẫy TextInput cắt descender — thứ chỉ đúng với RN |

## Ba điều dễ làm sai khi copy về

1. **`replace` NUỐT TRỌN mục con.** `replace §3` xoá cả bốn mục con của §3 trong bộ luật gốc, kể cả
   phần generic đáng giữ (bảng *"PHẢI test / KHÔNG cần test"*, luật mutation, luật test code phân giải
   đường dẫn). Copy về thì **ghép** phần generic vào tệp của mình, đừng chỉ dán phần RN.
2. **Mục LÕI phải giữ annotation.** Không mục nào ở đây thuộc LÕI, nên không vướng — nhưng nếu sau này
   `replace §0` thì phải mang theo dòng `<!-- inject: core -->`.
3. **`when:` là dòng duy nhất agent thấy về mục đó** trước khi quyết định có tra hay không. Viết một
   dòng `<!-- when: ... -->` cho mục mình thay, đừng để trống.

Kiểm sau khi khai: `cc-harness rules --diff` (override nào đã áp) · `cc-harness rules §2` (ra bản của
dự án chưa) · `cc-harness rules --index` (dòng `when:` đọc có nghĩa không).
