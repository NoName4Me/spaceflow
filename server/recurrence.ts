import { z } from "zod";
export const repeatSchema = z
  .object({
    frequency: z.enum(["daily", "weekly", "monthly"]),
    interval: z.number().int().min(1).max(12).default(1),
    count: z.number().int().min(2).max(52),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
    monthDay: z.number().int().min(1).max(31).optional(),
  })
  .strict();
export function occurrenceDates(
  date: string,
  repeat?: z.infer<typeof repeatSchema>,
) {
  if (!repeat) return [date];
  const first = new Date(date + "T00:00:00Z"),
    result: string[] = [];
  if (repeat.frequency === "monthly") {
    const day = repeat.monthDay || first.getUTCDate();
    for (
      let month = 0;
      result.length < repeat.count && month < repeat.count * 24;
      month += repeat.interval
    ) {
      const d = new Date(
        Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + month, day),
      );
      if (d.getUTCDate() !== day || d < first) continue;
      result.push(d.toISOString().slice(0, 10));
    }
  } else if (repeat.frequency === "weekly" && repeat.weekdays) {
    const weekdays = new Set(repeat.weekdays);
    const monday = new Date(first);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    for (let offset = 0; result.length < repeat.count; offset++) {
      const d = new Date(first);
      d.setUTCDate(first.getUTCDate() + offset);
      const week = Math.floor(
        (d.valueOf() - monday.valueOf()) / (7 * 86400000),
      );
      if (week % repeat.interval === 0 && weekdays.has(d.getUTCDay()))
        result.push(d.toISOString().slice(0, 10));
    }
  } else
    for (let i = 0; i < repeat.count; i++) {
      const d = new Date(first);
      d.setUTCDate(
        first.getUTCDate() +
          i * repeat.interval * (repeat.frequency === "weekly" ? 7 : 1),
      );
      result.push(d.toISOString().slice(0, 10));
    }
  return result;
}
