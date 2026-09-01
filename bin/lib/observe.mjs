// observe.mjs — `cc-harness observe`. Cầu nối giữa `claude_config.json` và `bin/observe.sh`.
//
// Vì sao phần dò nền tảng vẫn là BASH: nó gọi `lsof`, `docker inspect`, `ps -o lstart`, `stat -f`
// / `-c`, `xcrun simctl`, `adb` — mỗi thứ một hành vi khác nhau theo hệ điều hành, và bản shell đã
// chạy thật lâu nay. Viết lại bằng Node chỉ đổi một lớp code đã tin được lấy một lớp bug mới, trên
// đúng cái tool KHÔNG BAO GIỜ được chặn task.
//
// Việc của file này chỉ có hai: đọc config → bơm env, và phân giải root → truyền vào.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Khoá config → biến môi trường mà `bin/observe.sh` đọc.
 *
 * ⚠️ TÊN KHOÁ phải khớp SCHEMA trong config.mjs, không phải khớp trực giác. Đọc `o.id_cmd` trong
 * khi schema khai `deployed_id_cmd` thì config hợp lệ 100% mà giá trị KHÔNG BAO GIỜ tới script —
 * validator im, tool im, chỉ có bằng chứng là sai. Lưới giữ hai bên khớp nhau: test
 * "mọi khoá schema đều được tiêu thụ".
 */
export function observeEnv(config, root) {
  const o = config?.observe ?? {};
  const p = config?.project ?? {};
  // `src_dirs` là MẢNG trong schema, còn shell lặp `for d in $SRC_DIRS` ⇒ nối bằng khoảng trắng.
  // Không khai thì lùi về `project.src_dir` (một nguồn sự thật, đỡ khai hai chỗ).
  const srcDirs = Array.isArray(o.src_dirs) && o.src_dirs.length ? o.src_dirs.join(' ') : (p.src_dir || 'src');
  return {
    CC_ROOT: root,
    CC_OBSERVE_TARGET: o.target ?? 'in-process',
    CC_OBSERVE_KIND: o.kind ?? 'none',
    CC_SERVED_PORT: o.port === undefined || o.port === null ? '' : String(o.port),
    CC_SERVED_VIA: o.via ?? 'process',
    CC_SERVED_DOCKER_PROJECT: o.docker_project ?? '',
    CC_SERVED_FRESHNESS: o.freshness ?? '',
    CC_DEPLOYED_ID_CMD: o.deployed_id_cmd ?? '',
    CC_SRC_DIRS: srcDirs,
    CC_OBSERVE_OUT_DIR: o.out_dir ?? 'docs/wip/observe',
  };
}

/**
 * @param {{root:string, config?:object, args?:string[], pluginRoot:string, bashCmd?:string}} o
 *   `bashCmd` chỉ để TEST được nhánh "máy không có bash" — trên máy CÓ bash thì nhánh đó không
 *   đường nào chạm tới, mà nó lại đúng là nhánh dành cho Windows không có Git Bash.
 * @returns {{lines:string[], status:number}} status LUÔN 0 — quan sát không chặn task.
 */
export function observe({ root, config, args = [], pluginRoot, bashCmd = 'bash' }) {
  const script = path.join(pluginRoot, 'bin', 'observe.sh');
  if (!fs.existsSync(script)) {
    return {
      lines: [
        'LEVEL: L1',
        `REASON: không thấy ${script} — bản cài plugin thiếu file. Ledger ghi 'Quan sát: L1 — PENDING'`,
        "        + checklist, LAND bình thường.",
      ],
      status: 0,
    };
  }

  const r = spawnSync(bashCmd, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...observeEnv(config, root) },
  });

  // bash không chạy được (máy Windows không có bash trong PATH) là điều kiện MÔI TRƯỜNG ⇒ hạ mức
  // quan sát và nói lý do, KHÔNG ném và KHÔNG chặn.
  if (r.error || typeof r.status !== 'number') {
    return {
      lines: [
        'LEVEL: L1',
        `REASON: không chạy được bash ở máy này (${r.error?.code ?? r.error?.message ?? 'không rõ'})`,
        "        — ledger ghi 'Quan sát: L1 — PENDING' + checklist, LAND bình thường.",
      ],
      status: 0,
    };
  }

  const lines = String(r.stdout ?? '').split('\n');
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return { lines, status: 0 };
}
