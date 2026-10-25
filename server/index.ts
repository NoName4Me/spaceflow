import { app, expireBookings } from "./app.ts";
import { deliverEmails } from "./mail.ts";
import { pool } from "./db.ts";
await pool.query("SELECT 1");
const server = app.listen(
  Number(process.env.PORT || 3080),
  process.env.HOST || "127.0.0.1",
  (error?: Error) => {
    if (error) {
      console.error(`Spaceflow startup failed: ${error.message}`);
      process.exit(1);
    }
    console.log(
      `Spaceflow: ${process.env.APP_ORIGIN || "http://127.0.0.1:3080"}`,
    );
  },
);
let working = false;
const timer = setInterval(async () => {
  if (working) return;
  working = true;
  try {
    await expireBookings();
    await deliverEmails();
    await pool.query("DELETE FROM sessions WHERE expires_at<=now()");
  } catch {
    console.error("Background processing failed");
  } finally {
    working = false;
  }
}, 10000);
timer.unref();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(timer);
    server.close(() => pool.end().then(() => process.exit(0)));
  });
