import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import pg from "pg";
process.loadEnvFile(".env");
const infra = process.env.INFRA_DIR || resolve(homedir(), "jonge/infra"),
  database = "spaceflow_init_" + randomBytes(8).toString("hex"),
  temporary = mkdtempSync(resolve(tmpdir(), "spaceflow-init-"));
function docker(args, input) {
  const r = spawnSync(
    "docker",
    ["compose", "exec", "-T", "postgres", ...args],
    { cwd: infra, input, encoding: "utf8" },
  );
  if (r.status !== 0)
    throw Error("Initialization verification database operation failed");
  return r.stdout;
}
let created = false,
  client;
try {
  docker(["createdb", "-U", "postgres", "-O", "spaceflow_migrator", database]);
  created = true;
  docker(
    ["psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"],
    "GRANT USAGE ON SCHEMA public TO spaceflow_app; ALTER DEFAULT PRIVILEGES FOR ROLE spaceflow_migrator IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO spaceflow_app; ALTER DEFAULT PRIVILEGES FOR ROLE spaceflow_migrator IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO spaceflow_app;",
  );
  const app = new URL(process.env.DATABASE_URL),
    migration = new URL(process.env.MIGRATION_DATABASE_URL);
  app.pathname = "/" + database;
  migration.pathname = "/" + database;
  const env = {
    ...process.env,
    DATABASE_URL: String(app),
    MIGRATION_DATABASE_URL: String(migration),
    LOCAL_ACCOUNTS_FILE: resolve(temporary, "accounts"),
  };
  for (const path of ["server/migrate.ts", "server/seed.ts"]) {
    const r = spawnSync(process.execPath, ["--import", "tsx", path], {
      env,
      stdio: "inherit",
    });
    if (r.status !== 0) throw Error("Clean initialization failed");
  }
  client = new pg.Client({ connectionString: String(app) });
  await client.connect();
  const {
    rows: [r],
  } = await client.query(
    "SELECT (SELECT count(*)::int FROM rooms) AS rooms,(SELECT count(*)::int FROM rooms WHERE floor_id IS NOT NULL) AS assigned,(SELECT count(*)::int FROM rooms WHERE layout_template_id IS NOT NULL) AS assigned_layouts,(SELECT count(*)::int FROM layout_templates) AS templates,(SELECT count(*)::int FROM layout_versions) AS layouts,(SELECT count(*)::int FROM users) AS users",
  );
  if (
    r.rooms !== 6 ||
    r.assigned !== 6 ||
    r.assigned_layouts !== 6 ||
    r.templates < 5 ||
    r.layouts !== 6 ||
    r.users !== 2
  )
    throw Error("Clean initialization integrity failed");
  console.log(
    "Clean setup verified: 6 rooms assigned to floors and shared layouts, 5 built-in layouts, 2 accounts",
  );
} finally {
  await client?.end();
  if (created) docker(["dropdb", "-U", "postgres", "--force", database]);
  rmSync(temporary, { recursive: true, force: true });
}
