import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { transaction } from "./db.ts";
let transport: Transporter | undefined;
export async function deliverEmails(sender?: Transporter, onlyUser?: string) {
  if (!sender && !process.env.SMTP_URL)
    return { sent: 0, failed: 0, configured: false };
  const url = process.env.SMTP_URL ? new URL(process.env.SMTP_URL) : null;
  const client =
    sender ||
    (transport ??= nodemailer.createTransport({
      host: url!.hostname,
      port: Number(url!.port || (url!.protocol === "smtps:" ? 465 : 25)),
      secure: url!.protocol === "smtps:",
      auth: url!.username
        ? {
            user: decodeURIComponent(url!.username),
            pass: decodeURIComponent(url!.password),
          }
        : undefined,
      connectionTimeout: 5000,
      socketTimeout: 5000,
    }));
  return transaction(async (c) => {
    const jobs = (
      await c.query(
        `SELECT o.notification_id,o.attempts,n.status,b.title,b.start_at,b.end_at,r.data->>'name' AS room,u.email,u.active FROM email_outbox o JOIN notifications n ON n.id=o.notification_id JOIN users u ON u.id=n.user_id JOIN bookings b ON b.id=n.booking_id JOIN rooms r ON r.id=b.room_id WHERE o.sent_at IS NULL AND o.next_attempt_at<=now() AND o.attempts<8 AND u.email IS NOT NULL AND u.active AND ($1::uuid IS NULL OR u.id=$1) ORDER BY o.notification_id LIMIT 10 FOR UPDATE OF o SKIP LOCKED`,
        [onlyUser || null],
      )
    ).rows;
    let sent = 0,
      failed = 0;
    const labels: Record<string, string> = {
      confirmed: "已确认",
      pending: "待审批",
      cancelled: "已取消",
      rejected: "已拒绝",
      expired: "已过期",
      updated: "已修改",
    };
    for (const job of jobs) {
      try {
        await client.sendMail({
          from: process.env.MAIL_FROM || "Spaceflow <spaceflow@localhost>",
          to: job.email,
          messageId: `<spaceflow-${job.notification_id}@notifications.local>`,
          subject: `[间序] ${job.title} · ${labels[job.status] || job.status}`,
          text: `${job.room}\n${job.title}\n${job.start_at.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} – ${job.end_at.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}\n状态：${labels[job.status] || job.status}`,
        });
        await c.query(
          "UPDATE email_outbox SET sent_at=now(),attempts=attempts+1,last_error=NULL WHERE notification_id=$1",
          [job.notification_id],
        );
        sent++;
      } catch {
        await c.query(
          "UPDATE email_outbox SET attempts=attempts+1,last_error='SMTP delivery failed',next_attempt_at=now()+LEAST(3600,power(2,attempts+1)::int*30)*interval '1 second' WHERE notification_id=$1",
          [job.notification_id],
        );
        failed++;
      }
    }
    return { sent, failed, configured: true };
  });
}
