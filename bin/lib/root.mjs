// root.mjs — phân giải ROOT của repo DỰ ÁN (không phải root của plugin).
//
// Marker là `claude_config.json`. Bản script cũ dùng `(.claude/ hoặc script/) VÀ (CLAUDE.md hoặc
// package.json hoặc .git)` vì nó sống ở HAI nơi và không được suy root từ vị trí file. Ở mô hình
// plugin, repo dự án KHÔNG còn mount `.claude/` nữa nên marker đó vừa hết đối tượng vừa quá lỏng
// (một feature có thư mục tên `script/` cũng đậu). `claude_config.json` là marker do chính bộ khung
// đặt ra, một file, không mơ hồ ⇒ không cần trần homedir như bản cũ.
//
// LUẬT: `cwd` NHẬN QUA THAM SỐ. File này sống trong plugin nhưng nói về cây của người dùng.
import fs from 'node:fs';
import path from 'node:path';

import { CONFIG_FILENAME } from './config.mjs';

/**
 * Leo từ `start` lên tìm thư mục chứa `claude_config.json`.
 * @returns {string|null} null khi không có marker nào trên đường đi — KHÔNG đoán bừa `start`.
 */
export function findRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    // Phải là FILE: một thư mục trùng tên không phải cấu hình, nhận nó rồi `loadConfig` sẽ nổ
    // EISDIR và người đọc đi tìm nhầm chỗ.
    let hit = false;
    try { hit = fs.statSync(path.join(dir, CONFIG_FILENAME)).isFile(); } catch { hit = false; }
    if (hit) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/**
 * Phân giải root cho một lệnh con.
 * @param {{argRoot?:string, cwd:string, gate?:boolean}} o
 *   gate=true  ⇒ không phân giải được thì TỪ CHỐI (ok:false). Không có cây để kiểm mà báo xanh
 *                chính là false-green — lớp lỗi đắt nhất của bộ khung.
 *   gate=false ⇒ vai tư vấn (doctor, init): lùi về cwd nhưng PHẢI kèm cảnh báo, không im lặng.
 * @returns {{ok:true, root:string, source:'flag'|'marker'|'cwd', warning?:string}
 *          |{ok:false, message:string}}
 */
export function resolveRoot({ argRoot, cwd, gate = false }) {
  if (argRoot) {
    const abs = path.resolve(argRoot);
    let why = null;
    try {
      if (!fs.statSync(abs).isDirectory()) why = `--root trỏ tới thứ KHÔNG phải thư mục: ${abs}`;
    } catch { why = `--root trỏ tới đường dẫn KHÔNG TỒN TẠI: ${abs}`; }
    if (!why) return { ok: true, root: abs, source: 'flag' };
    if (gate) return { ok: false, message: `${why} — không có cây nào để kiểm, cấm báo xanh` };
    return { ok: true, root: path.resolve(cwd), source: 'cwd', warning: `${why}\n  ↳ chạy tiếp với cwd (${cwd})` };
  }

  const found = findRoot(cwd);
  if (found) return { ok: true, root: found, source: 'marker' };

  const why = `không tìm thấy ${CONFIG_FILENAME} từ ${cwd} lên tới root filesystem`;
  if (gate) {
    return {
      ok: false,
      message: `${why}\n  ↳ dự án chưa cấu hình: chạy \`cc-harness init\`, hoặc ép root: --root <path>`,
    };
  }
  return {
    ok: true,
    root: path.resolve(cwd),
    source: 'cwd',
    warning: `${why}\n  ↳ chạy tiếp với cwd — kết quả có thể không liên quan tới dự án nào`,
  };
}
