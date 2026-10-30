import { useEffect, useRef, useState } from "react";
import { Plan } from "../components/Plan";
import { Empty } from "../components/ui";
import { companyDate } from "../booking-dates";
import { RoomBookingList } from "./RoomBookingList";
import { available, initialFilters } from "../model";
import { useWorkspace } from "../workspace";
import type { Room } from "../types";
import type { BookRoom } from "./Bookings";
export function useRoomPreview() {
  const { data } = useWorkspace();
  return (room: Room) =>
    data?.layoutTemplates.find((t) => t.id === room.layoutTemplateId)?.layout ||
    data?.layoutTemplates.find((t) => t.type === room.type)?.layout ||
    [];
}
export function Facilities({ room }: { room: Room }) {
  return (
    <>
      {room.equip.map((item) => (
        <span className="amenity" key={item}>
          {item}
        </span>
      ))}
    </>
  );
}
export function Discovery({ onDetail }: { onDetail: (id: string) => void }) {
  const { data, filters: f, setFilters } = useWorkspace();
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem("spaceflow-view") === "list"
        ? "list"
        : "grid";
    } catch {
      return "grid";
    }
  });
  const [moreFilters, setMoreFilters] = useState(false);
  const preview = useRoomPreview();
  if (!data) return null;
  const buildings = [...new Set(data.rooms.map((r) => r.building))],
    floors = [
      ...new Set(
        data.rooms
          .filter((r) => f.building === "all" || r.building === f.building)
          .map((r) => r.floor),
      ),
    ];
  const results = data.rooms.filter(
    (r) =>
      (f.building === "all" || r.building === f.building) &&
      (f.floor === "all" || r.floor === f.floor) &&
      r.capacity >= f.capacity &&
      f.equip.every((e) => r.equip.includes(e)),
  );
  const roomAvailable = (r: Room) =>
    available(r, f, data.bookings, data.user.role === "admin");
  const status = (r: Room) =>
    roomAvailable(r)
      ? "时段空闲"
      : r.status !== "enabled"
        ? "暂停预订"
        : r.canBook === false
          ? "不可预订"
          : "时段占用";
  return (
    <section className="page discovery-page">
      <div className="filter-surface">
        <div className="filter-grid">
          <div className="field">
            <label htmlFor="f-date">日期</label>
            <input
              id="f-date"
              type="date"
              value={f.date}
              onChange={(e) =>
                e.target.value && setFilters({ ...f, date: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="f-capacity">人数</label>
            <select
              id="f-capacity"
              value={f.capacity}
              onChange={(e) =>
                setFilters({ ...f, capacity: Number(e.target.value) })
              }
            >
              <option value="0">不限</option>
              {[
                ...new Set([
                  4,
                  6,
                  8,
                  12,
                  16,
                  20,
                  ...(f.capacity ? [f.capacity] : []),
                ]),
              ]
                .sort((a, b) => a - b)
                .map((n) => (
                  <option value={n} key={n}>
                    {n} 人以上
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-start">开始时间</label>
            <input
              id="f-start"
              type="time"
              value={f.start}
              onChange={(e) => setFilters({ ...f, start: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="f-end">结束时间</label>
            <input
              id="f-end"
              type="time"
              value={f.end}
              onChange={(e) => setFilters({ ...f, end: e.target.value })}
            />
          </div>
        </div>
        <div className="filter-actions">
          <button
            className={`filter-toggle ${moreFilters ? "active" : ""}`}
            aria-expanded={moreFilters}
            aria-controls="additionalFilters"
            onClick={() => setMoreFilters(!moreFilters)}
          >
            更多筛选
            {(f.building !== "all" ||
              f.floor !== "all" ||
              f.equip.length > 0) && (
              <span className="filter-count">
                {Number(f.building !== "all") +
                  Number(f.floor !== "all") +
                  f.equip.length}
              </span>
            )}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <button
            className="linklike"
            id="clearFilters"
            onClick={() => setFilters(initialFilters())}
          >
            重置
          </button>
        </div>
        <div
          id="additionalFilters"
          className="filter-extra"
          hidden={!moreFilters}
        >
          <div className="filter-locations">
            {" "}
            <div className="field">
              <label htmlFor="f-building">楼栋</label>
              <select
                id="f-building"
                value={f.building}
                onChange={(e) =>
                  setFilters({ ...f, building: e.target.value, floor: "all" })
                }
              >
                <option value="all">全部楼栋</option>
                {[
                  ...new Set([
                    ...buildings,
                    ...(f.building !== "all" ? [f.building] : []),
                  ]),
                ].map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-floor">楼层</label>
              <select
                id="f-floor"
                value={f.floor}
                onChange={(e) => setFilters({ ...f, floor: e.target.value })}
              >
                <option value="all">全部楼层</option>
                {[
                  ...new Set([
                    ...floors,
                    ...(f.floor !== "all" ? [f.floor] : []),
                  ]),
                ].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="filter-row2">
            {[...new Set(["投屏", "视频会议", "白板", "音响", ...f.equip])].map(
              (e) => (
                <button
                  key={e}
                  className={`chip ${f.equip.includes(e) ? "on" : ""}`}
                  aria-pressed={f.equip.includes(e)}
                  onClick={() =>
                    setFilters({
                      ...f,
                      equip: f.equip.includes(e)
                        ? f.equip.filter((v) => v !== e)
                        : [...f.equip, e],
                    })
                  }
                >
                  {e}
                </button>
              ),
            )}
          </div>
        </div>
      </div>
      <div className="results-toolbar">
        <span>{results.length} 间会议室</span>
        <div className="view-switch" role="group" aria-label="展示方式">
          {(
            [
              ["grid", "宫格"],
              ["list", "列表"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={`button small ${view === key ? "active" : ""}`}
              aria-pressed={view === key}
              onClick={() => {
                setView(key);
                try {
                  localStorage.setItem("spaceflow-view", key);
                } catch {}
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {!results.length ? (
        <Empty>没有符合条件的会议室</Empty>
      ) : view === "list" ? (
        <div className="discovery-list">
          <div className="discovery-list-head" aria-hidden="true">
            {["会议室", "位置", "人数", "布局", "设施", "状态"].map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
          {results.map((r) => (
            <button
              className="discovery-list-row"
              data-room={r.id}
              key={r.id}
              onClick={() => onDetail(r.id)}
            >
              <span className="list-room">
                <span className="mini-plan">
                  <Plan elements={preview(r)} name={r.name} />
                </span>
                <span>
                  <strong>{r.name}</strong>
                  <small>{r.code}</small>
                </span>
              </span>
              <span>
                {r.building} / {r.floor}
              </span>
              <span>{r.capacity} 人</span>
              <span>{r.type}</span>
              <span className="list-facilities">
                <Facilities room={r} />
              </span>
              <span
                className={`room-status ${roomAvailable(r) ? "available" : "occupied"}`}
              >
                {status(r)}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rooms-grid">
          {results.map((r) => (
            <button
              className="room-card"
              data-room={r.id}
              key={r.id}
              onClick={() => onDetail(r.id)}
            >
              <span className="room-art">
                <Plan elements={preview(r)} name={r.name} />
                <span
                  className={`art-status ${roomAvailable(r) ? "" : "busy"}`}
                >
                  ● {status(r)}
                </span>
              </span>
              <span className="room-info">
                <span className="room-topline">
                  <strong>{r.name}</strong>
                  <span>{r.capacity} 人</span>
                </span>
                <span className="room-meta">
                  {r.building} / {r.floor} · {r.code}
                </span>
                <span className="room-layout-type">
                  <span>{r.type}</span>
                  {r.rule !== "instant" && (
                    <span className="room-rule">
                      {r.rule === "approval" ? "需要审批" : "仅管理员预订"}
                    </span>
                  )}
                </span>
                <span className="amenities">
                  <Facilities room={r} />
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
export function RoomDetail({
  id,
  close,
  onBook,
}: {
  id: string;
  close: () => void;
  onBook: BookRoom;
}) {
  const { data, filters } = useWorkspace(),
    preview = useRoomPreview();
  const [bookingDate, setBookingDate] = useState(filters.date);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  const room = data?.rooms.find((r) => r.id === id);
  useEffect(() => {
    if (!room) close();
  }, [room, close]);
  if (!room || !data) return null;
  return (
    <dialog
      ref={dialog}
      id="roomDialog"
      className="room-dialog"
      aria-labelledby="roomDetailTitle"
      onClose={close}
      onCancel={close}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          close();
      }}
    >
      <div className="room-dialog-heading">
        <h2 id="roomDetailTitle">{room.name}</h2>
        <button
          className="icon-btn"
          id="closeRoomDetail"
          aria-label="关闭会议室详情"
          onClick={close}
        >
          ×
        </button>
      </div>
      <div id="roomDetailBody">
        <div className="room-detail-layout">
          <div className="detail-preview">
            <Plan elements={preview(room)} name={room.name} />
          </div>
          <div className="detail-facts">
            <p>
              {room.building} / {room.floor} · {room.code}
            </p>
            <div className="fact-line">
              <strong>{room.capacity} 人</strong>
              <span>{room.area} ㎡</span>
              <span>{room.type}</span>
            </div>
            <div className="amenities">
              <Facilities room={room} />
            </div>
            {room.desc && <p>{room.desc}</p>}
            <div className="detail-booking-rule">
              {
                {
                  instant: "直接预订",
                  approval: "需要审批",
                  admin: "仅管理员预订",
                }[room.rule]
              }
            </div>
            <button
              className="button primary"
              disabled={room.canBook === false}
              onClick={() => {
                close();
                onBook(
                  room,
                  undefined,
                  bookingDate < companyDate() ? companyDate() : bookingDate,
                );
              }}
            >
              ＋ 预订会议室
            </button>
          </div>
        </div>
        <RoomBookingList
          roomId={id}
          initialDate={filters.date}
          onDateChange={setBookingDate}
        />
      </div>
    </dialog>
  );
}
