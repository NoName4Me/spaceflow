import { useId, type SVGProps } from "react";
import type { LayoutElement, ShapeType } from "../types";
export const shapes: Record<ShapeType, readonly [number, number]> = {
  table: [190, 88],
  desk: [130, 46],
  chair: [30, 32],
  screen: [90, 15],
  door: [55, 9],
  window: [85, 8],
  board: [82, 14],
};
function Shape({
  item: o,
  selected,
}: {
  item: LayoutElement;
  selected: boolean;
}) {
  const [bw, bh] = shapes[o.type],
    w = o.w || bw,
    h = o.h || bh;
  return (
    <g
      className="shape"
      data-id={o.id}
      transform={`translate(${o.x} ${o.y}) rotate(${o.r || 0},${w / 2},${h / 2})`}
      style={{ cursor: selected ? "move" : "default" }}
    >
      {o.type === "table" && (
        <>
          <rect
            width={w}
            height={h}
            rx="20"
            fill="var(--plan-table)"
            stroke="var(--plan-table-border)"
            strokeWidth="2"
          />
          <path
            d={`M20 ${h / 2} H${w - 20}`}
            stroke="var(--plan-table-border)"
            opacity=".5"
          />
        </>
      )}
      {o.type === "desk" && (
        <>
          <rect
            width={w}
            height={h}
            rx="5"
            fill="var(--plan-table)"
            stroke="var(--plan-table-border)"
            strokeWidth="1.4"
          />
          <path
            d={`M${w / 2} 1 V${h - 1}`}
            stroke="var(--plan-table-border)"
            strokeDasharray="3 3"
          />
        </>
      )}
      {o.type === "chair" && (
        <>
          <rect
            x="3"
            y="3"
            width={w - 6}
            height={h - 8}
            rx="7"
            fill="var(--plan-chair)"
            stroke="var(--plan-chair-border)"
            strokeWidth="1.3"
          />
          <path
            d={`M5 ${h - 5} h${w - 10}`}
            stroke="var(--plan-chair-border)"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </>
      )}
      {o.type === "screen" && (
        <>
          <rect width={w} height={h} rx="3" fill="var(--plan-screen)" />
          <path
            d={`M6 4 H${w - 6}`}
            stroke="var(--plan-screen-detail)"
            strokeWidth="2"
          />
        </>
      )}
      {o.type === "board" && (
        <rect
          width={w}
          height={h}
          rx="2"
          fill="var(--plan-board)"
          stroke="var(--plan-board-border)"
          strokeWidth="2"
        />
      )}
      {o.type === "window" && (
        <>
          <rect width={w} height={h} rx="2" fill="var(--plan-window)" />
          <path
            d={`M${w / 2} 0 V${h}`}
            stroke="var(--plan-window-detail)"
            strokeWidth="2"
          />
        </>
      )}
      {o.type === "door" && (
        <>
          <path d={`M0 0 H${w}`} stroke="var(--plan-door)" strokeWidth="4" />
          <path
            d={`M0 0 A${w} ${w} 0 0 1 ${w} ${w}`}
            fill="none"
            stroke="var(--plan-door)"
            strokeWidth="1.4"
            strokeDasharray="3 3"
          />
        </>
      )}
      {selected && (
        <>
          <rect
            x="-6"
            y="-6"
            width={w + 12}
            height={h + 12}
            rx="3"
            fill="none"
            stroke="var(--plan-selection)"
            strokeWidth="2"
            strokeDasharray="5 4"
          />
          <rect
            className="resize-handle"
            x={w - 5}
            y={h - 5}
            width="10"
            height="10"
            fill="var(--plan-selection)"
            style={{ cursor: "nwse-resize" }}
          />
        </>
      )}
    </g>
  );
}
export function Plan({
  elements,
  name = "布局",
  editing = false,
  selected,
  ...props
}: {
  elements: LayoutElement[];
  name?: string;
  editing?: boolean;
  selected?: string | null;
} & SVGProps<SVGSVGElement>) {
  const grid = "plan-grid-" + useId().replace(/:/g, "");
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 600 390"
      preserveAspectRatio="xMidYMid meet"
      className={`room-svg ${editing ? "editable" : ""}`}
      aria-label={name + "预览"}
      {...props}
    >
      <defs>
        <pattern id={grid} width="20" height="20" patternUnits="userSpaceOnUse">
          <path
            d="M20 0H0V20"
            fill="none"
            stroke="var(--plan-grid)"
            strokeWidth=".6"
          />
        </pattern>
      </defs>
      <rect width="600" height="390" fill="var(--plan-bg)" />
      {editing && <rect width="600" height="390" fill={`url(#${grid})`} />}
      <rect
        x="60"
        y="26"
        width="480"
        height="334"
        fill="var(--plan-floor)"
        stroke="var(--plan-wall)"
        strokeWidth="6"
      />
      {elements.map((o) => (
        <Shape key={o.id} item={o} selected={editing && selected === o.id} />
      ))}
    </svg>
  );
}
