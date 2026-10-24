import { existsSync, writeFileSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
if (!existsSync(".env")) {
  const script = resolve(
    process.env.INFRA_DIR || resolve(homedir(), "jonge/infra"),
    "scripts/create-project.sh",
  );
  const result = spawnSync(script, ["spaceflow", "--no-mysql", "--no-garage"], {
    encoding: "utf8",
  });
  if (result.status !== 0)
    throw new Error("本地基础环境初始化失败，请检查 infra 服务");
  const migration = result.stdout.match(
    /迁移账号 spaceflow_migrator \/ (\S+)/,
  )?.[1];
  const runtime = result.stdout.match(/运行账号 spaceflow_app \/ (\S+)/)?.[1];
  if (!migration || !runtime) throw new Error("无法解析数据库连接配置");
  writeFileSync(
    ".env",
    `DATABASE_URL=postgresql://spaceflow_app:${runtime}@127.0.0.1:5432/spaceflow\nMIGRATION_DATABASE_URL=postgresql://spaceflow_migrator:${migration}@127.0.0.1:5432/spaceflow\nPORT=3080\nAPP_ORIGIN=http://127.0.0.1:3080\n`,
    { mode: 0o600 },
  );
  chmodSync(".env", 0o600);
}
for (const script of ["db:migrate", "db:seed"]) {
  const result = spawnSync("npm", ["run", script], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
