import { useCallback, useEffect, useId, useRef, useState } from "react";
import { json, message } from "../api";
import { initialFilters } from "../model";
import { companyDate } from "../booking-dates";
import { useWorkspace } from "../workspace";
import { useDialogFocus } from "./useDialogFocus";
import {
  RoomSuggestions,
  type AssistantField,
  type RoomSearchResult,
} from "./RoomSearch";
import type { BookRoom } from "../pages/Bookings";
import type { Filters } from "../types";
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  result?: RoomSearchResult;
  failed?: boolean;
  confirmed?: boolean;
  answers?: Partial<Filters>;
}
interface Chat {
  id: string;
  title: string;
  filters: Filters;
  messages: ChatMessage[];
  updatedAt: number;
}
interface ChatStore {
  active: string;
  chats: Chat[];
}
const allFields: AssistantField[] = [
  "date",
  "start",
  "end",
  "capacity",
  "equip",
  "building",
  "floor",
];
const newChat = (): Chat => ({
  id: crypto.randomUUID(),
  title: "新对话",
  filters: { ...initialFilters(), date: companyDate() },
  messages: [],
  updatedAt: Date.now(),
});
function readChats(key: string): ChatStore {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (
      saved?.version === 1 &&
      Array.isArray(saved.chats) &&
      saved.chats.length &&
      saved.chats.every(
        (c: Chat) =>
          typeof c.id === "string" &&
          typeof c.title === "string" &&
          Array.isArray(c.messages) &&
          Array.isArray(c.filters?.equip) &&
          c.messages.every(
            (m) =>
              typeof m.content === "string" &&
              ["user", "assistant"].includes(m.role),
          ),
      )
    )
      return {
        chats: saved.chats.map((c: Chat) =>
          c.messages.length
            ? c
            : { ...c, filters: { ...initialFilters(), date: companyDate() } },
        ),
        active: saved.active,
      };
  } catch {
    /* Storage is optional; the current conversation still works. */
  }
  const chat = newChat();
  return { chats: [chat], active: chat.id };
}
function AssistantIcon({
  kind = "assistant",
}: {
  kind?: "assistant" | "send" | "history" | "plus" | "close";
}) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "assistant" && (
        <>
          <path d="M12 3c0 5-4 9-9 9 5 0 9 4 9 9 0-5 4-9 9-9-5 0-9-4-9-9Z" />
          <path d="M20 2v4m-2-2h4" />
        </>
      )}
      {kind === "send" && (
        <>
          <path d="m5 12 7-7 7 7M12 5v15" />
        </>
      )}
      {kind === "history" && (
        <>
          <path d="M3 11a9 9 0 1 1 2 7M3 4v7h7" />
          <path d="M12 7v5l3 2" />
        </>
      )}
      {kind === "plus" && <path d="M12 4v16M4 12h16" />}
      {kind === "close" && <path d="m6 6 12 12M18 6 6 18" />}
    </svg>
  );
}
function MobileFocus({
  panel,
  close,
}: {
  panel: React.RefObject<HTMLElement | null>;
  close: () => void;
}) {
  useDialogFocus(panel, close);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return null;
}
function Requirements({
  filters,
  fields,
  busy,
  onConfirm,
}: {
  filters: Filters;
  fields: AssistantField[];
  busy: boolean;
  onConfirm: (answers: Partial<Filters>) => void;
}) {
  const { data } = useWorkspace();
  const [draft, setDraft] = useState(filters);
  const id = useId();
  const has = (field: AssistantField) => fields.includes(field);
  const equipment = [
    ...new Set([
      "白板",
      "投屏",
      "视频会议",
      "音响",
      ...(data?.rooms.flatMap((r) => r.equip) || []),
      ...draft.equip,
    ]),
  ];
  const buildings = [...new Set(data?.rooms.map((r) => r.building) || [])];
  const floors = [
    ...new Set(
      data?.rooms
        .filter(
          (r) => draft.building === "all" || r.building === draft.building,
        )
        .map((r) => r.floor) || [],
    ),
  ];
  const selected = (patch: Partial<Filters>) =>
    setDraft((current) => ({ ...current, ...patch }));
  return (
    <form
      className="assistant-requirements"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(
          Object.fromEntries(
            [
              ...new Set([
                ...fields,
                ...(has("building") ? ["floor" as const] : []),
              ]),
            ].map((field) => [field, draft[field]]),
          ),
        );
      }}
    >
      <fieldset disabled={busy}>
        <legend>会议需求</legend>
        <div className="assistant-fields">
          {has("date") && (
            <div className="field assistant-field-wide">
              <label htmlFor={`${id}-date`}>日期</label>
              <input
                id={`${id}-date`}
                type="date"
                min={companyDate()}
                required
                value={draft.date}
                onChange={(e) => selected({ date: e.target.value })}
              />
            </div>
          )}
          {has("start") && (
            <div className="field">
              <label htmlFor={`${id}-start`}>开始时间</label>
              <input
                id={`${id}-start`}
                type="time"
                required
                value={draft.start}
                onChange={(e) => selected({ start: e.target.value })}
              />
            </div>
          )}
          {has("end") && (
            <div className="field">
              <label htmlFor={`${id}-end`}>结束时间</label>
              <input
                id={`${id}-end`}
                type="time"
                required
                min={draft.start}
                value={draft.end}
                onChange={(e) => selected({ end: e.target.value })}
              />
            </div>
          )}
          {has("end") && (
            <div
              className="assistant-duration assistant-field-wide"
              role="group"
              aria-label="会议时长"
            >
              {[30, 60, 90, 120].map((duration) => {
                const start =
                  Number(draft.start.slice(0, 2)) * 60 +
                  Number(draft.start.slice(3));
                const end = start + duration;
                const value = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
                return (
                  <button
                    type="button"
                    className={`chip ${draft.end === value ? "on" : ""}`}
                    key={duration}
                    disabled={end >= 1440}
                    aria-pressed={draft.end === value}
                    onClick={() => selected({ end: value })}
                  >
                    {duration === 30 ? "30 分钟" : `${duration / 60} 小时`}
                  </button>
                );
              })}
            </div>
          )}
          {has("capacity") && (
            <div className="field assistant-field-wide">
              <label htmlFor={`${id}-capacity`}>人数</label>
              <input
                id={`${id}-capacity`}
                type="number"
                min={0}
                max={10000}
                required
                value={draft.capacity}
                onChange={(e) => selected({ capacity: Number(e.target.value) })}
              />
            </div>
          )}
          {has("building") && (
            <div className="field">
              <label htmlFor={`${id}-building`}>楼栋</label>
              <select
                id={`${id}-building`}
                value={draft.building}
                onChange={(e) => {
                  selected({ building: e.target.value, floor: "all" });
                }}
              >
                <option value="all">不限</option>
                {[
                  ...new Set([
                    ...buildings,
                    ...(draft.building !== "all" ? [draft.building] : []),
                  ]),
                ].map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </div>
          )}
          {has("floor") && (
            <div className="field">
              <label htmlFor={`${id}-floor`}>楼层</label>
              <select
                id={`${id}-floor`}
                value={draft.floor}
                onChange={(e) => selected({ floor: e.target.value })}
              >
                <option value="all">不限</option>
                {[
                  ...new Set([
                    ...floors,
                    ...(draft.floor !== "all" ? [draft.floor] : []),
                  ]),
                ].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </div>
          )}
          {has("equip") && (
            <div className="assistant-field-wide">
              <span className="assistant-control-label">所需设施</span>
              <div
                className="assistant-equipment"
                role="group"
                aria-label="所需设施"
              >
                {equipment.map((equip) => (
                  <button
                    type="button"
                    key={equip}
                    className={`chip ${draft.equip.includes(equip) ? "on" : ""}`}
                    aria-pressed={draft.equip.includes(equip)}
                    onClick={() =>
                      selected({
                        equip: draft.equip.includes(equip)
                          ? draft.equip.filter((v) => v !== equip)
                          : [...draft.equip, equip],
                      })
                    }
                  >
                    {equip}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button
          className="button primary assistant-confirm"
          disabled={
            busy || ((has("start") || has("end")) && draft.start >= draft.end)
          }
        >
          确认条件并继续
        </button>
      </fieldset>
    </form>
  );
}
function summary(answers: Partial<Filters>) {
  return [
    answers.date,
    answers.start && `开始 ${answers.start}`,
    answers.end && `结束 ${answers.end}`,
    answers.capacity !== undefined &&
      (answers.capacity ? `${answers.capacity} 人` : "人数不限"),
    answers.building &&
      (answers.building === "all" ? "楼栋不限" : answers.building),
    answers.floor && (answers.floor === "all" ? "楼层不限" : answers.floor),
    answers.equip &&
      (answers.equip.length ? `需要${answers.equip.join("、")}` : "设施不限"),
  ]
    .filter(Boolean)
    .join("，");
}
export function Assistant({
  onBook,
  open,
  onClose,
  userId,
}: {
  onBook: BookRoom;
  open: boolean;
  onClose: () => void;
  userId: string;
}) {
  const { setFilters, data, request } = useWorkspace();
  const storageKey = `spaceflow-assistant-v1:${userId}`;
  const [store, setStore] = useState(() => readChats(storageKey));
  const chat = store.chats.find((c) => c.id === store.active) || store.chats[0];
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editConditions, setEditConditions] = useState(false);
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 720px)").matches,
  );
  const panel = useRef<HTMLElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const controller = useRef<AbortController | null>(null);
  const updateChat = useCallback((id: string, update: (c: Chat) => Chat) => {
    setStore((current) => ({
      ...current,
      chats: current.chats.map((c) => (c.id === id ? update(c) : c)),
    }));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ version: 1, ...store }),
      );
    } catch {
      /* A full browser store does not interrupt the conversation. */
    }
  }, [storageKey, store]);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 720px)");
    const change = () => setMobile(m.matches);
    m.addEventListener("change", change);
    return () => m.removeEventListener("change", change);
  }, []);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    if (!mobile) input.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        !document.querySelector(".modal-backdrop.open, dialog[open]")
      )
        onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, mobile, onClose]);
  useEffect(() => {
    if (open && log.current) {
      const turns =
        log.current.querySelectorAll<HTMLElement>(".assistant-turn");
      if (editConditions)
        turns.item(turns.length - 1)?.scrollIntoView({ block: "start" });
      else log.current.scrollTop = log.current.scrollHeight;
    }
  }, [open, chat.id, chat.messages.length, busy, editConditions]);
  async function send(content: string, answers?: Partial<Filters>) {
    if (busy || !content.trim()) return;
    const chatId = chat.id;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      answers,
    };
    const messages = [...chat.messages, userMessage];
    const current = new AbortController();
    controller.current = current;
    updateChat(chatId, (c) => ({
      ...c,
      filters: { ...c.filters, ...answers },
      title: c.messages.length ? c.title : content.slice(0, 24),
      messages: c.messages
        .map((m) => (m.result?.question ? { ...m, confirmed: true } : m))
        .concat(userMessage),
      updatedAt: Date.now(),
    }));
    setText("");
    setBusy(true);
    setEditConditions(false);
    try {
      const conversation = messages
        .filter((m) => !m.failed)
        .slice(-40)
        .map((m) => ({
          role: m.role,
          content: (
            m.content +
            (m.result?.suggestions.length
              ? "\n本轮查询结果：" +
                JSON.stringify(
                  m.result.suggestions.map(
                    ({
                      name,
                      building,
                      floor,
                      capacity,
                      equip,
                      rule,
                      date,
                      start,
                      end,
                    }) => ({
                      name,
                      building,
                      floor,
                      capacity,
                      equip,
                      rule,
                      date,
                      start,
                      end,
                    }),
                  ),
                )
              : "")
          ).slice(0, 4000),
        }));
      const result = await request<RoomSearchResult>("/room-search", {
        ...json({
          filters: chat.filters,
          conversation,
          ...(answers ? { answers } : {}),
        }),
        signal: current.signal,
      });
      if (current.signal.aborted) return;
      updateChat(chatId, (c) => ({
        ...c,
        filters: result.filters,
        messages: [
          ...c.messages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content:
              result.question || result.message || "这些会议室符合你的需求。",
            result,
          },
        ],
        updatedAt: Date.now(),
      }));
    } catch (e) {
      if (!current.signal.aborted)
        updateChat(chatId, (c) => ({
          ...c,
          messages: [
            ...c.messages,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: message(e),
              failed: true,
            },
          ],
        }));
    } finally {
      if (!current.signal.aborted) setBusy(false);
    }
  }
  function createChat() {
    const next = newChat();
    setStore((current) => ({
      active: next.id,
      chats: [next, ...current.chats],
    }));
    setHistoryOpen(false);
    setEditConditions(false);
    setText("");
  }
  return (
    <>
      {open && mobile && (
        <>
          <MobileFocus panel={panel} close={onClose} />
          <button
            className="assistant-scrim"
            aria-label="关闭 AI 助手"
            onClick={onClose}
            tabIndex={-1}
          />
        </>
      )}
      <aside
        ref={panel}
        id="assistant-drawer"
        className={`assistant-drawer ${open ? "is-open" : ""}`}
        hidden={!open}
        role={mobile ? "dialog" : "complementary"}
        aria-modal={mobile || undefined}
        aria-labelledby="assistant-title"
      >
        <header className="assistant-header">
          <div className="assistant-identity">
            <span className="assistant-mark">
              <AssistantIcon />
            </span>
            <div>
              <h2 id="assistant-title">间序助手</h2>
              <span>会议室预订助手</span>
            </div>
          </div>
          <div className="assistant-header-actions">
            <button
              className="icon-btn"
              title="历史对话"
              aria-label="历史对话"
              aria-expanded={historyOpen}
              onClick={() => setHistoryOpen(!historyOpen)}
            >
              <AssistantIcon kind="history" />
            </button>
            <button
              className="icon-btn"
              title="新对话"
              aria-label="新对话"
              disabled={busy}
              onClick={createChat}
            >
              <AssistantIcon kind="plus" />
            </button>
            <button
              className="icon-btn"
              aria-label="收起 AI 助手"
              onClick={onClose}
            >
              <AssistantIcon kind="close" />
            </button>
          </div>
        </header>
        {historyOpen && (
          <div className="assistant-history">
            <h3>历史对话</h3>
            {store.chats.map((c) => (
              <button
                key={c.id}
                disabled={busy}
                className={c.id === chat.id ? "active" : ""}
                onClick={() => {
                  setStore((s) => ({ ...s, active: c.id }));
                  setHistoryOpen(false);
                  setEditConditions(false);
                  setText("");
                }}
              >
                <span>{c.title}</span>
                <small>
                  {new Date(c.updatedAt).toLocaleDateString("zh-CN", {
                    month: "numeric",
                    day: "numeric",
                  })}
                </small>
              </button>
            ))}
          </div>
        )}
        <div
          className="assistant-log"
          ref={log}
          role="log"
          aria-label="与间序助手的对话"
          aria-live="polite"
          aria-relevant="additions"
        >
          {!chat.messages.length && (
            <div className="assistant-welcome">
              <span className="assistant-welcome-icon">
                <AssistantIcon />
              </span>
              <h3>这次会议，怎么安排？</h3>
              <p>告诉我时间、人数和要求，我来找合适的会议室。</p>
              <div className="assistant-starters">
                <button onClick={() => void send("帮我找一间会议室")}>
                  找一间会议室 <span aria-hidden="true">→</span>
                </button>
                <button onClick={() => setEditConditions(true)}>
                  选择时间与设施 <span aria-hidden="true">→</span>
                </button>
                <button onClick={() => void send("预订会议室需要审批吗？")}>
                  了解预订规则 <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          )}
          {chat.messages.map((m, index) => (
            <div
              className={`assistant-turn ${m.role} ${m.failed ? "failed" : ""}`}
              key={m.id}
            >
              <div className="assistant-speaker">
                {m.role === "user" ? "你" : "间序助手"}
              </div>
              <div className="assistant-message">{m.content}</div>
              {m.result && (
                <>
                  {!!m.result.suggestions.length && (
                    <RoomSuggestions
                      result={m.result}
                      showMessage={false}
                      onChoose={(s) => {
                        const room = data?.rooms.find((r) => r.id === s.roomId);
                        if (room) {
                          setFilters(m.result!.filters);
                          onClose();
                          onBook(room, s.start, s.date, s.end);
                        }
                      }}
                    />
                  )}
                  {m.result.question &&
                    !m.confirmed &&
                    index === chat.messages.length - 1 &&
                    !editConditions && (
                      <Requirements
                        filters={m.result.filters}
                        fields={
                          m.result.fields?.length
                            ? m.result.fields
                            : ["date", "start", "end", "capacity", "equip"]
                        }
                        busy={busy}
                        onConfirm={(answers) =>
                          void send(summary(answers), answers)
                        }
                      />
                    )}
                </>
              )}
              {m.failed && index === chat.messages.length - 1 && (
                <button
                  className="linklike assistant-retry"
                  disabled={busy}
                  onClick={() => {
                    const previous = chat.messages
                      .slice(0, index)
                      .findLast((item) => item.role === "user");
                    if (previous) void send(previous.content, previous.answers);
                  }}
                >
                  重试
                </button>
              )}
            </div>
          ))}
          {editConditions && (
            <div className="assistant-turn assistant">
              <div className="assistant-speaker">调整会议需求</div>
              <Requirements
                key={chat.id + chat.messages.length}
                filters={chat.filters}
                fields={allFields}
                busy={busy}
                onConfirm={(answers) => void send(summary(answers), answers)}
              />
            </div>
          )}
          {busy && (
            <div className="assistant-thinking" role="status">
              <span className="assistant-thinking-dot" />
              正在整理你的需求…
            </div>
          )}
        </div>
        <div className="assistant-compose">
          <button
            className={`assistant-adjust ${editConditions ? "active" : ""}`}
            disabled={busy}
            aria-expanded={editConditions}
            onClick={() => setEditConditions(!editConditions)}
          >
            时间、人数与设施
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            <label className="sr-only" htmlFor="assistant-input">
              发给间序助手
            </label>
            <textarea
              ref={input}
              id="assistant-input"
              value={text}
              maxLength={1000}
              rows={2}
              placeholder="说说你的会议安排…"
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  void send(text);
                }
              }}
            />
            <button
              className="assistant-send"
              aria-label="发送消息"
              disabled={busy || !text.trim()}
            >
              <AssistantIcon kind="send" />
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
export function AssistantButton({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`button small assistant-trigger ${open ? "active" : ""}`}
      onClick={onClick}
      aria-expanded={open}
      aria-controls="assistant-drawer"
    >
      <AssistantIcon />
      AI 助手
    </button>
  );
}
