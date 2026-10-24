import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
process.loadEnvFile(".env");
const url = new URL(process.env.DATABASE_URL);
url.hostname = "postgres";
writeFileSync(
  ".env.container",
  `CONTAINER_DATABASE_URL=${url}\nTLS_UID=${process.getuid()}\nTLS_GID=${process.getgid()}\nAPP_ORIGIN=${process.env.APP_ORIGIN || "http://127.0.0.1:3080"}\nADDITIONAL_ORIGINS=https://localhost:3443,https://127.0.0.1:3443\nCONTAINER_SMTP_URL=${process.env.CONTAINER_SMTP_URL || ""}\nMAIL_FROM=${process.env.MAIL_FROM || "Spaceflow <spaceflow@localhost>"}\n`,
  { mode: 0o600 },
);
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
};
run("npm", ["run", "db:migrate"]);
const tls = process.argv.includes("--https");
if (tls) {
  mkdirSync(".tls", { recursive: true, mode: 0o700 });
  if (!existsSync(".tls/cert.pem"))
    run("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "365",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
      "-keyout",
      ".tls/key.pem",
      "-out",
      ".tls/cert.pem",
    ]);
}
run("docker", [
  "compose",
  "--env-file",
  ".env.container",
  ...(tls ? ["--profile", "https"] : []),
  "up",
  "-d",
  "--build",
  "--wait",
]);
