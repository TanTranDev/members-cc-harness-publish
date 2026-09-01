// structure.mjs — `cc-harness structure`. Port của script/structure-check.mjs.
//
// Bốn luật (nghĩa giữ NGUYÊN từ bản script, xem §2 của bộ luật):
//   1. file-too-long         file > max_loc dòng (bỏ qua __tests__/__mocks__)
//   2. cross-feature         features/X import features/Y — trừ shared_features, qua index
//   3. core-imports-features core/ import features/
//   4. deep-import           import từ ngoài feature vào sâu hơn index của feature
//
// Ratchet: nợ đóng băng trong baseline JSON. Vi phạm cũ ⇒ pass, nhưng file nợ KHÔNG được dài thêm.
//
// KHÁC bản cũ: hằng cấu hình đọc từ `claude_config.json` thay vì khối `═══ CONFIG ═══` mà
// project-init gõ vào từng bản copy. Đó là toàn bộ lý do tồn tại của khối đó, nên khối đi theo.
import fs from 'node:fs';
import path from 'node:path';

/** Nợ kiến trúc là dữ liệu của DỰ ÁN ⇒ nằm cạnh cấu hình dự án, không phải trong plugin. */
export const BASELINE_DEFAULT = '.claude/structure-baseline.json';

const DEFAULTS = { srcDir: 'src', maxLoc: 600, aliases: { '@/': 'src/' } };

// KHÁC bản script cũ MỘT CÁCH CÓ CHỦ ĐÍCH: thêm nhánh `import\s+` để bắt import CHỈ-ĐỂ-SIDE-EFFECT
// (`import '@/features/b/register'`). Bản cũ chỉ soi `from` · `import(` · `require(` nên cả một lớp
// coupling chéo feature đi lọt — mà đăng ký handler qua side-effect đúng là cách người ta hay ghép
// hai feature vào nhau. Đổi được ở lần port này vì đường baseline cũng đổi (`script/` →
// `.claude/`) nên mọi dự án đằng nào cũng phải sinh lại baseline; giữ nguyên phép cũ thì lỗ này
// được đóng băng thêm một vòng đời nữa.
const IMPORT_RE = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;

const HINT = {
  'file-too-long': 'Tách bớt component/logic ra file riêng. File nợ baseline không được dài thêm — chạm vào thì rút ngắn.',
  'cross-feature': 'Feature không import feature khác (trừ shared_features, qua index). Promote lên core/, đi qua event/registry, hoặc xin USER duyệt vào whitelist.',
  'core-imports-features': 'core/ không được biết tới features/. Đảo ngược: feature tự đăng ký vào core (registry/callback).',
  'deep-import': 'Chỉ import qua public API của feature (index).',
};

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (entry.name === '__tests__' || entry.name === '__mocks__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * @param {{root:string, config?:object, updateBaseline?:boolean}} o
 * @returns {{fail:boolean, lines:string[], violations:object[], fresh:object[], skipped?:string}}
 */
export function checkStructure({ root, config = {}, updateBaseline = false }) {
  const srcDir = config?.project?.src_dir || DEFAULTS.srcDir;
  const maxLoc = config?.structure?.max_loc ?? DEFAULTS.maxLoc;
  const shared = new Set(config?.structure?.shared_features ?? []);
  const aliases = config?.project?.aliases ?? DEFAULTS.aliases;
  const baselinePath = path.join(root, config?.structure?.baseline || BASELINE_DEFAULT);

  const src = path.join(root, srcDir);
  const lines = [];

  if (!fs.existsSync(src)) {
    // Thoát ÊM, không fail: không có gì để quét thì không có vi phạm nào. Nêu CẢ HAI giả thuyết —
    // root sai cũng dẫn tới đúng nhánh này, và đó mới là thứ người đọc cần loại trừ trước.
    lines.push(`Structure: không thấy ${srcDir}/ tại ${root} — nếu đây KHÔNG phải root dự án thì root đã phân giải sai (ép: --root <path>); nếu đúng thì repo không chứa stack app (OK).`);
    return { fail: false, lines, violations: [], fresh: [], skipped: 'no-src' };
  }

  const featureRe = new RegExp(`^${srcDir}/features/([^/]+)(/.*)?$`);
  const inFeatureRe = new RegExp(`^${srcDir}/features/([^/]+)/`);

  const normalize = (spec, fileDir) => {
    for (const [alias, prefix] of Object.entries(aliases)) {
      if (spec.startsWith(alias)) return prefix + spec.slice(alias.length);
    }
    if (spec.startsWith('.')) return path.relative(root, path.resolve(fileDir, spec)).split(path.sep).join('/');
    return null; // package ngoài — không quan tâm
  };

  const files = walk(src).map((f) => path.relative(root, f).split(path.sep).join('/'));
  const violations = [];

  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const loc = text.split('\n').length;
    if (loc > maxLoc) violations.push({ type: 'file-too-long', key: file, loc });

    const srcFeature = file.match(inFeatureRe)?.[1] ?? null;
    const inCore = file.startsWith(`${srcDir}/core/`);

    for (const match of text.matchAll(IMPORT_RE)) {
      const target = normalize(match[1], path.join(root, path.dirname(file)));
      if (!target) continue;
      const fm = target.match(featureRe);
      if (!fm) continue;
      const [, tgtFeature, restRaw] = fm;
      const isDeep = (restRaw ?? '').replace(/\/(index)?(\.tsx?)?$/, '') !== '';
      const key = `${file} -> ${match[1]}`;

      if (srcFeature && tgtFeature !== srcFeature) {
        const allowedShared = shared.has(tgtFeature) && !shared.has(srcFeature) && !isDeep;
        if (!allowedShared) violations.push({ type: 'cross-feature', key });
      } else if (inCore) {
        violations.push({ type: 'core-imports-features', key });
      } else if (!srcFeature && isDeep) {
        violations.push({ type: 'deep-import', key });
      }
    }
  }

  if (updateBaseline) {
    const out = { fileLoc: {}, imports: [] };
    for (const v of violations) {
      if (v.type === 'file-too-long') out.fileLoc[v.key] = v.loc;
      else out.imports.push(`${v.type} | ${v.key}`);
    }
    out.imports.sort();
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, JSON.stringify(out, null, 2) + '\n');
    lines.push(`Đã ghi baseline (${path.relative(root, baselinePath)}): ${Object.keys(out.fileLoc).length} file nợ LOC, ${out.imports.length} import nợ.`);
    return { fail: false, lines, violations, fresh: [] };
  }

  // Baseline đọc được ⇒ dùng. Không tồn tại ⇒ rỗng (dự án chưa có nợ, hợp lệ). ĐỌC KHÔNG ĐƯỢC
  // hoặc PARSE HỎNG ⇒ fail-closed + nói ra: coi như rỗng sẽ biến mọi nợ cũ thành "vi phạm mới"
  // (ồn, còn chịu được), nhưng coi như "mọi thứ đều nợ" thì gate tắt CÂM — nên chọn chặn.
  let baseline = { fileLoc: {}, imports: [] };
  if (fs.existsSync(baselinePath)) {
    try {
      baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    } catch (e) {
      lines.push(`✖ Structure: baseline ${path.relative(root, baselinePath)} không đọc/parse được (${(e && e.code) || e.message}) — không biết nợ nào đã được duyệt, cấm báo xanh.`);
      lines.push('  ↳ sửa file đó, hoặc sinh lại: cc-harness structure --update-baseline');
      return { fail: true, lines, violations, fresh: [] };
    }
  }
  const baselineImports = new Set(baseline.imports ?? []);
  const baselineLoc = baseline.fileLoc ?? {};

  const fresh = [];
  for (const v of violations) {
    if (v.type === 'file-too-long') {
      const allowed = baselineLoc[v.key] ?? maxLoc;
      if (v.loc > allowed) fresh.push({ ...v, allowed });
    } else if (!baselineImports.has(`${v.type} | ${v.key}`)) {
      fresh.push(v);
    }
  }

  if (fresh.length === 0) {
    lines.push(`Structure PASS (${files.length} file; nợ baseline còn lại: ${Object.keys(baselineLoc).length} file LOC, ${baselineImports.size} import) · root: ${root}`);
    return { fail: false, lines, violations, fresh };
  }

  lines.push(`Structure FAIL — ${fresh.length} vi phạm mới (luật: §2 của bộ luật) · root: ${root}`);
  lines.push('');
  for (const v of fresh) {
    lines.push(v.type === 'file-too-long'
      ? `  [${v.type}] ${v.key}: ${v.loc} LOC (giới hạn ${v.allowed})`
      : `  [${v.type}] ${v.key}`);
    lines.push(`      → ${HINT[v.type]}`);
  }
  lines.push('');
  lines.push(`Nếu đây là quyết định có chủ đích: cập nhật ${path.relative(root, baselinePath)} (sẽ hiện trong diff để review).`);
  return { fail: true, lines, violations, fresh };
}
