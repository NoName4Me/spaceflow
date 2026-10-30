import { useWorkspace } from "../workspace";
import { Plan } from "./Plan";
import type { Filters } from "../types";
export type AssistantField = keyof Filters;
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
  fields?: AssistantField[];
}
export function RoomSuggestions({
  result,
  onChoose,
  showMessage = true,
}: {
  result: RoomSearchResult;
  onChoose: (suggestion: RoomSuggestion) => void;
  showMessage?: boolean;
}) {
  const { data } = useWorkspace();
  return (
    <div className="room-suggestions">
      {showMessage && (result.question || result.message) && (
        <p>{result.question || result.message}</p>
      )}
      <div className="suggestion-cards">
        {result.suggestions.map((s) => {
          const room = data?.rooms.find((r) => r.id === s.roomId);
          if (!room) return null;
          const layout =
            data?.layoutTemplates.find((t) => t.id === room.layoutTemplateId) ||
            data?.layoutTemplates.find((t) => t.type === room.type);
          return (
            <article className="assistant-room-card" key={s.roomId}>
              <div className="assistant-room-overview">
                <div className="assistant-room-plan">
                  <Plan elements={layout?.layout || []} name={s.name} />
                </div>
                <div className="assistant-room-info">
                  <div className="assistant-room-title">
                    <h3>{s.name}</h3>
                    <span>{s.capacity} 人</span>
                  </div>
                  <p>
                    {s.building} / {s.floor}
                  </p>
                  <div className="assistant-room-equipment">
                    {s.equip.map((e) => (
                      <span
                        className={
                          result.filters.equip.includes(e)
                            ? "required-equipment"
                            : ""
                        }
                        key={e}
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="assistant-room-footer">
                <div>
                  <span>
                    {s.date} · {s.start}–{s.end}
                  </span>
                  <small>
                    {s.rule === "approval" ? "需要审批" : "直接预订"}
                  </small>
                </div>
                <button
                  type="button"
                  className="button primary small"
                  disabled={room.canBook === false}
                  onClick={() => onChoose(s)}
                >
                  预订
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
