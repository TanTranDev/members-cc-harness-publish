# §2 — Kiến trúc: cây thư mục của một mini-app React Native + Module Federation

Bản đã điền của mục §2 cho một loại dự án cụ thể. Dự án RN mini-app `replace` §2 bằng tệp này.

```jsonc
{ "rules": { "overrides": [ { "section": "§2", "op": "replace", "file": "docs/rules/architecture.md" } ] } }
```

⚠️ Giữ lại phần **nguyên lý generic** của §2 gốc khi replace (4 tầng, DAG một chiều, public API,
tiêu chí shared feature, trần LOC) — tệp này chỉ thay phần BẢN ĐỒ THƯ MỤC.

## Cây thư mục


Với dự án này: mỗi feature là một module độc lập, tự chứa UI / state / logic / tests / mock. `core/` chỉ giữ thứ thực sự dùng chung ≥2 features.

```
src/
├── app/
│   ├── App.tsx                ← MF entry, chỉ wire navigation + providers
│   └── ui/                    (BootGate, BootError — bootstrap UI)
├── core/                      ← shared primitives (tối thiểu, không feature-specific)
│   ├── auth/                  (zustand store giữ token phiên nhận qua bridge)
│   ├── bridge/                (HostBridge native module wrapper)
│   ├── theme/                 (tokens, ThemeProvider)
│   ├── ui/                    (Icon, ConfirmDialog, …)
│   └── navigation/            (route param types)
└── features/
    └── <feature-name>/        ← KEBAB-CASE, vd: auth, chat-list
        ├── ui/                (screens + components của feature)
        ├── model/             (zustand store / state machine / types)
        ├── api/               (REST/WS calls riêng feature)
        ├── hooks/             (useXxx)
        ├── __tests__/         (unit + integration tests)
        ├── __mocks__/         (test fixtures, dữ liệu mock)
        └── index.ts           ← public API (CHỈ export những gì App/feature khác dùng)
```

**Nguyên tắc**:
- Feature **không** import từ feature khác — trừ **shared feature** trong whitelist (import CHỈ qua `index.ts`, xem nguyên lý trên). Chia sẻ kiểu khác ⇒ promote lên `core/`, dùng event/registry, hoặc xin USER duyệt vào whitelist.
- Feature **chỉ** export qua `index.ts`. Cấm import sâu (`features/x/ui/Foo`).
- File public của feature đặt tên rõ scope: `LoginScreen`, `useAuthStore`, không tên chung như `Screen.tsx`.
- `core/` không được import từ `features/`. Nếu cần ⇒ `core/` đó đặt sai chỗ, hoặc phải đảo chiều bằng registry (feature tự đăng ký vào core, vd handler WS).
- Một feature ≤ ~15 file. Nếu phình ⇒ tách thành **sub-feature**: thư mục con có `index.ts` riêng làm public API (mẫu đúng: `chat/mention/`). File trong feature chỉ import sub-feature qua `index.ts` của nó.
- **Mọi file dưới `src/` của repo sản phẩm ≤ 600 dòng (cứng) — mục tiêu chung ≤ 300** (script của CHÍNH bộ khung có trần RIÊNG, xem luật 7 bên dưới — hai câu hỏi khác nhau, cố ý không dùng chung hằng dù hai số hiện trùng nhau). USER chốt 2026-08-10: nâng trần chung từ 400 lên 600 VÀ bỏ luôn ngoại lệ `ui/*.tsx ≤ 500` (nới có chủ đích thời trần 400, lý do "styles colocated chiếm chỗ" — chốt 2026-07-18, `docs/knowledge/multi-agent/03`), vì mức 600 đã bao trọn lý do nới ấy; một trần cho mọi loại file thì không còn nhánh theo đuôi file để tranh cãi. Screen lớn ⇒ tách section components (`ui/sections/`), store lớn ⇒ tách theo slice/concern. File sắp chạm ngưỡng là tín hiệu tách, không phải tín hiệu xin nới ngưỡng — **nâng trần là quyết định của USER, agent KHÔNG tự nới**.
- `core/ui` chỉ nhận **primitive generic** (Avatar, ConfirmDialog…). Component mang nghiệp vụ cụ thể ⇒ thuộc về feature, kể cả khi đang được 2 feature dùng (cân nhắc promote đúng nghĩa hoặc tách nhỏ).

