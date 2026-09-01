// Entry point của hook design-gate. Đọc payload PreToolUse trên stdin, in JSON (nếu có gì để nói).
//
// Tồn tại như một FILE RIÊNG thay vì `node -e` trong hook, vì bản `node -e` phải tự ghép
// `file://` cho import động — và trên Git Bash (Windows) `$(pwd)` trả `/c/Users/...`, thứ Node
// từ chối với "File URL path must be absolute". Gọi thẳng file thì MSYS tự convert đường dẫn
// argv sang dạng Windows, không còn chỗ nào để ghép sai.
import fs from 'node:fs';

import { checkEdit } from './design-gate.mjs';

let raw = '';
try {
  raw = fs.readFileSync(0, 'utf8');
} catch {
  process.exit(0); // không có stdin ⇒ không phải lượt hook thật
}

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0); // payload hỏng là việc của host, guard này không phán xét
}

try {
  const out = checkEdit(payload, {});
  // In khi có BẤT KỲ khoá nào — `hookSpecificOutput` (deny) hoặc `systemMessage` (nhắc).
  // Bản trước chỉ kiểm `systemMessage`, sót lại từ thời guard còn là warn-mode: đổi hợp đồng ở
  // design-gate.mjs mà quên sửa nơi dùng ⇒ cổng CHẠY nhưng output bị nuốt, và mọi test đơn vị
  // vẫn xanh vì không cái nào đi qua entry này. Chỉ chạy thật trong một phiên Claude Code mới lộ.
  if (out && Object.keys(out).length) process.stdout.write(JSON.stringify(out));
} catch {
  // Guard không được làm hỏng một lượt Edit: mọi lỗi đều nuốt, và vẫn exit 0.
}
process.exit(0);
