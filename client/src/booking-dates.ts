export type BookingPeriod = "day" | "today" | "tomorrow" | "week" | "month";
export const companyDate = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
export function dateRange(
  period: BookingPeriod,
  chosen: string,
  now = companyDate(),
) {
  const day = period === "day" ? chosen : now;
  const start = new Date(day + "T00:00:00Z"),
    end = new Date(start);
  if (period === "tomorrow") {
    start.setUTCDate(start.getUTCDate() + 1);
    end.setUTCDate(end.getUTCDate() + 1);
  }
  if (period === "week") {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    end.setTime(start.valueOf());
    end.setUTCDate(end.getUTCDate() + 6);
  }
  if (period === "month") {
    start.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
  }
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}
