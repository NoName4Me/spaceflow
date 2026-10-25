import { useState } from "react";
import { companyDate, dateRange, type BookingPeriod } from "../booking-dates";
import { statusLabels } from "../model";
import { useResource } from "../workspace";
import type { Booking } from "../types";
interface BookingPage {
  bookings: Booking[];
  page: number;
  pages: number;
  total: number;
}
const presets: [BookingPeriod, string][] = [
  ["today", "今日"],
  ["tomorrow", "明日"],
  ["week", "本周"],
  ["month", "本月"],
];
export function RoomBookingList({
  roomId,
  initialDate,
  onDateChange,
}: {
  roomId: string;
  initialDate: string;
  onDateChange: (date: string) => void;
}) {
  const [chosen, setChosen] = useState(initialDate),
    [period, setPeriod] = useState<BookingPeriod>(
      initialDate === companyDate() ? "today" : "day",
    ),
    [page, setPage] = useState(1);
  const range = dateRange(period, chosen);
  const { result, loading } = useResource<BookingPage>(
    `/rooms/${encodeURIComponent(roomId)}/bookings?` +
      new URLSearchParams({ ...range, page: String(page), size: "20" }),
    { bookings: [], page: 1, pages: 1, total: 0 },
  );
  return (
    <section className="detail-agenda" aria-label="会议室预订记录">
      <div className="agenda-heading">
        <h3>预订记录</h3>
        <span>{result.total} 条</span>
      </div>
      <div className="agenda-filters">
        <div className="agenda-date">
          <label htmlFor="detailDate">日期</label>
          <input
            type="date"
            aria-label="预订日期"
            id="detailDate"
            value={chosen}
            onChange={(e) => {
              if (!e.target.value) return;
              setChosen(e.target.value);
              onDateChange(e.target.value);
              setPeriod("day");
              setPage(1);
            }}
          />
        </div>
        <div
          className="agenda-presets"
          role="group"
          aria-label="预订日期快捷筛选"
        >
          {presets.map(([key, label]) => (
            <button
              key={key}
              className={`agenda-preset ${period === key ? "active" : ""}`}
              aria-pressed={period === key}
              onClick={() => {
                setPeriod(key);
                const date =
                  key === "tomorrow"
                    ? dateRange("tomorrow", companyDate()).from
                    : companyDate();
                setChosen(date);
                onDateChange(date);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {range.from !== range.to && (
          <span className="agenda-range">
            {range.from} — {range.to}
          </span>
        )}
      </div>
      <div className="agenda-table-scroll" aria-busy={loading}>
        <table className="agenda-table">
          <thead>
            <tr>
              <th>使用时间</th>
              <th>会议主题</th>
              <th>预订人</th>
              <th>备注</th>
              <th>提交时间</th>
            </tr>
          </thead>
          <tbody>
            {result.bookings.map((b) => (
              <tr key={b.id} data-booking-record={b.id}>
                <td className="agenda-time">
                  <time dateTime={`${b.date}T${b.start}:00+08:00`}>
                    {b.date}
                  </time>
                  <strong>
                    {b.start}–{b.end}
                  </strong>
                </td>
                <td>
                  <span className="agenda-subject">{b.title}</span>
                  <span
                    className={`agenda-status ${b.status === "pending" ? "pending" : ""}`}
                  >
                    {statusLabels[b.status]}
                  </span>
                </td>
                <td>{b.detailsHidden ? "**" : b.ownerName || "—"}</td>
                <td className="agenda-notes">
                  {b.detailsHidden ? "**" : b.notes || "—"}
                </td>
                <td className="agenda-created">
                  {b.createdAt ? (
                    <time dateTime={b.createdAt}>
                      {new Date(b.createdAt).toLocaleString("zh-CN", {
                        timeZone: "Asia/Shanghai",
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </time>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {!result.bookings.length && (
              <tr>
                <td colSpan={5} className="agenda-empty">
                  {loading ? "加载中" : "暂无预订"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {result.pages > 1 && (
        <div className="pagination">
          <button
            className="button small"
            disabled={loading || result.page <= 1}
            onClick={() => setPage(result.page - 1)}
          >
            上一页
          </button>
          <span>
            {result.page} / {result.pages}
          </span>
          <button
            className="button small"
            disabled={loading || result.page >= result.pages}
            onClick={() => setPage(result.page + 1)}
          >
            下一页
          </button>
        </div>
      )}
    </section>
  );
}
