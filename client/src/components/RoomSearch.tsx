import { useEffect, useRef, useState } from "react";
import { json, message } from "../api";
import { useWorkspace } from "../workspace";
import type { Filters } from "../types";
import type { BookRoom } from "../pages/Bookings";
export interface RoomSuggestion {
  roomId: string;
  name: string;
  building: string;
  floor: string;
  capacity: number;
  equip: string[];
  rule: string;
  date: string;
  start: string;
  end: string;
  reason: string;
}
export interface RoomSearchResult {
  filters: Filters;
  suggestions: RoomSuggestion[];
  question: string | null;
  message: string;
}
export function RoomSuggestions({
  result,
  onChoose,
}: {
  result: RoomSearchResult;
  onChoose: (suggestion: RoomSuggestion) => void;
}) {
  return (
    <div className="room-suggestions" aria-live="polite">
      {(result.question || result.message) && (
        <p>{result.question || result.message}</p>
      )}
      {result.suggestions.length > 0 && (
        <>
          <p className="suggestion-time">
            {result.filters.date} · {result.filters.start}–{result.filters.end}
          </p>
          <ul>
            {result.suggestions.map((s) => (
              <li key={s.roomId}>
                <div className="suggestion-info">
                  <strong>{s.name}</strong>
                  <span>
                    {s.building} / {s.floor} · {s.capacity} 人
                    {s.rule === "approval" ? " · 需要审批" : ""}
                  </span>
                  <small>{s.reason}</small>
                </div>
                <button
                  type="button"
                  className="button small"
                  onClick={() => onChoose(s)}
                >
                  选择
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
export function RoomSearch({ onBook }: { onBook: BookRoom }) {
  const { filters, setFilters, data, request } = useWorkspace();
  const [text, setText] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RoomSearchResult | null>(null);
  const controller = useRef<AbortController | null>(null);
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    controller.current?.abort();
    setBusy(false);
    setHistory([]);
    setError("");
    setResult((current) =>
      current && JSON.stringify(current.filters) === filterKey ? current : null,
    );
    return () => controller.current?.abort();
  }, [filterKey]);
  async function search(natural: boolean) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const messages = [...history, text.trim()];
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const next = await request<RoomSearchResult>("/room-search", {
        ...json({ filters, ...(natural ? { messages } : {}) }),
        signal: current.signal,
      });
      if (current.signal.aborted) return;
      setResult(next);
      setHistory(
        next.question && natural
          ? [messages[0], ...messages.slice(1).slice(-6)]
          : [],
      );
      if (!next.question) setFilters(next.filters);
      setText("");
    } catch (e) {
      if (!current.signal.aborted) setError(message(e));
    } finally {
      if (!current.signal.aborted) setBusy(false);
    }
  }
  const visibleResult =
    result && JSON.stringify(result.filters) === filterKey ? result : null;
  return (
    <div className="smart-search">
      <form
        className="field smart-search-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && text.trim()) void search(true);
        }}
      >
        <label className="sr-only" htmlFor="room-request">
          一句话找会议室
        </label>
        <input
          id="room-request"
          value={text}
          maxLength={1000}
          placeholder={
            visibleResult?.question
              ? "补充需求…"
              : "例如：明天 14 点到 15 点，8 人，需要白板和投屏"
          }
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
        <button className="button primary" disabled={busy || !text.trim()}>
          {busy ? "查找中…" : "智能找房"}
        </button>
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => void search(false)}
        >
          按筛选推荐
        </button>
      </form>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {visibleResult && (
        <RoomSuggestions
          result={visibleResult}
          onChoose={(s) => {
            const room = data?.rooms.find((r) => r.id === s.roomId);
            if (room) onBook(room, s.start, s.date, s.end);
          }}
        />
      )}
    </div>
  );
}
