# §4 — Workflow thêm một feature: skeleton của React Native mini-app

```jsonc
{ "rules": { "overrides": [ { "section": "§4", "op": "replace", "file": "docs/rules/workflow.md" } ] } }
```

## Workflow thêm 1 feature mới

```
1. Tạo skeleton:
   src/features/<feature-name>/
     ├── __tests__/<feature-name>.spec.ts   ← VIẾT TRƯỚC
     ├── model/store.ts
     ├── ui/<Feature>Screen.tsx
     └── index.ts

2. Viết test scenarios (red).
3. Implement đến khi green.
4. Wire vào App.tsx (route mới hoặc tab) — viết integration test ở App level nếu là main flow.
5. `cc-harness gate` xanh → changelog fragment → commit.
```

Feature ≤ ~15 tệp. Phình ⇒ tách **sub-feature**: thư mục con có `index.ts` riêng làm public API (mẫu
đúng: `chat/mention/`). Tệp trong feature chỉ import sub-feature qua `index.ts` của nó.

Screen lớn ⇒ tách section components vào `ui/sections/`. Store lớn ⇒ tách theo slice/concern.
