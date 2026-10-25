import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { elementsSchema } from "../../../server/layout-schema";
import { json, message } from "../api";
import { Plan, shapes } from "../components/Plan";
import { Tools } from "../components/ui";
import { useResource, useWorkspace } from "../workspace";
import type {
  LayoutElement,
  LayoutTemplate,
  LayoutVersion,
  ShapeType,
} from "../types";
interface Draft {
  id?: string;
  name: string;
  type: string;
  version?: number;
  elements: LayoutElement[];
}
const types = ["董事会式", "U 型", "教室式", "圆桌式", "洽谈式"];
export function Layouts() {
  const { data, request, refresh, notify, run } = useWorkspace(),
    [draft, setDraft] = useState<Draft | null>(null);
  if (!data) return null;
  const start = (t?: LayoutTemplate, copy = false) =>
    setDraft({
      id: copy ? undefined : t?.id,
      name: t ? t.name + (copy ? "副本" : "") : "",
      type: t?.type || "董事会式",
      version: copy ? undefined : t?.version,
      elements: structuredClone(
        t?.layout ||
          data.layoutTemplates.find(
            (t) => t.is_builtin && t.type === "董事会式",
          )?.layout ||
          [],
      ),
    });
  return draft ? (
    <LayoutEditor
      key={(draft.id || "new") + "-" + (draft.version || 0)}
      initial={draft}
      back={() => setDraft(null)}
      saved={(next) => setDraft(next)}
    />
  ) : (
    <section className="page">
      <Tools>
        <button
          className="button primary"
          id="newLayout"
          onClick={() => start()}
        >
          ＋ 新增布局
        </button>
      </Tools>
      <div className="layout-library">
        {data.layoutTemplates.map((t) => {
          const used = data.rooms.filter(
            (r) => r.layoutTemplateId === t.id,
          ).length;
          return (
            <article className="layout-card" key={t.id}>
              <button
                className="layout-card-main"
                data-edit-layout={t.id}
                onClick={() => start(t)}
              >
                <Plan elements={t.layout} name={t.name} />
                <strong>{t.name}</strong>
              </button>
              <div className="layout-card-footer">
                <small>{used} 间会议室</small>
                <button className="linklike" onClick={() => start(t, true)}>
                  复制
                </button>
                <button
                  className="linklike"
                  disabled={!!used}
                  onClick={() =>
                    void run(async () => {
                      await request(`/layout-templates/${t.id}`, {
                        method: "DELETE",
                      });
                      await refresh();
                      notify("布局已删除");
                    })
                  }
                >
                  删除
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
function LayoutEditor({
  initial,
  back,
  saved,
}: {
  initial: Draft;
  back: () => void;
  saved: (draft: Draft) => void;
}) {
  const { request, refresh, notify } = useWorkspace();
  const [name, setName] = useState(initial.name),
    [type, setType] = useState(initial.type),
    [elements, setElements] = useState(initial.elements),
    [selection, setSelection] = useState<string | null>(null),
    [undo, setUndo] = useState<LayoutElement[][]>([]),
    [snap, setSnap] = useState(true),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState("");
  const { result: versions } = useResource<LayoutVersion[]>(
    initial.id ? `/layout-templates/${initial.id}/versions` : null,
    [],
  );
  const file = useRef<HTMLInputElement>(null),
    nameInput = useRef<HTMLInputElement>(null),
    stage = useRef<HTMLDivElement>(null);
  const selected = elements.find((o) => o.id === selection);
  const drag = useRef<{
    x: number;
    y: number;
    original: LayoutElement;
    before: LayoutElement[];
    resize: boolean;
    moved: boolean;
  } | null>(null);
  const history = useCallback(
    (before: LayoutElement[]) =>
      setUndo((stack) => [...stack.slice(-29), structuredClone(before)]),
    [],
  );
  const change = (next: LayoutElement[]) => {
    history(elements);
    setElements(next);
  };
  const undoLast = useCallback(() => {
    const previous = undo.at(-1);
    if (!previous) return;
    setElements(previous);
    setSelection(null);
    setUndo(undo.slice(0, -1));
  }, [undo]);
  const remove = useCallback(() => {
    if (selection) {
      history(elements);
      setElements(elements.filter((o) => o.id !== selection));
      setSelection(null);
    }
  }, [elements, history, selection]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoLast();
      } else if (selection && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        remove();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [selection, undoLast, remove]);
  const add = (type: ShapeType) => {
    const item: LayoutElement = {
      id: "e" + crypto.randomUUID(),
      type,
      x: 210,
      y: 160,
      r: 0,
    };
    change([...elements, item]);
    setSelection(item.id);
  };
  const point = (e: PointerEvent<SVGSVGElement>) => {
    const p = e.currentTarget.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(e.currentTarget.getScreenCTM()!.inverse());
  };
  const down = (e: PointerEvent<SVGSVGElement>) => {
    const target = e.target instanceof Element ? e.target : null,
      shape = target?.closest<SVGGElement>(".shape"),
      item = elements.find((o) => o.id === shape?.dataset.id);
    if (!item) {
      setSelection(null);
      return;
    }
    e.preventDefault();
    setSelection(item.id);
    const p = point(e);
    drag.current = {
      x: p.x,
      y: p.y,
      original: { ...item },
      before: structuredClone(elements),
      resize: !!target?.closest(".resize-handle"),
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = point(e);
    if (Math.hypot(p.x - d.x, p.y - d.y) < 2 && !d.moved) return;
    if (!d.moved) {
      history(d.before);
      d.moved = true;
    }
    const step = snap ? 10 : 1,
      round = (n: number) => Math.round(n / step) * step,
      o = d.original,
      updated = { ...o };
    if (d.resize) {
      const angle = (o.r * Math.PI) / 180,
        dx = p.x - d.x,
        dy = p.y - d.y;
      updated.w = Math.max(
        8,
        Math.min(
          480,
          round(
            (o.w || shapes[o.type][0]) +
              dx * Math.cos(angle) +
              dy * Math.sin(angle),
          ),
        ),
      );
      updated.h = Math.max(
        8,
        Math.min(
          330,
          round(
            (o.h || shapes[o.type][1]) -
              dx * Math.sin(angle) +
              dy * Math.cos(angle),
          ),
        ),
      );
    } else {
      updated.x = Math.max(
        60,
        Math.min(540 - (o.w || shapes[o.type][0]), round(o.x + p.x - d.x)),
      );
      updated.y = Math.max(
        26,
        Math.min(360 - (o.h || shapes[o.type][1]), round(o.y + p.y - d.y)),
      );
    }
    setElements((current) =>
      current.map((item) => (item.id === o.id ? updated : item)),
    );
  };
  const finish = (e: PointerEvent<SVGSVGElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const updateProperty = (key: "x" | "y" | "r" | "w" | "h", raw: string) => {
    if (!selected) return;
    const n = Number(raw) || 0,
      min = key === "r" ? -360 : ["w", "h"].includes(key) ? 8 : 0,
      max = key === "r" ? 360 : ["x", "w"].includes(key) ? 600 : 390;
    change(
      elements.map((o) =>
        o.id === selection
          ? { ...o, [key]: Math.max(min, Math.min(max, n)) }
          : o,
      ),
    );
  };
  async function save() {
    if (busy) return;
    if (!name.trim()) {
      nameInput.current?.focus();
      notify("请填写布局名称");
      return;
    }
    setBusy(true);
    try {
      const result = await request<{ id: string }>(
        `/layout-templates${initial.id ? "/" + initial.id : ""}`,
        json(
          {
            name: name.trim(),
            type,
            elements,
            ...(initial.id ? { version: initial.version } : {}),
          },
          initial.id ? "PUT" : "POST",
        ),
      );
      const data = await refresh(),
        t = data.layoutTemplates.find(
          (t) => t.id === (initial.id || result.id),
        );
      if (t)
        saved({
          id: t.id,
          name: t.name,
          type: t.type,
          version: t.version,
          elements: structuredClone(t.layout),
        });
      notify("布局已保存");
    } catch (error) {
      notify(message(error));
    } finally {
      setBusy(false);
    }
  }
  const properties: [
    "x" | "y" | "r" | "w" | "h",
    string,
    number,
    number,
    number,
  ][] = selected
    ? [
        ["x", "X", selected.x, 0, 600],
        ["y", "Y", selected.y, 0, 390],
        ["r", "旋转", selected.r, -360, 360],
        ["w", "宽度", selected.w || shapes[selected.type][0], 8, 600],
        ["h", "高度", selected.h || shapes[selected.type][1], 8, 390],
      ]
    : [];
  return (
    <section className="page">
      <div className="layout-edit-toolbar">
        <button className="button" id="layoutBack" onClick={back}>
          ← 返回
        </button>
        <input
          className="smallinput"
          ref={nameInput}
          id="managedLayoutName"
          aria-label="布局名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="布局名称"
          maxLength={100}
        />
        <select
          className="smallinput"
          aria-label="布局类型"
          id="managedLayoutType"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {types.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button
          className="button"
          id="undoBtn"
          disabled={!undo.length}
          onClick={undoLast}
        >
          撤销
        </button>
        <button
          className="button primary"
          id="saveManagedLayout"
          disabled={busy}
          onClick={() => void save()}
        >
          保存布局
        </button>
      </div>
      <div className="editor-grid">
        <aside className="panel editor-side">
          <h2>组件</h2>
          {(
            [
              ["table", "会议桌"],
              ["desk", "单排桌"],
              ["chair", "座椅"],
              ["screen", "屏幕"],
              ["board", "白板"],
            ] as const
          ).map(([type, label]) => (
            <button
              className="palette-item"
              key={type}
              data-add={type}
              onClick={() => add(type)}
            >
              {label}
              <span>＋</span>
            </button>
          ))}
        </aside>
        <div className="panel layout-canvas-panel">
          <div className="editor-stage" id="editorStage" ref={stage}>
            <Plan
              name={name}
              elements={elements}
              editing
              selected={selection}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={finish}
              onPointerCancel={finish}
            />
          </div>
        </div>
        <aside className="panel editor-side editor-props">
          <h2>属性</h2>
          {selected ? (
            <>
              <div className="mini-fields">
                {properties.map(([key, label, n, min, max]) => (
                  <div key={selected.id + key}>
                    <label htmlFor={"prop-" + key}>{label}</label>
                    <PropertyInput
                      id={"prop-" + key}
                      value={n}
                      min={min}
                      max={max}
                      commit={(raw) => updateProperty(key, raw)}
                    />
                  </div>
                ))}
              </div>
              <div className="row-actions">
                <button
                  className="button small"
                  id="rotateEl"
                  onClick={() =>
                    change(
                      elements.map((o) =>
                        o.id === selection ? { ...o, r: (o.r + 90) % 360 } : o,
                      ),
                    )
                  }
                >
                  旋转 90°
                </button>
                <button
                  className="button small"
                  id="cloneEl"
                  onClick={() => {
                    const copy = {
                      ...selected,
                      id: "e" + crypto.randomUUID(),
                      x: Math.min(550, selected.x + 24),
                      y: Math.min(350, selected.y + 24),
                    };
                    change([...elements, copy]);
                    setSelection(copy.id);
                  }}
                >
                  复制
                </button>
                <button className="button small" id="deleteEl" onClick={remove}>
                  删除
                </button>
              </div>
            </>
          ) : (
            <p className="property-hint">未选中组件</p>
          )}
          <label className="checkbox-row">
            <input
              type="checkbox"
              id="snapGrid"
              checked={snap}
              onChange={(e) => setSnap(e.target.checked)}
            />
            网格吸附
          </label>
          <button
            className="button wide"
            id="importLayout"
            onClick={() => file.current?.click()}
          >
            导入 JSON
          </button>
          <input
            ref={file}
            type="file"
            id="layoutFile"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const input = e.currentTarget,
                chosen = input.files?.[0];
              if (!chosen) return;
              try {
                if (chosen.size > 256 * 1024) throw Error("布局文件过大");
                const data: unknown = JSON.parse(await chosen.text());
                if (
                  !data ||
                  typeof data !== "object" ||
                  !("schemaVersion" in data) ||
                  data.schemaVersion !== 1 ||
                  !("coordinateSystem" in data) ||
                  !data.coordinateSystem ||
                  typeof data.coordinateSystem !== "object" ||
                  !("width" in data.coordinateSystem) ||
                  data.coordinateSystem.width !== 600 ||
                  !("height" in data.coordinateSystem) ||
                  data.coordinateSystem.height !== 390 ||
                  !("elements" in data)
                )
                  throw Error("布局格式不正确");
                const result = elementsSchema.safeParse(data.elements);
                if (!result.success) throw Error("布局元素不正确");
                change(result.data);
                setSelection(null);
                notify("已导入布局，保存后生效");
              } catch (error) {
                notify(message(error));
              } finally {
                input.value = "";
              }
            }}
          />
          <button
            className="button wide"
            id="exportLayout"
            onClick={() => {
              const url = URL.createObjectURL(
                  new Blob(
                    [
                      JSON.stringify(
                        {
                          schemaVersion: 1,
                          coordinateSystem: { width: 600, height: 390 },
                          elements,
                        },
                        null,
                        2,
                      ),
                    ],
                    { type: "application/json" },
                  ),
                ),
                a = document.createElement("a");
              a.href = url;
              a.download = "spaceflow-layout.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 0);
            }}
          >
            导出 JSON
          </button>
          {versions.length > 0 && (
            <>
              <select
                className="smallinput"
                id="managedLayoutVersion"
                aria-label="布局历史版本"
                value={version || String(versions[0].version)}
                onChange={(e) => setVersion(e.target.value)}
              >
                {versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    版本 {v.version}
                  </option>
                ))}
              </select>
              <button
                className="button wide"
                id="restoreManagedLayout"
                onClick={async () => {
                  try {
                    const previous = await request<LayoutTemplate>(
                      `/layout-templates/${initial.id}/versions/${version || versions[0].version}`,
                    );
                    change(previous.layout);
                    setName(previous.name);
                    setType(previous.type);
                    setSelection(null);
                  } catch (error) {
                    notify(message(error));
                  }
                }}
              >
                载入历史版本
              </button>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

function PropertyInput({
  id,
  value,
  min,
  max,
  commit,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  commit: (value: string) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      className="smallinput"
      id={id}
      type="number"
      min={min}
      max={max}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw !== "" && Number.isFinite(Number(raw))) commit(raw);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}
