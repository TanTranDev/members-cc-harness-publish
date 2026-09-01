// changelog.mjs — `cc-harness changelog`. Gộp changelog fragment để đọc.
//
// Fragment = 1 entry / 1 file, write-once, trong `docs/releases/entries/<YYYYMM>/`. Write-once là
// lý do N phiên cùng ngày không conflict được: không ai sửa file của ai.
//
// Cạm bẫy chính của tool này KHÔNG phải phép gộp mà là phân biệt "repo không có entry nào" với
// "tôi đang tìm sai chỗ" — bản đầu ở bộ khung đọc nhầm thư mục cũ, in "0 entry" rồi exit 0.
import fs from 'node:fs';
import path from 'node:path';

export const ENTRIES_NEW_REL = path.join('docs', 'releases', 'entries');
/** Cấu trúc trước khi bộ khung đổi chỗ. Giữ để repo chưa migrate vẫn đọc được — nhưng phải NÓI RA. */
export const ENTRIES_OLD_REL = path.join('changelog', 'entries');

/**
 * @param {{root:string, day?:string, last?:number, today:string}} o `today`/`day` dạng YYYYMMDD.
 *   `today` truyền vào chứ không tự lấy `new Date()` — để test cố định được, và để CI ép được ngày.
 * @returns {{lines:string[], warnings:string[], count:number}}
 */
export function viewChangelog({ root, day, last, today }) {
  const warnings = [];
  const lines = [];

  const dirNew = path.join(root, ENTRIES_NEW_REL);
  const dirOld = path.join(root, ENTRIES_OLD_REL);
  const entries = fs.existsSync(dirNew) ? dirNew : dirOld;

  if (!fs.existsSync(entries)) {
    warnings.push(`⚠️  changelog: không thấy thư mục entry nào — đã tìm ${ENTRIES_NEW_REL} và ${ENTRIES_OLD_REL}`
      + ` dưới ${root}. Repo chưa có fragment nào, HOẶC root sai.`
      + ' Đây là ĐƯỜNG KHÔNG ĐỌC ĐƯỢC GÌ, không phải kết luận "không có entry".');
  } else if (entries === dirOld) {
    warnings.push(`⚠️  changelog: đang đọc cấu trúc CŨ ${ENTRIES_OLD_REL} —`
      + ` chuyển sang ${ENTRIES_NEW_REL} (hook changelog-entry-gate ép ghi ở đó).`);
  }

  const wantDay = last ? null : (day ?? today);

  // Chỉ nhận file .md nằm trong thư mục THÁNG: file lạc thẳng vào entries/ không theo quy ước tên
  // nên lọc theo ngày sẽ cho kết quả ngẫu nhiên — thà bỏ qua còn hơn gộp nhầm.
  const all = fs.existsSync(entries)
    ? fs.readdirSync(entries).flatMap((m) => {
        const dir = path.join(entries, m);
        let isDir = false;
        try { isDir = fs.statSync(dir).isDirectory(); } catch { isDir = false; }
        return isDir
          ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => path.join(dir, f))
          : [];
      })
    : [];

  const byName = (a, b) => path.basename(a).localeCompare(path.basename(b));
  const picked = (last
    ? [...all].sort(byName).slice(-last)
    : all.filter((p) => path.basename(p).startsWith(wantDay))
  ).sort((a, b) => byName(b, a)); // mới nhất trước

  lines.push(last
    ? `# Changelog — ${picked.length}/${last} entry gần nhất · root: ${root}`
    : `# Changelog dev — ${wantDay} (${picked.length} entry) · root: ${root}`);
  lines.push('');

  for (const p of picked) {
    lines.push(fs.readFileSync(p, 'utf8').trim());
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  if (wantDay) {
    const legacy = path.join(root, 'changelog', `${wantDay}.md`);
    if (fs.existsSync(legacy)) lines.push(`> Ngày này còn file legacy (đóng băng, cấm ghi thêm): changelog/${wantDay}.md`);
  }

  return { lines, warnings, count: picked.length };
}
