import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
const infra = process.env.INFRA_DIR || resolve(homedir(), "jonge/infra");
const root = new URL("../", import.meta.url).pathname;
function pg(args, input) {
  const result = spawnSync(
    "docker",
    ["compose", "exec", "-T", "postgres", ...args],
    { cwd: infra, input, maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0)
    throw Error(result.stderr.toString() || "数据库操作失败");
  return result.stdout.toString().trim();
}
mkdirSync(resolve(root, "backups"), { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const path = resolve(root, "backups", `spaceflow-${stamp}.dump`),
  file = openSync(path, "wx", 0o600);
try {
  const result = spawnSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "postgres",
      "pg_dump",
      "-U",
      "postgres",
      "-Fc",
      "spaceflow",
    ],
    { cwd: infra, stdio: ["ignore", file, "pipe"] },
  );
  if (result.status !== 0) {
    unlinkSync(path);
    throw Error(result.stderr.toString() || "备份失败");
  }
} finally {
  closeSync(file);
}
console.log(`备份：${path}`);
if (process.argv.includes("--verify")) {
  const database = "spaceflow_verify_" + randomBytes(8).toString("hex");
  let created = false;
  try {
    pg(["createdb", "-U", "postgres", database]);
    created = true;
    pg(
      [
        "pg_restore",
        "-U",
        "postgres",
        "--no-owner",
        "--no-privileges",
        "--exit-on-error",
        "-d",
        database,
      ],
      readFileSync(path),
    );
    const result = JSON.parse(
      pg([
        "psql",
        "-U",
        "postgres",
        "-d",
        database,
        "-Atqc",
        "SELECT json_build_object('migrations',(SELECT count(*) FROM schema_migrations),'rooms',(SELECT count(*) FROM rooms),'templates',(SELECT count(*) FROM layout_templates),'assigned',(SELECT count(*) FROM rooms WHERE layout_template_id IS NOT NULL),'exclusion',(SELECT count(*) FROM pg_constraint WHERE conrelid='bookings'::regclass AND contype='x'),'trigger',(SELECT count(*) FROM pg_trigger WHERE tgrelid='bookings'::regclass AND NOT tgisinternal))",
      ]),
    );
    if (
      result.migrations < 8 ||
      result.templates < 1 ||
      result.assigned !== result.rooms ||
      result.exclusion !== 1 ||
      result.trigger !== 1
    )
      throw Error("恢复完整性检查失败");
    console.log(
      `恢复验证通过：${result.migrations} 个迁移、${result.rooms} 间会议室、${result.templates} 个共享布局，预订约束和通知触发器完整。`,
    );
  } finally {
    if (created) pg(["dropdb", "-U", "postgres", database]);
  }
}
