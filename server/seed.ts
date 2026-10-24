import { resolveLocation } from "./locations.ts";
import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";
import { randomUUID, randomBytes } from "node:crypto";
import { pool, transaction } from "./db.ts";
import { hashPassword } from "./auth.ts";
const source = await readFile(
  new URL("../prototype/app.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
vm.runInContext(
  source.slice(
    source.indexOf("const START_ROOMS="),
    source.indexOf("let stored="),
  ) + ";globalThis.seedRooms=START_ROOMS;globalThis.seedLayout=preset;",
  context,
);
const credentials: string[] = [];
try {
  await transaction(async (c) => {
    for (const [username, name, role] of [
      ["admin", "空间管理员", "admin"],
      ["member", "林同事", "member"],
    ]) {
      if (
        (await c.query("SELECT 1 FROM users WHERE username=$1", [username]))
          .rowCount
      )
        continue;
      const password = randomBytes(12).toString("base64url");
      await c.query("INSERT INTO users VALUES($1,$2,$3,$4,$5)", [
        randomUUID(),
        username,
        name,
        await hashPassword(password),
        role,
      ]);
      credentials.push(`${username}: ${password}`);
    }
    for (const r of context.seedRooms) {
      if ((await c.query("SELECT id FROM rooms WHERE id=$1", [r.id])).rowCount)
        continue;
      const location = await resolveLocation(c, r),
        layout = JSON.stringify(context.seedLayout(r.type));
      await c.query(
        "INSERT INTO rooms(id,data,layout,floor_id) VALUES($1,$2,$3,$4)",
        [r.id, JSON.stringify({ ...r, repeat: false }), layout, location.id],
      );
      await c.query(
        "INSERT INTO layout_versions(room_id,version,layout) VALUES($1,1,$2)",
        [r.id, layout],
      );
    }
  });
  if (credentials.length)
    await writeFile(
      process.env.LOCAL_ACCOUNTS_FILE ||
        new URL("../.local-accounts", import.meta.url),
      credentials.join("\n") + "\n",
      { mode: 0o600 },
    );
  console.log("Rooms and accounts ready. Credentials: .local-accounts");
} finally {
  await pool.end();
}
