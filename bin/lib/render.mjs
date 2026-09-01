// render.mjs — nối config + rules + filesystem thành BẢN LUẬT CUỐI CÙNG.
//
// Đây là nơi DUY NHẤT chạm đĩa cho luồng luật. `config.mjs` và `rules.mjs` giữ thuần để test
// được không cần đĩa; mọi thứ bẩn dồn về đây, và hook lẫn CLI gọi CÙNG hàm này — một nguồn sự
// thật, nên không thể có chuyện `--show` in ra một đằng còn phiên chạy một nẻo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import { loadConfig } from './config.mjs';
import { resolve as resolveRules } from './rules.mjs';

export const BASE_REL = 'rules/FRAMEWORK.md';

/** Đọc file override: phân biệt "không tồn tại" ≠ "không đọc được" (hợp đồng của rules.resolve). */
export function makeReader(root) {
  return (file) => {
    try {
      return { text: fs.readFileSync(path.join(root, file), 'utf8'), missing: false, why: null };
    } catch (e) {
      const missing = e && e.code === 'ENOENT';
      return { text: null, missing, why: missing ? 'không tồn tại' : `không đọc được (${(e && e.code) || e})` };
    }
  };
}

/** Thư mục cache — NGOÀI repo dự án, để repo người dùng không có file sinh nào. */
export function cacheDir() {
  const base = process.env.CLAUDE_PLUGIN_DATA || path.join(os.tmpdir(), 'cc-harness-data');
  return path.join(base, 'rules');
}

/**
 * Khoá cache băm NỘI DUNG, không băm mtime.
 * mtime đổi khi `git checkout`/copy mà nội dung y nguyên (miss vô ích), và KHÔNG đổi khi hai bản
 * khác nhau được ghi trong cùng một giây (hit SAI — bản luật cũ sống tiếp, im lặng). Chi phí đọc
 * vài file nhỏ mỗi phiên rẻ hơn nhiều so với một lần hit sai.
 */
export function cacheKey(baseText, config, overrideTexts) {
  const h = crypto.createHash('sha256');
  // Dấu ngăn giữa các phần là BẮT BUỘC, không phải cho gọn: nối trần thì ['ab','c'] và ['a','bc']
  // băm ra CÙNG một khoá ⇒ hai bộ luật khác nhau dùng chung một bản cache, sai hoàn toàn im lặng.
  const SEP = '\n<<cc-harness-sep>>\n';
  h.update(baseText);
  h.update(SEP);
  h.update(JSON.stringify(config?.rules ?? null));
  h.update(SEP);
  for (const t of overrideTexts) {
    h.update(t === null ? '<<missing>>' : t);
    h.update(SEP);
  }
  return h.digest('hex').slice(0, 16);
}

/**
 * @param {{root:string, pluginRoot:string, useCache?:boolean}} opts
 * @returns {{ok:boolean, text:string|null, applied:Array, removed:Array, errors:Array, warnings:Array, cacheHit:boolean, cachePath:string|null, config:object|null}}
 */
export function renderRules({ root, pluginRoot, useCache = true }) {
  const out = { ok: false, text: null, applied: [], removed: [], errors: [], warnings: [], cacheHit: false, cachePath: null, config: null };

  const basePath = path.join(pluginRoot, BASE_REL);
  let baseText;
  try {
    baseText = fs.readFileSync(basePath, 'utf8');
  } catch (e) {
    // Không có bộ luật gốc = plugin hỏng. Đây là lỗi CỦA PLUGIN, không phải của dự án, nên nói
    // thẳng ra thay vì im lặng bơm rỗng — phiên chạy không luật mà không ai biết là ca tệ nhất.
    out.errors.push({ code: 'base-missing', key: BASE_REL, message: `không đọc được bộ luật gốc ${basePath} (${(e && e.code) || e})` });
    return out;
  }

  const cfg = loadConfig(root);
  out.config = cfg.config;
  out.warnings.push(...cfg.warnings);

  // Dự án CHƯA cấu hình vẫn phải có luật để làm việc — nhưng phải NÓI RA, không im lặng.
  if (!cfg.ok && cfg.errors.some((e) => e.code === 'config-missing')) {
    out.errors.push(...cfg.errors);
    out.text = baseText;
    out.ok = true;
    return out;
  }
  if (!cfg.ok) {
    out.errors.push(...cfg.errors);
    out.text = baseText; // vẫn bơm base: sai config không được biến thành "không có luật"
    return out;
  }

  const overrides = cfg.config?.rules?.overrides ?? [];
  const reader = makeReader(root);
  const texts = overrides.map((o) => (o.file ? reader(o.file).text : `remove:${o.section}:${o.reason}`));

  const key = cacheKey(baseText, cfg.config, texts);
  const cpath = path.join(cacheDir(), `${key}.md`);
  out.cachePath = cpath;

  if (useCache) {
    try {
      out.text = fs.readFileSync(cpath, 'utf8');
      out.cacheHit = true;
      // Bản trộn lấy từ cache, nhưng `removed` phải tính lại: hook in cảnh báo "dự án đã gỡ §X"
      // MỖI phiên, kể cả phiên hit cache. Cache là để khỏi trộn lại, không phải để tắt cảnh báo.
      out.removed = overrides.filter((o) => o.op === 'remove').map((o) => ({ section: o.section, reason: o.reason }));
      out.ok = true;
      return out;
    } catch { /* miss — trộn lại bên dưới */ }
  }

  const r = resolveRules(baseText, overrides, reader);
  out.text = r.text;
  out.applied = r.applied;
  out.removed = r.removed;
  out.errors.push(...r.errors);
  out.ok = r.errors.length === 0;

  if (out.ok && useCache) {
    try {
      fs.mkdirSync(cacheDir(), { recursive: true });
      fs.writeFileSync(cpath, r.text);
    } catch (e) {
      // Không ghi được cache KHÔNG được làm hỏng phiên — nhưng cũng không được im.
      out.warnings.push({ code: 'cache-unwritable', key: cpath, message: `không ghi được cache (${(e && e.code) || e}) — phiên vẫn chạy, chỉ chậm hơn` });
    }
  }
  return out;
}
