# §3 — Test: phần riêng của React Native + jest

Bản đã điền của các mục stack-specific trong §3. Bộ luật gốc giữ phần bê-đi-được (bảng *"PHẢI test /
KHÔNG cần test"*, luật test code phân giải đường dẫn, luật "thêm lớp kiểm phải có ca FAIL được"); tệp
này chỉ nói chuyện của RN.

```jsonc
{ "rules": { "overrides": [ { "section": "§3", "op": "replace", "file": "docs/rules/testing.md" } ] } }
```

⚠️ `replace §3` **nuốt trọn** cả các mục con của nó. Giữ lại phần generic khi copy về, đừng thay
nguyên mục bằng riêng phần dưới đây.

## Bắt buộc trước khi viết code prod

1. Tạo tệp test trước: `src/features/<f>/__tests__/<thing>.test.ts(x)`
2. Viết test fail trước (Red): mô tả hành vi qua test name `it('should ...')`.
3. Chạy `npm run test:watch -- <path>` xác nhận fail đúng lý do (không phải syntax error).
4. Viết code tối thiểu để pass (Green).
5. Refactor + test vẫn pass.

## Phạm vi test

- **Pure logic / store / reducer / util**: bắt buộc unit test, coverage ≥ 90%.
- **Hooks**: dùng `@testing-library/react-hooks` style (RN test renderer).
- **Screen / component**: integration test với `react-test-renderer` — assert behavior
  (event → state → render), **không** snapshot toàn cây.
- **API client của feature**: mock `core/api/http`, test request shape + error mapping (`Result<T, E>`).
- Mock platform-specific (camera, picker) qua `__mocks__/`.

## Lệnh

```bash
npm test -- <path-test-file>   # vòng TDD: TARGETED — chỉ tệp đang sửa
npm run test:watch -- <path>   # vòng TDD dạng watch
npm test                       # full suite — CHỈ ở gate cuối, 1 lần, ghi ledger
npm run test:ci                # ci + coverage
```

Cấu hình: `jest.config.js` (preset RN 0.85, paths `@/`, `@app/`, `@bridge/`).

Khai vào `claude_config.json` để `cc-harness gate` chạy đúng bộ này:

```jsonc
{ "gate": { "commands": ["npm run typecheck", "npm run lint", "npm test"] } }
```

## Vùng xám riêng của UI

Conditional render MỚI ⇒ 1 render test cho **cả hai phía** điều kiện. Đổi điều kiện SẴN CÓ đã có test
phủ ⇒ sửa test đó, không thêm test mới.
