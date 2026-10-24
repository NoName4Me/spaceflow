function previewElements(r) {
  const t =
    state.layoutTemplates?.find((t) => t.id === r.layoutTemplateId) ||
    state.layoutTemplates?.find((t) => t.type === r.type);
  return t?.layout || preset(r.type);
}
function editorElements() {
  return state.layoutEditor
    ? state.templateDraft
    : state.layouts[state.selectedRoom];
}
function setEditorElements(elements) {
  if (state.layoutEditor) state.templateDraft = elements;
  else state.layouts[state.selectedRoom] = elements;
}
function workspaceStatus(r) {
  return roomAvailable(r)
    ? "时段空闲"
    : r.status !== "enabled"
      ? "暂停预订"
      : r.canBook === false
        ? "不可预订"
        : "时段占用";
}
function workspaceFacilities(r) {
  return r.equip.map((e) => `<span class="amenity">${esc(e)}</span>`).join("");
}
function renderDiscovery() {
  const f = state.filters,
    buildings = [...new Set(state.rooms.map((r) => r.building))],
    floors = [
      ...new Set(
        state.rooms
          .filter((r) => f.building === "all" || r.building === f.building)
          .map((r) => r.floor),
      ),
    ];
  if (f.floor !== "all" && !floors.includes(f.floor)) f.floor = "all";
  const results = state.rooms.filter(
    (r) =>
      (f.building === "all" || r.building === f.building) &&
      (f.floor === "all" || r.floor === f.floor) &&
      r.capacity >= Number(f.capacity) &&
      f.equip.every((e) => r.equip.includes(e)),
  );
  const list = state.discoverView === "list";
  return `<section class="page"><div class="filter-surface"><div class="filter-grid"><div class="field"><label for="f-building">楼栋</label><select id="f-building"><option value="all">全部楼栋</option>${buildings.map((b) => `<option ${b === f.building ? "selected" : ""}>${esc(b)}</option>`).join("")}</select></div><div class="field"><label for="f-floor">楼层</label><select id="f-floor"><option value="all">全部楼层</option>${floors.map((x) => `<option ${x === f.floor ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div><div class="field"><label for="f-date">日期</label><input id="f-date" type="date" value="${f.date}"/></div><div class="field"><label for="f-start">开始时间</label><input id="f-start" type="time" value="${f.start}"/></div><div class="field"><label for="f-end">结束时间</label><input id="f-end" type="time" value="${f.end}"/></div><div class="field"><label for="f-capacity">人数</label><select id="f-capacity"><option value="0">不限</option>${[4, 6, 8, 12, 16, 20].map((n) => `<option value="${n}" ${Number(f.capacity) === n ? "selected" : ""}>${n} 人以上</option>`).join("")}</select></div></div><div class="filter-row2">${["投屏", "视频会议", "白板", "音响"].map((e) => `<button class="chip ${f.equip.includes(e) ? "on" : ""}" data-equip="${e}" aria-pressed="${f.equip.includes(e)}">${esc(e)}</button>`).join("")}<button class="linklike" id="clearFilters">重置</button></div></div><div class="results-toolbar"><span>${results.length} 间会议室</span><div class="view-switch" role="group" aria-label="展示方式"><button class="button small ${!list ? "active" : ""}" data-discover-view="grid" aria-pressed="${!list}">宫格</button><button class="button small ${list ? "active" : ""}" data-discover-view="list" aria-pressed="${list}">列表</button></div></div>${!results.length ? '<div class="empty-box">没有符合条件的会议室</div>' : list ? `<div class="discovery-list"><div class="discovery-list-head" aria-hidden="true"><span>会议室</span><span>位置</span><span>人数</span><span>布局</span><span>设施</span><span>状态</span></div>${results.map((r) => `<button class="discovery-list-row" data-room="${r.id}"><span class="list-room"><span class="mini-plan">${planSvg(r)}</span><span><strong>${esc(r.name)}</strong><small>${esc(r.code)}</small></span></span><span>${esc(r.building)} / ${esc(r.floor)}</span><span>${r.capacity} 人</span><span>${esc(r.type)}</span><span class="list-facilities">${workspaceFacilities(r)}</span><span class="room-status ${roomAvailable(r) ? "available" : "occupied"}">${workspaceStatus(r)}</span></button>`).join("")}</div>` : `<div class="rooms-grid">${results.map((r) => `<button class="room-card" data-room="${r.id}"><span class="room-art">${planSvg(r)}<span class="art-status ${roomAvailable(r) ? "" : "busy"}">● ${workspaceStatus(r)}</span></span><span class="room-info"><span class="room-topline"><strong>${esc(r.name)}</strong><span>${r.capacity} 人</span></span><span class="room-meta">${esc(r.building)} / ${esc(r.floor)} · ${esc(r.code)}</span><span class="room-layout-type">${esc(r.type)}</span><span class="amenities">${workspaceFacilities(r)}</span></span></button>`).join("")}</div>`}</section>`;
}
async function showRoomDetail(id) {
  const wasOpen = $("#roomDialog").open;
  try {
    await refresh();
    const r = room(id);
    if (!r) {
      toast("该会议室当前不可见");
      return;
    }
    state.selectedRoom = id;
    const bookings = state.bookings
      .filter(
        (b) =>
          b.roomId === id &&
          b.date === state.filters.date &&
          ["pending", "confirmed"].includes(b.status),
      )
      .sort((a, b) => a.start.localeCompare(b.start));
    $("#roomDetailTitle").textContent = r.name;
    $("#roomDetailBody").innerHTML =
      `<div class="room-detail-layout"><div class="detail-preview">${planSvg(r)}</div><div class="detail-facts"><p>${esc(r.building)} / ${esc(r.floor)} · ${esc(r.code)}</p><div class="fact-line"><strong>${r.capacity} 人</strong><span>${r.area} ㎡</span><span>${esc(r.type)}</span></div><div class="amenities">${workspaceFacilities(r)}</div>${r.desc ? `<p>${esc(r.desc)}</p>` : ""}<div class="detail-booking-rule">${{ instant: "直接预订", approval: "需要审批", admin: "仅管理员预订" }[r.rule]}</div><button class="button primary" data-book="${r.id}" ${r.canBook === false ? "disabled" : ""}>＋ 预订会议室</button></div></div><div class="detail-agenda"><input type="date" aria-label="查看占用日期" id="detailDate" value="${state.filters.date}"/><div class="time-list">${bookings.length ? bookings.map((b) => `<div class="time-row"><strong>${b.start}–${b.end}</strong><span>${esc(b.title)}</span><small>${b.status === "pending" ? "待审批" : ""}</small></div>`).join("") : '<p class="empty-agenda">暂无占用</p>'}</div></div>`;
    if (!wasOpen) $("#roomDialog").showModal();
  } catch (error) {
    toast(error.message);
  }
}
function filteredManagedRooms() {
  return state.rooms.filter(
    (r) =>
      (!state.locationBuilding ||
        state.catalog.floors.some(
          (f) => f.id === r.floorId && f.building_id === state.locationBuilding,
        )) &&
      (!state.locationFloor || r.floorId === state.locationFloor),
  );
}
function renderManagedRoomList() {
  const catalog = state.catalog || { buildings: [], floors: [] },
    rows = filteredManagedRooms(),
    selected = new Set(state.selectedRooms || []),
    count = rows.filter((r) => selected.has(r.id)).length;
  return `<section class="page"><div class="page-tools"><button class="button" id="newBuilding">＋ 楼栋</button><button class="button" id="newFloor" ${!catalog.buildings.length ? "disabled" : ""}>＋ 楼层</button><button class="button primary" id="newRoom" ${!catalog.floors.length ? "disabled" : ""}>＋ 新增会议室</button></div><div class="catalog-layout"><aside class="panel location-tree"><button class="tree-item ${!state.locationBuilding ? "selected" : ""}" data-location-all>全部会议室</button>${catalog.buildings
    .map(
      (b) =>
        `<div class="tree-line"><button class="tree-item ${state.locationBuilding === b.id && !state.locationFloor ? "selected" : ""}" data-location-building="${b.id}">${esc(b.name)}</button><button class="icon-btn" data-edit-building="${b.id}" aria-label="编辑${esc(b.name)}">⋯</button></div>${catalog.floors
          .filter((f) => f.building_id === b.id)
          .map(
            (f) =>
              `<div class="tree-line tree-floor"><button class="tree-item ${state.locationFloor === f.id ? "selected" : ""}" data-location-floor="${f.id}">${esc(f.name)}</button><button class="icon-btn" data-edit-floor="${f.id}" aria-label="编辑${esc(b.name)}${esc(f.name)}">⋯</button></div>`,
          )
          .join("")}`,
    )
    .join(
      "",
    )}</aside><div class="panel managed-rooms"><div class="table-toolbar"><span>${count ? `已选 ${count} 间` : `${rows.length} 间会议室`}</span><button class="button" id="bulkRooms" ${!count ? "disabled" : ""}>批量编辑</button></div><div class="table-scroll"><table class="room-management-table"><colgroup><col style="width:5%"/><col style="width:15%"/><col style="width:14%"/><col style="width:7%"/><col style="width:7%"/><col style="width:13%"/><col style="width:13%"/><col style="width:9%"/><col style="width:7%"/><col style="width:10%"/></colgroup><thead><tr><th><input type="checkbox" id="roomSelectAll" aria-label="选择当前列表全部会议室" ${rows.length && count === rows.length ? "checked" : ""}/></th><th>会议室</th><th>位置</th><th>容量</th><th>面积</th><th>布局</th><th>设施</th><th>预订方式</th><th>状态</th><th><span class="sr-only">操作</span></th></tr></thead><tbody>${rows.map((r) => `<tr class="management-row"><td><input type="checkbox" data-select-room="${r.id}" aria-label="选择${esc(r.name)}" ${selected.has(r.id) ? "checked" : ""}/></td><td><strong>${esc(r.name)}</strong><small>${esc(r.code)}</small></td><td>${esc(r.building)} / ${esc(r.floor)}</td><td>${r.capacity} 人</td><td>${r.area} ㎡</td><td>${esc(state.layoutTemplates.find((t) => t.id === r.layoutTemplateId)?.name || r.type)}</td><td>${r.equip.map(esc).join("、") || "—"}</td><td>${{ instant: "直接预订", approval: "审批", admin: "管理员" }[r.rule]}</td><td>${{ enabled: "启用", disabled: "停用", hidden: "隐藏", maintenance: "维护" }[r.status]}</td><td><button class="button small" data-edit-room="${r.id}">编辑</button></td></tr>`).join("") || '<tr><td colspan="10" class="empty-box">暂无会议室</td></tr>'}</tbody></table></div></div></div></section>`;
}
function editBulkRooms() {
  const ids = filteredManagedRooms()
    .filter((r) => (state.selectedRooms || []).includes(r.id))
    .map((r) => r.id);
  if (!ids.length) return;
  const first = room(ids[0]),
    fields = [
      [
        "capacity",
        "容量",
        uiField(
          "新容量",
          "capacity",
          first.capacity,
          "number",
          'min="1" max="1000" required',
        ),
      ],
      [
        "area",
        "面积",
        uiField(
          "新面积（㎡）",
          "area",
          first.area,
          "number",
          'min="0" max="100000" step="0.1" required',
        ),
      ],
      [
        "layoutTemplateId",
        "布局",
        uiSelect(
          "新布局",
          "layoutTemplateId",
          state.layoutTemplates.map((t) => [t.id, t.name]),
          first.layoutTemplateId,
        ),
      ],
      [
        "equip",
        "设施",
        uiField("新设施（逗号分隔）", "equip", first.equip.join("，")),
      ],
      [
        "rule",
        "预订方式",
        uiSelect(
          "新预订方式",
          "rule",
          [
            ["instant", "直接预订"],
            ["approval", "审批"],
            ["admin", "仅管理员"],
          ],
          first.rule,
        ),
      ],
      [
        "status",
        "开放状态",
        uiSelect(
          "新状态",
          "status",
          [
            ["enabled", "启用"],
            ["disabled", "停用"],
            ["hidden", "隐藏"],
            ["maintenance", "维护"],
          ],
          first.status,
        ),
      ],
      [
        "repeat",
        "周期预订",
        uiSelect(
          "是否允许周期预订",
          "repeat",
          [
            ["true", "允许"],
            ["false", "不允许"],
          ],
          String(first.repeat),
        ),
      ],
      [
        "floorId",
        "所属楼层",
        uiSelect(
          "新楼层",
          "floorId",
          state.catalog.floors.map((f) => [
            f.id,
            state.catalog.buildings.find((b) => b.id === f.building_id)?.name +
              " / " +
              f.name,
          ]),
          first.floorId,
        ),
      ],
    ];
  showEditDialog(
    `批量编辑 · ${ids.length} 间`,
    fields
      .map(
        ([key, label, input]) =>
          `<div class="bulk-field full-row"><label class="checkbox-row"><input type="checkbox" data-bulk-enable="${key}" name="apply-${key}"/>${label}</label><div data-bulk-input="${key}">${input}</div></div>`,
      )
      .join(""),
    async (f) => {
      const patch = {};
      for (const [key] of fields) {
        if (!f.has("apply-" + key)) continue;
        const v = f.get(key);
        patch[key] = ["capacity", "area"].includes(key)
          ? Number(v)
          : key === "repeat"
            ? v === "true"
            : key === "equip"
              ? String(v)
                  .split(/[,，]/)
                  .map((s) => s.trim())
                  .filter(Boolean)
              : v;
      }
      if (!Object.keys(patch).length) throw new Error("请选择要修改的属性");
      await api("/rooms/bulk", {
        method: "POST",
        body: JSON.stringify({ roomIds: ids, patch }),
      });
      state.selectedRooms = [];
    },
  );
  document
    .querySelectorAll("[data-bulk-input] input,[data-bulk-input] select")
    .forEach((input) => (input.disabled = true));
  document.querySelectorAll("[data-bulk-enable]").forEach(
    (check) =>
      (check.onchange = () => {
        document
          .querySelectorAll(
            `[data-bulk-input="${check.dataset.bulkEnable}"] input,[data-bulk-input="${check.dataset.bulkEnable}"] select`,
          )
          .forEach((input) => (input.disabled = !check.checked));
      }),
  );
}
function renderLayoutManagement() {
  const editing = state.layoutEditor;
  if (!editing)
    return `<section class="page"><div class="page-tools"><button class="button primary" id="newLayout">＋ 新增布局</button></div><div class="layout-library">${state.layoutTemplates
      .map((t) => {
        const r = {
            id: "library-" + t.id,
            name: t.name,
            type: t.type,
            preview: t.layout,
          },
          used = state.rooms.filter((r) => r.layoutTemplateId === t.id).length;
        return `<article class="layout-card"><button class="layout-card-main" data-edit-layout="${t.id}">${planSvg(r)}<strong>${esc(t.name)}</strong></button><div class="layout-card-footer"><small>${used} 间会议室</small><button class="linklike" data-copy-layout="${t.id}">复制</button><button class="linklike" data-delete-layout="${t.id}" ${used ? "disabled" : ""}>删除</button></div></article>`;
      })
      .join("")}</div></section>`;
  const o = getSelected(),
    fake = { id: "layout-editor", name: editing.name, type: editing.type };
  return `<section class="page"><div class="layout-edit-toolbar"><button class="button" id="layoutBack">← 返回</button><input class="smallinput" id="managedLayoutName" aria-label="布局名称" value="${esc(editing.name)}" placeholder="布局名称" maxlength="100"/><select class="smallinput" aria-label="布局类型" id="managedLayoutType">${["董事会式", "U 型", "教室式", "圆桌式", "洽谈式"].map((type) => `<option ${type === editing.type ? "selected" : ""}>${type}</option>`).join("")}</select><button class="button" id="undoBtn" ${state.undo.length ? "" : "disabled"}>撤销</button><button class="button primary" id="saveManagedLayout">保存布局</button></div><div class="editor-grid"><aside class="panel editor-side"><h2>组件</h2>${[
    ["table", "会议桌"],
    ["desk", "单排桌"],
    ["chair", "座椅"],
    ["screen", "屏幕"],
    ["board", "白板"],
  ]
    .map(
      ([type, label]) =>
        `<button class="palette-item" data-add="${type}">${label}<span>＋</span></button>`,
    )
    .join(
      "",
    )}</aside><div class="panel layout-canvas-panel"><div class="editor-stage" id="editorStage">${planSvg(fake, "edit")}</div></div><aside class="panel editor-side editor-props"><h2>属性</h2>${
    o
      ? `<div class="mini-fields">${[
          ["x", "X", o.x, 0, 600],
          ["y", "Y", o.y, 0, 390],
          ["r", "旋转", o.r || 0, -360, 360],
          ["w", "宽度", o.w || SHAPES[o.type][0], 8, 600],
          ["h", "高度", o.h || SHAPES[o.type][1], 8, 390],
        ]
          .map(
            ([key, label, value, min, max]) =>
              `<div><label for="prop-${key}">${label}</label><input class="smallinput" id="prop-${key}" type="number" min="${min}" max="${max}" value="${value}"/></div>`,
          )
          .join(
            "",
          )}</div><div class="row-actions"><button class="button small" id="rotateEl">旋转 90°</button><button class="button small" id="cloneEl">复制</button><button class="button small" id="deleteEl">删除</button></div>`
      : '<p class="property-hint">未选中组件</p>'
  }<label class="checkbox-row"><input type="checkbox" id="snapGrid" ${state.snap === false ? "" : "checked"}/>网格吸附</label><button class="button wide" id="importLayout">导入 JSON</button><input type="file" id="layoutFile" accept=".json,application/json" hidden/><button class="button wide" id="exportLayout">导出 JSON</button>${(state.templateVersions || []).length ? `<select class="smallinput" id="managedLayoutVersion" aria-label="布局历史版本">${state.templateVersions.map((v) => `<option value="${v.version}">版本 ${v.version}</option>`).join("")}</select><button class="button wide" id="restoreManagedLayout">载入历史版本</button>` : ""}</aside></div></section>`;
}
async function startLayout(id, copy = false) {
  const source = state.layoutTemplates.find((t) => t.id === id);
  state.layoutEditor = source
    ? {
        id: copy ? null : source.id,
        name: source.name + (copy ? "副本" : ""),
        type: source.type,
        version: copy ? null : source.version,
      }
    : { id: null, name: "", type: "董事会式", version: null };
  state.templateDraft = structuredClone(
    source?.layout ||
      state.layoutTemplates.find((t) => t.is_builtin && t.type === "董事会式")
        ?.layout ||
      [],
  );
  state.templateVersions =
    source && !copy ? await api("/layout-templates/" + id + "/versions") : [];
  state.selection = null;
  state.undo = [];
  render();
}
async function handleWorkspaceClick(node) {
  if (node.dataset.discoverView) {
    state.discoverView = node.dataset.discoverView;
    try {
      localStorage.setItem("spaceflow-view", state.discoverView);
    } catch {}
    render();
    return true;
  }
  if (node.dataset.book && $("#roomDialog").open) $("#roomDialog").close();
  if (node.id === "bulkRooms") {
    editBulkRooms();
    return true;
  }
  if (
    node.id === "newLayout" ||
    node.dataset.editLayout ||
    node.dataset.copyLayout
  ) {
    await startLayout(
      node.dataset.editLayout || node.dataset.copyLayout,
      !!node.dataset.copyLayout,
    );
    return true;
  }
  if (node.id === "layoutBack") {
    state.layoutEditor = null;
    state.selection = null;
    state.undo = [];
    render();
    return true;
  }
  if (node.id === "saveManagedLayout") {
    const t = state.layoutEditor,
      name = $("#managedLayoutName").value.trim();
    if (!name) {
      $("#managedLayoutName").focus();
      throw new Error("请填写布局名称");
    }
    const data = {
      name,
      type: $("#managedLayoutType").value,
      elements: editorElements(),
      ...(t.id ? { version: t.version } : {}),
    };
    node.disabled = true;
    try {
      const response = await api(
        "/layout-templates" + (t.id ? "/" + t.id : ""),
        { method: t.id ? "PUT" : "POST", body: JSON.stringify(data) },
      );
      const id = t.id || response.id;
      await refresh();
      await startLayout(id);
      toast("布局已保存");
    } finally {
      node.disabled = false;
    }
    return true;
  }
  if (node.dataset.deleteLayout) {
    await api("/layout-templates/" + node.dataset.deleteLayout, {
      method: "DELETE",
    });
    await refresh();
    render();
    return true;
  }
  if (node.id === "restoreManagedLayout") {
    const previous = await api(
      "/layout-templates/" +
        state.layoutEditor.id +
        "/versions/" +
        $("#managedLayoutVersion").value,
    );
    saveUndo();
    setEditorElements(previous.layout);
    state.layoutEditor.name = previous.name;
    state.layoutEditor.type = previous.type;
    state.selection = null;
    render();
    return true;
  }
  return false;
}
function bindWorkspace() {
  const selectAll = $("#roomSelectAll");
  if (selectAll) {
    const rows = filteredManagedRooms(),
      selected = new Set(state.selectedRooms || []);
    selectAll.indeterminate =
      rows.some((r) => selected.has(r.id)) &&
      !rows.every((r) => selected.has(r.id));
    selectAll.onchange = () => {
      state.selectedRooms = selectAll.checked ? rows.map((r) => r.id) : [];
      render();
    };
    document.querySelectorAll("[data-select-room]").forEach(
      (input) =>
        (input.onchange = () => {
          const ids = new Set(state.selectedRooms || []);
          input.checked
            ? ids.add(input.dataset.selectRoom)
            : ids.delete(input.dataset.selectRoom);
          state.selectedRooms = [...ids];
          render();
        }),
    );
  }
  if ($("#managedLayoutName"))
    $("#managedLayoutName").oninput = (e) =>
      (state.layoutEditor.name = e.target.value);
  if ($("#managedLayoutType"))
    $("#managedLayoutType").onchange = (e) =>
      (state.layoutEditor.type = e.target.value);
}
