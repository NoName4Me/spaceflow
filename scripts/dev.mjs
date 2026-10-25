import { spawn } from "node:child_process";
process.loadEnvFile(".env");
const env = {
  ...process.env,
  ADDITIONAL_ORIGINS: [
    process.env.ADDITIONAL_ORIGINS,
    "http://127.0.0.1:5173",
    "http://localhost:5173",
  ]
    .filter(Boolean)
    .join(","),
};
const children = [
  spawn(
    process.execPath,
    ["--watch", "--env-file=.env", "--import", "tsx", "server/index.ts"],
    { stdio: "inherit", env },
  ),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
    stdio: "inherit",
    env,
  }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}
for (const child of children) child.on("exit", (code) => stop(code || 0));
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
