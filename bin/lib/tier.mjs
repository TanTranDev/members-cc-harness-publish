// tier.mjs — chọn phần bộ luật được BƠM vào phiên, và dựng bảng tra cho phần còn lại.
//
// VÌ SAO TÁCH TẦNG: bộ luật trộn ba loại nội dung có NHỊP ĐỌC khác nhau — (a) cổng phải biết ngay
// giây 0, (b) luật chỉ cần khi đang làm đúng việc đó, (c) căn cứ vì sao luật thành luật. Bơm cả ba
// mỗi phiên là trả giá context cho hai loại không ai đọc: đo trên bản v1.0.0, §0 chiếm 62 KB / 91 KB
// và phần lớn là loại (b)+(c).
//
// LUẬT CỨNG: mặc định là `ref`. Vào LÕI phải khai TƯỜNG MINH `<!-- inject: core -->`. Không có
// đường mặc định vào LÕI, vì cửa mặc định mở là cách LÕI phình lại sau ba tháng.
//
// CẮT KHỎI LÕI ≠ XOÁ LUẬT. Mọi mục không bơm phải còn (a) một dòng trong bảng tra, (b) lệnh tra
// chạy được. Thiếu một trong hai là tạo lỗ luật im lặng — đúng thứ `op: remove` của bộ khung cấm.
import { listSections } from './rules.mjs';

/**
 * Danh sách mục PHẢI ở tầng core, khai CỨNG trong code.
 *
 * Đây là lưới chống một lớp lỗi câm cụ thể: dự án `replace` mục §0 bằng tệp của mình mà quên dòng
 * `<!-- inject: core -->` ⇒ §0 tụt xuống `ref` ⇒ phiên chạy KHÔNG có cổng nào, và không ai biết.
 * So khai cứng với thực tế rồi NÓI RA khi lệch.
 */
export const CORE_SECTIONS = ['§0'];

const HEADING = /^#{2,3}\s/;
const ANNOT_LINE = /^\s*<!--\s*(?:inject|when)\s*:.*-->\s*$/;

/**
 * Comment HTML — kể cả loại trải NHIỀU DÒNG — không bao giờ là luật: nó là ghi chú cho người sửa
 * bộ luật (`rules-version`, lý do một mục tồn tại). Bơm nó là trả context cho khán giả không có
 * mặt trong phiên. Bản trước chỉ gỡ đúng dòng annotation nên khối `rules-version` 2 dòng vẫn lọt.
 */
function stripComments(s) {
  return String(s)
    .replace(/<!--[\s\S]*?-->\s*\n?/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

/** Gỡ dấu ngăn `---` ở đuôi một khối: khối nối tiếp nhau sẽ tự thêm dấu ngăn của chính nó. */
function trimRule(s) {
  return String(s).replace(/\n+(?:-{3,}\s*)+$/, '').replace(/\n+$/, '');
}

/** Bỏ tiền tố số của heading: "0. Cổng và cách đi việc" → "Cổng và cách đi việc". */
function shortHeading(h) {
  return String(h).replace(/^\d+\.\s*/, '').replace(/\*\*/g, '');
}

/**
 * Cắt bộ luật đã trộn thành phần bơm + bảng tra.
 *
 * @param {string} text bộ luật ĐÃ trộn override (không phải base thô)
 * @returns {{core:string, index:string, coreIds:string[], warnings:{code:string,message:string}[]}}
 */
export function selectCore(text) {
  const lines = String(text).split('\n');
  const { sections } = listSections(text);
  const warnings = [];

  // Lời mở đầu = mọi thứ TRƯỚC heading cấp 2 đầu tiên. Nó nói cách tuỳ biến và cách tra, nên nó
  // thuộc LÕI dù không phải một mục — thiếu nó thì agent có luật mà không biết còn luật nào khác.
  const firstHeading = lines.findIndex((l) => HEADING.test(l));
  const preamble = firstHeading > 0 ? lines.slice(0, firstHeading) : [];

  const top = sections.filter((s) => s.level === 2);

  // Lệch so với khai cứng ⇒ WARN vào chính khối bơm. Hai chiều đều nguy: THIẾU mục core là phiên
  // mất cổng; THỪA mục core là LÕI phình mà không ai chọn.
  //
  // THIẾU thì FAIL-SAFE, không fail-open: mục trong `CORE_SECTIONS` mà tồn tại vẫn được bơm dù
  // annotation bị mất. Lý do: dự án `replace` §0 rõ ràng có ý §0 của họ LÀ lõi; hiểu việc quên một
  // dòng comment thành "phiên này không có cổng nào" là biến một lỗi chính tả thành mất luật.
  const forced = new Set();
  for (const want of CORE_SECTIONS) {
    const hit = top.find((s) => s.id === want);
    if (hit && hit.tier !== 'core') {
      forced.add(want);
      warnings.push({
        code: 'core-annotation-missing',
        message: `mục ${want} thiếu annotation \`<!-- inject: core -->\` (dự án override ${want} mà quên dòng đó?) — vẫn bơm vì nó nằm trong danh sách LÕI của plugin, nhưng thêm lại dòng đó để không phụ thuộc vào lưới này.`,
      });
    } else if (!hit) {
      warnings.push({
        code: 'core-missing',
        message: `mục ${want} KHÔNG TỒN TẠI trong bộ luật đã trộn — phiên này đang chạy THIẾU phần luật quan trọng nhất. Dự án có \`op: remove\` nó không?`,
      });
    }
  }

  const isCore = (s) => s.tier === 'core' || forced.has(s.id);
  const coreTop = top.filter(isCore);
  const refTop = top.filter((s) => !isCore(s));
  const coreIds = coreTop.map((s) => s.id);
  for (const got of coreIds) {
    if (!CORE_SECTIONS.includes(got)) {
      warnings.push({
        code: 'core-extra',
        message: `mục ${got} tự khai \`inject: core\` nhưng không có trong danh sách LÕI của plugin — nó đang được bơm mỗi phiên. Cố ý thì thêm vào \`CORE_SECTIONS\`; không thì gỡ annotation.`,
      });
    }
  }

  // Annotation là chỉ thị cho MÁY, không phải nội dung luật ⇒ gỡ khỏi phần bơm. Gỡ hai lớp:
  // dòng annotation (rẻ, chắc), rồi mọi comment HTML còn lại (bắt cả loại nhiều dòng).
  const clean = (arr) => trimRule(stripComments(arr.filter((l) => !ANNOT_LINE.test(l)).join('\n')));

  const chunks = [clean(preamble)];
  for (const s of coreTop) chunks.push(clean(lines.slice(s.start, s.end)));

  return {
    core: chunks.filter((c) => c.trim() !== '').join('\n\n'),
    index: buildIndex(refTop),
    coreIds,
    warnings,
  };
}

/**
 * Bảng tra cho phần không bơm. Một dòng một mục — đủ để biết CÓ mục đó và biết khi nào cần nó,
 * không đủ để tưởng mình đã đọc nó.
 */
export function buildIndex(refTop) {
  if (!refTop.length) return '';
  const out = [
    '📚 **Mục luật KHÔNG bơm sẵn** — tra đúng mục cần bằng `cc-harness rules <id>`.',
    'Đừng trả lời từ trí nhớ về một mục chưa mở; và đừng nạp cả bộ khi chỉ cần một mục.',
    '',
  ];
  const w = Math.max(...refTop.map((s) => s.id.length));
  for (const s of refTop) {
    const when = s.when ? ` — ${s.when}` : ' — (chưa khai `when:`)';
    out.push(`  ${s.id.padEnd(w)}  ${shortHeading(s.heading)}${when}`);
  }
  return out.join('\n');
}

/**
 * Lấy nguyên văn MỘT mục theo id, từ bộ luật đã trộn.
 * @returns {{ok:boolean, text:string|null, ids:string[]}}
 */
export function getSection(text, id) {
  const lines = String(text).split('\n');
  const { sections } = listSections(text);
  const hit = sections.find((s) => s.id === id);
  const ids = sections.map((s) => s.id);
  if (!hit) return { ok: false, text: null, ids };
  return { ok: true, text: trimRule(stripComments(lines.slice(hit.start, hit.end).join('\n'))), ids };
}
