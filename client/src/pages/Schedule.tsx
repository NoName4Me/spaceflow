import { Fragment, useRef, useState, type CSSProperties } from "react";
import { Empty, Tools } from "../components/ui";
import { overlap } from "../model";
import { useResource, useWorkspace } from "../workspace";
import type { Calendar } from "../types";
import type { BookRoom, EditBooking } from "./Bookings";
export function Schedule({
  onBook,
  onEdit,
  onDetail,
}: {
  onBook: BookRoom;
  onEdit: EditBooking;
  onDetail: (id: string) => void;
}) {
  const { filters, setFilters, data, notify } = useWorkspace();
  const [view, setView] = useState("day"),
    [page, setPage] = useState(1),
    dragged = useRef(0);
  const { result: c, loading } = useResource<Calendar | null>(
    "/calendar?" +
      new URLSearchParams({
        date: filters.date,
        view,
        page: String(page),
        size: "20",
      }),
    null,
  );
  const week = view === "week",
    columns = c
      ? week
        ? c.dates
        : Array.from(
            { length: 10 },
            (_, i) => String(i + 8).padStart(2, "0") + ":00",
          )
      : [];
  const shift = (step: number) => {
    const d = new Date(filters.date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + step * (week ? 7 : 1));
    setFilters({ ...filters, date: d.toISOString().slice(0, 10) });
  };
  return (
    <section className="page">
      <Tools>
        <button
          className="button"
          aria-label={`上一${week ? "周" : "日"}`}
          onClick={() => shift(-1)}
        >
          ←
        </button>
        <input
          className="button"
          aria-label="日程日期"
          id="schedule-date"
          type="date"
          value={filters.date}
          onChange={(e) => {
            if (e.target.value)
              setFilters({ ...filters, date: e.target.value });
          }}
        />
        <button
          className="button"
          aria-label={`下一${week ? "周" : "日"}`}
          onClick={() => shift(1)}
        >
          →
        </button>
        <select
          className="button"
          aria-label="日程视图"
          id="schedule-view"
          value={view}
          onChange={(e) => {
            setView(e.target.value);
            setPage(1);
          }}
        >
          <option value="day">日视图</option>
          <option value="week">周视图</option>
        </select>
      </Tools>
      {!c ? (
        <Empty>正在加载日程</Empty>
      ) : (
        <>
          <div className="panel calendar-scroll" aria-busy={loading}>
            <div
              className={`resource-calendar ${week ? "week" : ""}`}
              style={{ "--columns": week ? 7 : 10 } as CSSProperties}
            >
              <div className="resource-heading">
                会议室 / {week ? "日期" : "时段"}
              </div>
              {columns.map((v) => (
                <div className="resource-heading" key={v}>
                  {v}
                </div>
              ))}
              {c.rooms.map((r) => (
                <Fragment key={r.id}>
                  <div className="resource-room">
                    <b>{r.name}</b>
                    <small>
                      {r.building} / {r.floor}
                    </small>
                  </div>
                  {columns.map((v) => {
                    const date = week ? v : c.dates[0],
                      start = week ? "09:00" : v,
                      end = week
                        ? "10:00"
                        : String(Number(v.slice(0, 2)) + 1).padStart(2, "0") +
                          ":00",
                      events = c.bookings.filter(
                        (b) =>
                          b.roomId === r.id &&
                          b.date === date &&
                          (week || overlap(start, end, b.start, b.end)),
                      );
                    return (
                      <div
                        className="resource-cell"
                        key={v}
                        data-drop-room={r.id}
                        data-drop-date={date}
                        data-drop-start={start}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const id = e.dataTransfer.getData("text/plain"),
                            b = c.bookings.find((b) => b.id === id);
                          if (
                            !b ||
                            (b.owner !== "me" && data?.user.role !== "admin")
                          )
                            return;
                          const minutes = (t: string) =>
                              Number(t.slice(0, 2)) * 60 + Number(t.slice(3)),
                            nextStart = week ? b.start : start,
                            nextEnd =
                              minutes(nextStart) +
                              minutes(b.end) -
                              minutes(b.start);
                          if (nextEnd >= 1440) {
                            notify("预订不能跨日");
                            return;
                          }
                          dragged.current = Date.now();
                          onEdit(b, {
                            roomId: r.id,
                            date,
                            start: nextStart,
                            end:
                              String(Math.floor(nextEnd / 60)).padStart(
                                2,
                                "0",
                              ) +
                              ":" +
                              String(nextEnd % 60).padStart(2, "0"),
                          });
                        }}
                      >
                        {events.map((b) => {
                          const editable =
                            b.owner === "me" || data?.user.role === "admin";
                          return (
                            <button
                              key={b.id}
                              className={`calendar-event ${b.status === "pending" ? "pending" : ""}`}
                              disabled={loading}
                              draggable={editable && !loading}
                              data-drag-booking={editable ? b.id : undefined}
                              data-edit-booking={editable ? b.id : undefined}
                              onDragStart={(e) => {
                                dragged.current = Date.now();
                                e.dataTransfer.setData("text/plain", b.id);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={() => {
                                dragged.current = Date.now();
                              }}
                              onClick={() => {
                                if (Date.now() - dragged.current < 350) return;
                                editable ? onEdit(b) : onDetail(r.id);
                              }}
                            >
                              <span>
                                {b.start}–{b.end}
                              </span>
                              {b.title}
                              {b.status === "pending" ? " · 待审批" : ""}
                            </button>
                          );
                        })}
                        <button
                          className="calendar-add"
                          disabled={loading || r.canBook === false}
                          aria-label={`预订${r.name} ${date} ${start}`}
                          onClick={() => onBook(r, start, date)}
                        >
                          ＋
                        </button>
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
          <div className="pagination">
            <button
              className="button"
              disabled={loading || c.page <= 1}
              onClick={() => setPage(c.page - 1)}
            >
              上一页
            </button>
            <span>
              {c.page} / {c.pages}
            </span>
            <button
              className="button"
              disabled={loading || c.page >= c.pages}
              onClick={() => setPage(c.page + 1)}
            >
              下一页
            </button>
          </div>
        </>
      )}
    </section>
  );
}
