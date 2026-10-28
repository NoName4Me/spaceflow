import { useCallback, useRef, useState } from "react";
import {
  RoomSuggestions,
  type RoomSearchResult,
} from "../components/RoomSearch";
import { ApiError, json, message } from "../api";
import { statusLabels, today, value } from "../model";
import { useWorkspace } from "../workspace";
import { Field, Select, Empty, Tools } from "../components/ui";
import { useDialogFocus } from "../components/useDialogFocus";
import type { Booking, Directory, Room } from "../types";
export type BookRoom = (
  room: Room,
  start?: string,
  date?: string,
  end?: string,
) => void;
export type EditBooking = (booking: Booking, patch?: Partial<Booking>) => void;
interface BookingDraft {
  room: Room;
  start?: string;
  end?: string;
  date: string;
  directory: Directory;
}
export function useBookingActions() {
  const { data, filters, request, setDialog, run } = useWorkspace();
  const [booking, setBooking] = useState<BookingDraft | null>(null);
  const close = useCallback(() => setBooking(null), []);
  const open: BookRoom = (room, start, date, end) => {
    void run(async () => {
      if (!data) return;
      if (
        room.canBook === false ||
        room.status !== "enabled" ||
        (room.rule === "admin" && data.user.role !== "admin")
      )
        throw Error("该会议室当前不可预订");
      const directory =
        data.user.role === "admin"
          ? await request<Directory>("/admin/directory")
          : { users: [], departments: [] };
      setBooking({ room, start, end, date: date || filters.date, directory });
    });
  };
  const edit: EditBooking = (b, patch = {}) => {
    if (!data) return;
    const initial = { ...b, ...patch };
    setDialog({
      title: "修改预订",
      content: (
        <>
          <Field
            label="会议主题"
            name="title"
            defaultValue={initial.title}
            required
            maxLength={100}
          />
          <Select
            label="会议室"
            name="roomId"
            options={data.rooms
              .filter((r) => r.canBook !== false)
              .map((r) => [r.id, `${r.building} / ${r.floor} / ${r.name}`])}
            value={initial.roomId}
          />
          <Field
            label="使用日期"
            name="date"
            type="date"
            defaultValue={initial.date}
            min={today()}
            required
          />
          <Field
            label="开始时间"
            name="start"
            type="time"
            defaultValue={initial.start}
            required
          />
          <Field
            label="结束时间"
            name="end"
            type="time"
            defaultValue={initial.end}
            required
          />
          <Field
            label="联系人"
            name="contact"
            defaultValue={initial.contact}
            maxLength={100}
            required
          />
          <Field
            label="联系方式"
            name="phone"
            defaultValue={initial.phone}
            maxLength={100}
            required
          />
          <div className="field full-row">
            <label htmlFor="edit-notes">备注</label>
            <textarea
              id="edit-notes"
              name="notes"
              maxLength={2000}
              defaultValue={initial.notes || ""}
            />
          </div>
          {b.seriesId && (
            <Select
              label="修改范围"
              name="scope"
              options={[
                ["single", "仅本次"],
                ["future", "本次及之后的有效预订"],
              ]}
              value="single"
            />
          )}
          <label className="checkbox-row full-row">
            <input type="checkbox" name="hidden" defaultChecked={b.hidden} />
            隐藏预订详情
          </label>
        </>
      ),
      save: async (f) => {
        await request(
          `/bookings/${b.id}`,
          json(
            {
              revision: b.revision,
              title: value(f, "title"),
              contact: value(f, "contact"),
              phone: value(f, "phone"),
              hidden: f.has("hidden"),
              notes: value(f, "notes"),
              roomId: value(f, "roomId"),
              date: value(f, "date"),
              start: value(f, "start"),
              end: value(f, "end"),
              scope: value(f, "scope") || "single",
            },
            "PUT",
          ),
        );
      },
    });
  };
  return { booking, open, edit, close };
}
export function BookingForm({
  draft,
  close,
}: {
  draft: BookingDraft;
  close: () => void;
}) {
  const { data, filters, request, refresh, navigate, notify } = useWorkspace();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [conflicts, setConflicts] = useState<string[]>([]),
    [skip, setSkip] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(draft.room);
  const [alternatives, setAlternatives] = useState<RoomSearchResult | null>(
    null,
  );
  const reviewed = useRef({ dates: [] as string[], window: "" });
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, close);
  const r = selectedRoom,
    first = draft.start || filters.start,
    end =
      draft.end ||
      (draft.start
        ? `${String(Math.min(23, Number(first.slice(0, 2)) + 1)).padStart(2, "0")}:00`
        : filters.end);
  if (!data) return null;
  return (
    <div ref={ref}>
      <div className="modal-top">
        <h2 id="modalTitle">预订会议室</h2>
        <button
          className="icon-btn"
          id="closeModal"
          aria-label="关闭"
          onClick={close}
        >
          ×
        </button>
      </div>
      <div id="modalBody">
        <form
          id="bookingForm"
          onChange={() => setAlternatives(null)}
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            setAlternatives(null);
            let hasConflict = false;
            let singleWindow: {
              date: string;
              start: string;
              end: string;
            } | null = null;
            try {
              const frequency = value(f, "frequency");
              const repeat =
                frequency && frequency !== "none"
                  ? {
                      frequency,
                      count: Number(f.get("count")),
                      interval: Number(f.get("interval") || 1),
                      ...(frequency === "weekly" && f.getAll("weekdays").length
                        ? { weekdays: f.getAll("weekdays").map(Number) }
                        : {}),
                    }
                  : undefined;
              const payload = {
                roomId: r.id,
                title: value(f, "title"),
                contact: value(f, "contact"),
                phone: value(f, "phone"),
                date: value(f, "date"),
                start: value(f, "start"),
                end: value(f, "end"),
                hidden: f.has("hidden"),
                notes: value(f, "notes"),
                ...(repeat ? { repeat } : {}),
                ...(f.get("userId") ? { userId: value(f, "userId") } : {}),
              };
              if (!repeat)
                singleWindow = {
                  date: payload.date,
                  start: payload.start,
                  end: payload.end,
                };
              const preview = await request<{ conflicts: string[] }>(
                "/bookings/preview",
                json(payload),
              );
              const window = JSON.stringify([
                payload.date,
                payload.start,
                payload.end,
                repeat,
              ]);
              if (
                preview.conflicts.length &&
                (!repeat ||
                  !skip ||
                  reviewed.current.window !== window ||
                  !preview.conflicts.every((d) =>
                    reviewed.current.dates.includes(d),
                  ))
              ) {
                hasConflict = true;
                reviewed.current = { dates: preview.conflicts, window };
                setConflicts(repeat ? preview.conflicts : []);
                setSkip(false);
                throw Error("以下日期已占用：" + preview.conflicts.join("、"));
              }
              await request(
                "/bookings",
                json({
                  ...payload,
                  ...(preview.conflicts.length
                    ? { skipDates: reviewed.current.dates }
                    : {}),
                }),
              );
              await refresh();
              close();
              navigate("mine");
              notify(r.rule === "approval" ? "已提交审批" : "预订成功");
            } catch (error) {
              setError(message(error));
              if (
                singleWindow &&
                ((error instanceof ApiError && error.status === 409) ||
                  hasConflict)
              ) {
                try {
                  const result = await request<RoomSearchResult>(
                    "/room-search",
                    json({
                      filters: { ...filters, ...singleWindow },
                    }),
                  );
                  setAlternatives(result);
                } catch (searchError) {
                  setError(
                    message(error) + "；替代查找失败：" + message(searchError),
                  );
                }
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">
            <div className="field full-row">
              <label htmlFor="booking-room">会议室</label>
              <input
                id="booking-room"
                value={`${r.name} · ${r.code}`}
                disabled
              />
            </div>
            {data.user.role === "admin" && (
              <div className="full-row">
                <Select
                  label="预订人"
                  name="userId"
                  id="book-owner"
                  options={[
                    ["", "本人预订"],
                    ...draft.directory.users
                      .filter((u) => u.active && u.id !== data.user.id)
                      .map(
                        (u) =>
                          [u.id, `${u.name} (${u.username})`] as [
                            string,
                            string,
                          ],
                      ),
                  ]}
                  value=""
                />
              </div>
            )}
            <div className="full-row">
              <Field
                label="会议主题"
                name="title"
                id="book-title"
                required
                maxLength={100}
              />
            </div>
            <div className="full-row">
              <Field
                label="使用日期"
                name="date"
                id="book-date"
                type="date"
                defaultValue={draft.date}
                min={today()}
                required
              />
            </div>
            <Field
              label="开始时间"
              name="start"
              id="book-start"
              type="time"
              defaultValue={first}
              required
            />
            <Field
              label="结束时间"
              name="end"
              id="book-end"
              type="time"
              defaultValue={end}
              required
            />
            <Field
              label="联系人"
              name="contact"
              id="book-contact"
              defaultValue={data.user.name}
              required
              maxLength={100}
            />
            <Field
              label="联系方式"
              name="phone"
              id="book-phone"
              required
              maxLength={100}
            />
            {r.repeat && (
              <>
                <Select
                  label="重复方式"
                  name="frequency"
                  id="repeat-frequency"
                  options={[
                    ["none", "不重复"],
                    ["weekly", "每周"],
                    ["daily", "每天"],
                    ["monthly", "每月"],
                  ]}
                  value="none"
                />
                <Field
                  label="次数"
                  name="count"
                  id="repeat-count"
                  type="number"
                  min={2}
                  max={52}
                  defaultValue={4}
                />
                <Field
                  label="间隔"
                  name="interval"
                  id="repeat-interval"
                  type="number"
                  min={1}
                  max={12}
                  defaultValue={1}
                />
                <Select
                  label="每周日期"
                  name="weekdays"
                  id="repeat-weekdays"
                  multiple
                  value={[]}
                  options={[
                    ["1", "周一"],
                    ["2", "周二"],
                    ["3", "周三"],
                    ["4", "周四"],
                    ["5", "周五"],
                    ["6", "周六"],
                    ["0", "周日"],
                  ]}
                />
              </>
            )}
            <div className="field full-row">
              <label htmlFor="book-notes">备注</label>
              <textarea id="book-notes" name="notes" maxLength={2000} />
            </div>
            <label className="checkbox-row full-row">
              <input name="hidden" type="checkbox" />
              隐藏预订详情
            </label>
            <div
              id="bookingError"
              className="full-row alert"
              role="alert"
              hidden={!error}
            >
              {error}
            </div>
            {alternatives && (
              <div className="full-row">
                <RoomSuggestions
                  result={alternatives}
                  onChoose={(s) => {
                    const next = data.rooms.find(
                      (room) => room.id === s.roomId,
                    );
                    if (!next) return;
                    setSelectedRoom(next);
                    setAlternatives(null);
                    setError("");
                    reviewed.current = { dates: [], window: "" };
                  }}
                />
              </div>
            )}
            <label
              className="checkbox-row full-row"
              id="skipConflictRow"
              hidden={!conflicts.length}
            >
              <input
                id="skipConflicts"
                type="checkbox"
                checked={skip}
                onChange={(e) => setSkip(e.target.checked)}
              />
              仅提交无冲突日期
            </label>
          </div>
          <div className="form-foot">
            <button
              className="button"
              type="button"
              id="cancelModal"
              onClick={close}
            >
              取消
            </button>
            <button className="button primary" type="submit" disabled={busy}>
              {r.rule === "approval" ? "提交审批" : "确认预订"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
export function Bookings({
  mode,
  onEdit,
}: {
  mode: "mine" | "approvals" | "reservations";
  onEdit: EditBooking;
}) {
  const { data, request, refresh, notify, navigate } = useWorkspace();
  const [busy, setBusy] = useState("");
  if (!data) return null;
  const bookings = data.bookings
    .filter((b) =>
      mode === "mine"
        ? b.owner === "me"
        : mode === "approvals"
          ? b.status === "pending"
          : true,
    )
    .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
  const act = async (b: Booking, action: string, series = false) => {
    setBusy(b.id);
    try {
      await request(
        `/${series ? "series" : "bookings"}/${series ? b.seriesId : b.id}/${action}`,
        { method: "POST" },
      );
      await refresh();
      notify(series ? "已处理后续预订" : "已更新预订");
    } catch (e) {
      notify(message(e));
    } finally {
      setBusy("");
    }
  };
  return (
    <section className="page">
      {mode === "mine" && (
        <Tools>
          <button
            className="button primary"
            onClick={() => navigate("explore")}
          >
            ＋ 创建新预订
          </button>
        </Tools>
      )}
      <div className="panel booking-list">
        {mode === "mine" && (
          <div className="panel-title">
            <h2>预订记录 ({bookings.length})</h2>
          </div>
        )}
        {bookings.map((b) => (
          <article className="booking-item" key={b.id}>
            <div>
              <h3>
                {mode !== "approvals" && (
                  <span
                    className={`booking-badge ${b.status === "pending" ? "pending" : ["cancelled", "rejected", "expired"].includes(b.status) ? "cancelled" : ""}`}
                  >
                    {statusLabels[b.status]}
                  </span>
                )}
                {b.title}
              </h3>
              <p>
                {data.rooms.find((r) => r.id === b.roomId)?.name || b.roomName}{" "}
                · {b.date} {b.start}–{b.end}
                {mode !== "mine" && ` · ${b.contact || ""}`}
              </p>
            </div>
            <div className="row-actions">
              {mode === "approvals" ? (
                <>
                  <button
                    className="button"
                    disabled={busy === b.id}
                    onClick={() => void act(b, "reject")}
                  >
                    拒绝
                  </button>
                  <button
                    className="button primary"
                    disabled={busy === b.id}
                    onClick={() => void act(b, "approve")}
                  >
                    通过
                  </button>
                  {b.seriesId && (
                    <>
                      <button
                        className="button small"
                        disabled={busy === b.id}
                        onClick={() => void act(b, "approve", true)}
                      >
                        通过后续
                      </button>
                      <button
                        className="button small"
                        disabled={busy === b.id}
                        onClick={() => void act(b, "reject", true)}
                      >
                        拒绝后续
                      </button>
                    </>
                  )}
                </>
              ) : (
                ["pending", "confirmed"].includes(b.status) && (
                  <>
                    {mode === "mine" && (
                      <button
                        className="button small"
                        onClick={() => onEdit(b)}
                      >
                        修改
                      </button>
                    )}
                    <button
                      className="button small"
                      disabled={busy === b.id}
                      onClick={() => void act(b, "cancel")}
                    >
                      {mode === "mine" && b.seriesId ? "取消本次" : "取消预订"}
                    </button>
                    {b.seriesId && (
                      <button
                        className="button small"
                        disabled={busy === b.id}
                        onClick={() => void act(b, "cancel", true)}
                      >
                        取消所有后续
                      </button>
                    )}
                  </>
                )
              )}
            </div>
          </article>
        ))}
        {!bookings.length && (
          <Empty>{mode === "approvals" ? "暂无待审批申请" : "暂无预订"}</Empty>
        )}
      </div>
    </section>
  );
}
