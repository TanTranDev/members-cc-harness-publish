## 6. Coding conventions

- **TypeScript strict**. Không dùng `any` — dùng `unknown` + narrow.
- **Result pattern** cho thao tác có thể fail: `Result<T, AppError>` thay vì throw.
- **Zustand** cho state cục bộ feature. Không Redux. Store đặt trong `<feature>/model/`.
- **Style**: `StyleSheet.create` colocated; tránh inline style ngoài demo. Color/spacing dùng
  `core/theme/tokens`.
- **Font**: theo `PROJECT.md`. File font có sẵn ở môi trường runtime — mini-app chỉ tham chiếu
  qua `fontFamily`, không tự bundle font.
- **No web branches mới**: target chỉ React Native. Code cũ có nhánh `Platform.OS === 'web'` thì
  giữ; code mới không thêm.
- **Import order**: stdlib → 3rd party → `@/core` → `@/features/<self>` → relative. ESLint enforce.
- **File naming**: `PascalCase.tsx` cho component, `camelCase.ts` cho logic, `kebab-case` cho folder.
- **Comment**: chỉ ghi WHY khi non-obvious (constraint ẩn, workaround có nguồn gốc cụ thể). Đừng
  ghi lại WHAT.

### TextInput — chống crop descender (font có descender dài)

Font có descender (`g`, `y`, `p`, `j`) dài — như font của dự án này, xem `PROJECT.md` — nếu set
sai dễ bị cắt nửa dưới khi nhập:

- **KHÔNG** set `lineHeight` trên TextInput.
- **KHÔNG** set `includeFontPadding: false`. Để mặc định `true` (Android).
- Set `minHeight ≥ 48` (cũng đáp ứng tap-target iOS HIG).
- Set `textAlignVertical: 'center'` (Android only, iOS ignore).
- `paddingVertical` ≥ `fontSize × 0.75` để có headroom an toàn.
