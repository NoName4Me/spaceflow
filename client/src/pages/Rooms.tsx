import { Fragment, useState, type ReactNode } from "react";
import { json } from "../api";
import { CheckAll, Field, Select, Tools } from "../components/ui";
import { roomStatusLabels, ruleLabels, splitEquipment, value } from "../model";
import { useResource, useWorkspace } from "../workspace";
import type { Access, Catalog, Directory, Room, Workspace } from "../types";
const accessKeys = [
  "viewDepartments",
  "bookDepartments",
  "viewUsers",
  "bookUsers",
  "denyViewUsers",
  "denyBookUsers",
] as const;
const accessNames = {
  viewDepartments: "可见部门",
  bookDepartments: "可订部门",
  viewUsers: "可见人员",
  bookUsers: "可订人员",
  denyViewUsers: "不可见人员",
  denyBookUsers: "不可订人员",
};
const ruleOptions: [string, string][] = Object.entries(ruleLabels),
  statusOptions: [string, string][] = Object.entries(roomStatusLabels);
function floorOptions(catalog: Catalog): [string, string][] {
  return catalog.floors.map((f) => [
    f.id,
    `${catalog.buildings.find((b) => b.id === f.building_id)?.name} / ${f.name}`,
  ]);
}
function RoomFields({
  room: r,
  data,
  catalog,
  directory,
  floor,
}: {
  room?: Room;
  data: Workspace;
  catalog: Catalog;
  directory: Directory;
  floor?: string;
}) {
  const a = r?.access || {},
    departments: [string, string][] = directory.departments.map((d) => [
      d.id,
      d.name,
    ]),
    users: [string, string][] = directory.users.map((u) => [
      u.id,
      `${u.name} (${u.username})`,
    ]);
  return (
    <>
      <Field
        label="名称"
        name="name"
        defaultValue={r?.name || ""}
        required
        maxLength={100}
      />
      <Field
        label="编号"
        name="code"
        defaultValue={r?.code || ""}
        required
        maxLength={100}
      />
      <Select
        label="所属楼层"
        name="floorId"
        options={floorOptions(catalog)}
        value={r?.floorId || floor}
      />
      <Field
        label="容量"
        name="capacity"
        type="number"
        defaultValue={r?.capacity || 6}
        min={1}
        max={1000}
        required
      />
      <Field
        label="面积（㎡）"
        name="area"
        type="number"
        defaultValue={r?.area || 0}
        min={0}
        max={100000}
        step="0.1"
        required
      />
      <Select
        label="布局"
        name="layoutTemplateId"
        options={data.layoutTemplates.map((t) => [t.id, t.name])}
        value={
          r?.layoutTemplateId ||
          data.layoutTemplates.find((t) => t.type === "董事会式")?.id
        }
      />
      <Select
        label="预订方式"
        name="rule"
        options={ruleOptions}
        value={r?.rule || "instant"}
      />
      <Select
        label="开放状态"
        name="status"
        options={statusOptions}
        value={r?.status || "enabled"}
      />
      <Field
        label="设施（逗号分隔）"
        name="equip"
        defaultValue={r?.equip.join("，") || ""}
      />
      <div className="field full-row">
        <label htmlFor="edit-desc">介绍</label>
        <textarea
          id="edit-desc"
          name="desc"
          maxLength={2000}
          defaultValue={r?.desc || ""}
        />
      </div>
      <label className="checkbox-row full-row">
        <input
          name="repeat"
          type="checkbox"
          defaultChecked={r?.repeat || false}
        />
        允许周期预订
      </label>
      <details className="full-row access-fields">
        <summary>可见与预订权限</summary>
        <label className="checkbox-row">
          <input
            type="checkbox"
            name="viewRestricted"
            defaultChecked={a.viewRestricted}
          />
          仅指定部门或人员可见
        </label>
        {(["viewDepartments", "viewUsers"] as const).map((k) => (
          <Select
            key={k}
            label={accessNames[k]}
            name={k}
            options={k.endsWith("Departments") ? departments : users}
            value={a[k] || []}
            multiple
          />
        ))}
        <label className="checkbox-row">
          <input
            type="checkbox"
            name="bookRestricted"
            defaultChecked={a.bookRestricted}
          />
          仅指定部门或人员可预订
        </label>
        {(
          [
            "bookDepartments",
            "bookUsers",
            "denyViewUsers",
            "denyBookUsers",
          ] as const
        ).map((k) => (
          <Select
            key={k}
            label={accessNames[k]}
            name={k}
            options={k.endsWith("Departments") ? departments : users}
            value={a[k] || []}
            multiple
          />
        ))}
      </details>
    </>
  );
}
type BulkKey =
  | "capacity"
  | "area"
  | "layoutTemplateId"
  | "equip"
  | "rule"
  | "status"
  | "repeat"
  | "floorId";
function BulkFields({
  first,
  data,
  catalog,
}: {
  first: Room;
  data: Workspace;
  catalog: Catalog;
}) {
  const [enabled, setEnabled] = useState<BulkKey[]>([]);
  const fields: [BulkKey, string, (disabled: boolean) => ReactNode][] = [
    [
      "capacity",
      "容量",
      (disabled) => (
        <Field
          label="新容量"
          name="capacity"
          defaultValue={first.capacity}
          type="number"
          min={1}
          max={1000}
          required
          disabled={disabled}
        />
      ),
    ],
    [
      "area",
      "面积",
      (disabled) => (
        <Field
          label="新面积（㎡）"
          name="area"
          defaultValue={first.area}
          type="number"
          min={0}
          max={100000}
          step="0.1"
          required
          disabled={disabled}
        />
      ),
    ],
    [
      "layoutTemplateId",
      "布局",
      (disabled) => (
        <Select
          label="新布局"
          name="layoutTemplateId"
          options={data.layoutTemplates.map((t) => [t.id, t.name])}
          value={first.layoutTemplateId}
          disabled={disabled}
        />
      ),
    ],
    [
      "equip",
      "设施",
      (disabled) => (
        <Field
          label="新设施（逗号分隔）"
          name="equip"
          defaultValue={first.equip.join("，")}
          disabled={disabled}
        />
      ),
    ],
    [
      "rule",
      "预订方式",
      (disabled) => (
        <Select
          label="新预订方式"
          name="rule"
          options={ruleOptions}
          value={first.rule}
          disabled={disabled}
        />
      ),
    ],
    [
      "status",
      "开放状态",
      (disabled) => (
        <Select
          label="新状态"
          name="status"
          options={statusOptions}
          value={first.status}
          disabled={disabled}
        />
      ),
    ],
    [
      "repeat",
      "周期预订",
      (disabled) => (
        <Select
          label="是否允许周期预订"
          name="repeat"
          options={[
            ["true", "允许"],
            ["false", "不允许"],
          ]}
          value={String(first.repeat)}
          disabled={disabled}
        />
      ),
    ],
    [
      "floorId",
      "所属楼层",
      (disabled) => (
        <Select
          label="新楼层"
          name="floorId"
          options={floorOptions(catalog)}
          value={first.floorId}
          disabled={disabled}
        />
      ),
    ],
  ];
  return (
    <>
      {fields.map(([key, label, input]) => (
        <div className="bulk-field full-row" key={key}>
          <label className="checkbox-row">
            <input
              type="checkbox"
              name={"apply-" + key}
              checked={enabled.includes(key)}
              onChange={(e) =>
                setEnabled(
                  e.target.checked
                    ? [...enabled, key]
                    : enabled.filter((k) => k !== key),
                )
              }
            />
            {label}
          </label>
          <div>{input(!enabled.includes(key))}</div>
        </div>
      ))}
    </>
  );
}
export function Rooms() {
  const { data, request, setDialog, refresh, run } = useWorkspace();
  const { result: catalog, loading: catalogLoading } = useResource<Catalog>(
    "/admin/locations",
    { buildings: [], floors: [] },
  );
  const { result: directory, loading: directoryLoading } =
    useResource<Directory>("/admin/directory", { users: [], departments: [] });
  const [building, setBuilding] = useState<string>(),
    [floor, setFloor] = useState<string>(),
    [selected, setSelected] = useState<string[]>([]);
  if (!data) return null;
  const rows = data.rooms.filter(
      (r) =>
        (!building ||
          catalog.floors.some(
            (f) => f.id === r.floorId && f.building_id === building,
          )) &&
        (!floor || r.floorId === floor),
    ),
    count = rows.filter((r) => selected.includes(r.id)).length;
  const location = (b?: string, f?: string) => {
    setBuilding(b);
    setFloor(f);
    setSelected([]);
  };
  const editLocation = (kind: "buildings" | "floors", id?: string) => {
    const isFloor = kind === "floors",
      entry = isFloor
        ? catalog.floors.find((f) => f.id === id)
        : catalog.buildings.find((b) => b.id === id),
      label = isFloor ? "楼层" : "楼栋";
    setDialog({
      title: (id ? "编辑" : "新增") + label,
      content: (
        <>
          <Field
            label={label + "名称"}
            name="name"
            defaultValue={entry?.name || ""}
            required
            maxLength={100}
          />
          {isFloor && (
            <Select
              label="所属楼栋"
              name="buildingId"
              options={catalog.buildings.map((b) => [b.id, b.name])}
              value={
                catalog.floors.find((f) => f.id === id)?.building_id || building
              }
            />
          )}
          <Field
            label="排序"
            name="sortOrder"
            type="number"
            defaultValue={entry?.sort_order || 0}
            min={-10000}
            max={10000}
            required
          />
          {id && (
            <button
              className="button"
              type="button"
              onClick={() =>
                void run(async () => {
                  await request(`/${kind}/${id}`, { method: "DELETE" });
                  setDialog(null);
                  location();
                  await refresh();
                })
              }
            >
              删除空{label}
            </button>
          )}
        </>
      ),
      save: async (f) => {
        await request(
          `/${kind}${id ? "/" + id : ""}`,
          json(
            {
              name: value(f, "name"),
              sortOrder: Number(f.get("sortOrder")),
              ...(isFloor ? { buildingId: value(f, "buildingId") } : {}),
            },
            id ? "PUT" : "POST",
          ),
        );
      },
    });
  };
  const editRoom = (room?: Room) =>
    setDialog({
      title: room ? "编辑会议室" : "新增会议室",
      content: (
        <RoomFields
          room={room}
          data={data}
          catalog={catalog}
          directory={directory}
          floor={floor}
        />
      ),
      save: async (f) => {
        const access: Access = {
          viewRestricted: f.has("viewRestricted"),
          bookRestricted: f.has("bookRestricted"),
        };
        for (const key of accessKeys) access[key] = f.getAll(key).map(String);
        await request(
          `/rooms${room ? "/" + room.id : ""}`,
          json(
            {
              name: value(f, "name"),
              code: value(f, "code"),
              floorId: value(f, "floorId"),
              capacity: Number(f.get("capacity")),
              area: Number(f.get("area")),
              type: data.layoutTemplates.find(
                (t) => t.id === f.get("layoutTemplateId"),
              )?.type,
              layoutTemplateId: value(f, "layoutTemplateId"),
              equip: splitEquipment(f.get("equip")),
              desc: value(f, "desc"),
              rule: value(f, "rule"),
              status: value(f, "status"),
              repeat: f.has("repeat"),
              access,
            },
            room ? "PUT" : "POST",
          ),
        );
      },
    });
  const bulk = () => {
    const ids = rows.filter((r) => selected.includes(r.id)).map((r) => r.id),
      first = rows.find((r) => selected.includes(r.id));
    if (!first) return;
    setDialog({
      title: `批量编辑 · ${ids.length} 间`,
      content: <BulkFields first={first} data={data} catalog={catalog} />,
      save: async (f) => {
        const patch: Record<string, unknown> = {};
        for (const key of [
          "capacity",
          "area",
          "layoutTemplateId",
          "equip",
          "rule",
          "status",
          "repeat",
          "floorId",
        ]) {
          if (!f.has("apply-" + key)) continue;
          const v = value(f, key);
          patch[key] = ["capacity", "area"].includes(key)
            ? Number(v)
            : key === "repeat"
              ? v === "true"
              : key === "equip"
                ? splitEquipment(v)
                : v;
        }
        if (!Object.keys(patch).length) throw Error("请选择要修改的属性");
        await request("/rooms/bulk", json({ roomIds: ids, patch }));
        setSelected([]);
      },
    });
  };
  return (
    <section className="page" aria-busy={catalogLoading || directoryLoading}>
      <Tools>
        <button
          className="button"
          id="newBuilding"
          disabled={catalogLoading}
          onClick={() => editLocation("buildings")}
        >
          ＋ 楼栋
        </button>
        <button
          className="button"
          id="newFloor"
          disabled={catalogLoading || !catalog.buildings.length}
          onClick={() => editLocation("floors")}
        >
          ＋ 楼层
        </button>
        <button
          className="button primary"
          id="newRoom"
          disabled={
            catalogLoading || directoryLoading || !catalog.floors.length
          }
          onClick={() => editRoom()}
        >
          ＋ 新增会议室
        </button>
      </Tools>
      <div className="catalog-layout">
        <aside className="panel location-tree">
          <button
            className={`tree-item ${!building ? "selected" : ""}`}
            data-location-all
            onClick={() => location()}
          >
            全部会议室
          </button>
          {catalog.buildings.map((b) => (
            <Fragment key={b.id}>
              <div className="tree-line">
                <button
                  className={`tree-item ${building === b.id && !floor ? "selected" : ""}`}
                  data-location-building={b.id}
                  onClick={() => location(b.id)}
                >
                  {b.name}
                </button>
                <button
                  className="icon-btn"
                  aria-label={"编辑" + b.name}
                  data-edit-building={b.id}
                  onClick={() => editLocation("buildings", b.id)}
                >
                  ⋯
                </button>
              </div>
              {catalog.floors
                .filter((f) => f.building_id === b.id)
                .map((f) => (
                  <div className="tree-line tree-floor" key={f.id}>
                    <button
                      className={`tree-item ${floor === f.id ? "selected" : ""}`}
                      data-location-floor={f.id}
                      onClick={() => location(b.id, f.id)}
                    >
                      {f.name}
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={"编辑" + b.name + f.name}
                      data-edit-floor={f.id}
                      onClick={() => editLocation("floors", f.id)}
                    >
                      ⋯
                    </button>
                  </div>
                ))}
            </Fragment>
          ))}
        </aside>
        <div className="panel managed-rooms">
          <div className="table-toolbar">
            <span>
              {count ? `已选 ${count} 间` : `${rows.length} 间会议室`}
            </span>
            <button
              className="button"
              id="bulkRooms"
              disabled={!count}
              onClick={bulk}
            >
              批量编辑
            </button>
          </div>
          <div className="table-scroll">
            <table className="room-management-table">
              <colgroup>
                {[5, 22, 8, 8, 13, 15, 12, 9, 8].map((width, i) => (
                  <col key={i} style={{ width: width + "%" }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th>
                    <CheckAll
                      checked={!!rows.length && count === rows.length}
                      mixed={count > 0 && count < rows.length}
                      onChange={(checked) =>
                        setSelected(checked ? rows.map((r) => r.id) : [])
                      }
                    />
                  </th>
                  {[
                    "会议室",
                    "容量",
                    "面积",
                    "布局",
                    "设施",
                    "预订方式",
                    "状态",
                  ].map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                  <th>
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr className="management-row" key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        data-select-room={r.id}
                        aria-label={"选择" + r.name}
                        checked={selected.includes(r.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, r.id]
                              : selected.filter((id) => id !== r.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <strong>{r.name}</strong>
                      <small>
                        {r.building} / {r.floor} · {r.code}
                      </small>
                    </td>
                    <td>{r.capacity} 人</td>
                    <td>{r.area} ㎡</td>
                    <td>
                      {data.layoutTemplates.find(
                        (t) => t.id === r.layoutTemplateId,
                      )?.name || r.type}
                    </td>
                    <td>{r.equip.join("、") || "—"}</td>
                    <td>{ruleLabels[r.rule]}</td>
                    <td>{roomStatusLabels[r.status]}</td>
                    <td>
                      <button
                        className="button small"
                        data-edit-room={r.id}
                        disabled={directoryLoading}
                        onClick={() => editRoom(r)}
                      >
                        编辑
                      </button>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={9} className="empty-box">
                      暂无会议室
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
