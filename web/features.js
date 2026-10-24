function renderLocationRooms() {
  const catalog = state.catalog || { buildings: [], floors: [] };
  const selectedRooms = state.rooms.filter(
    (r) =>
      (!state.locationBuilding ||
        catalog.floors.some(
          (f) => f.id === r.floorId && f.building_id === state.locationBuilding,
        )) &&
      (!state.locationFloor || r.floorId === state.locationFloor),
  );
  return `<section class="page">${pageHead("SPACES", "会议室管理", `${state.rooms.length} 间会议室`, `<button class="button" id="newBuilding">＋ 楼栋</button><button class="button" id="newFloor" ${!catalog.buildings.length ? "disabled" : ""}>＋ 楼层</button><button class="button primary" id="newRoom" ${!catalog.floors.length ? "disabled" : ""}>＋ 新增会议室</button>`)}<div class="catalog-layout"><aside class="panel location-tree"><button class="tree-item ${!state.locationBuilding ? "selected" : ""}" data-location-all>全部会议室</button>${catalog.buildings
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
    )}</aside><div class="panel management-list">${selectedRooms.map((r) => `<article class="management-row"><div><h3>${esc(r.name)}</h3><p>${esc(r.building)} / ${esc(r.floor)} · ${esc(r.code)} · ${r.capacity} 人</p><small>${{ enabled: "启用", disabled: "停用", hidden: "隐藏", maintenance: "维护" }[r.status]}</small></div><button class="button" data-edit-room="${r.id}">编辑档案与权限</button></article>`).join("") || '<div class="empty-box">该位置暂无会议室</div>'}</div></div></section>`;
}
function editLocation(kind, id) {
  const floor = kind === "floors",
    entry = (floor ? state.catalog.floors : state.catalog.buildings).find(
      (x) => x.id === id,
    ),
    label = floor ? "楼层" : "楼栋";
  showEditDialog(
    (id ? "编辑" : "新增") + label,
    uiField(
      label + "名称",
      "name",
      entry?.name || "",
      "text",
      'required maxlength="100"',
    ) +
      (floor
        ? uiSelect(
            "所属楼栋",
            "buildingId",
            state.catalog.buildings.map((b) => [b.id, b.name]),
            entry?.building_id || state.locationBuilding,
          )
        : "") +
      uiField(
        "排序",
        "sortOrder",
        entry?.sort_order || 0,
        "number",
        'required min="-10000" max="10000"',
      ) +
      (id
        ? `<button class="button" type="button" data-delete-location="${id}" data-location-kind="${kind}">删除空${label}</button>`
        : ""),
    async (f) => {
      await api("/" + kind + (id ? "/" + id : ""), {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
          name: f.get("name"),
          sortOrder: Number(f.get("sortOrder")),
          ...(floor ? { buildingId: f.get("buildingId") } : {}),
        }),
      });
    },
  );
}
function editBooking(id, patch = {}) {
  const b =
    state.bookings.find((b) => b.id === id) ||
    state.calendar?.bookings.find((b) => b.id === id);
  if (!b) return;
  const value = { ...b, ...patch };
  showEditDialog(
    "修改预订",
    uiField(
      "会议主题",
      "title",
      value.title,
      "text",
      'required maxlength="100"',
    ) +
      uiSelect(
        "会议室",
        "roomId",
        state.rooms
          .filter((r) => r.canBook !== false)
          .map((r) => [r.id, r.building + " / " + r.floor + " / " + r.name]),
        value.roomId,
      ) +
      uiField(
        "使用日期",
        "date",
        value.date,
        "date",
        'required min="' + TODAY + '"',
      ) +
      uiField("开始时间", "start", value.start, "time", "required") +
      uiField("结束时间", "end", value.end, "time", "required") +
      uiField(
        "联系人",
        "contact",
        value.contact,
        "text",
        'required maxlength="100"',
      ) +
      uiField(
        "联系方式",
        "phone",
        value.phone,
        "text",
        'required maxlength="100"',
      ) +
      (b.seriesId
        ? uiSelect(
            "修改范围",
            "scope",
            [
              ["single", "仅本次"],
              ["future", "本次及之后的有效预订"],
            ],
            "single",
          )
        : "") +
      `<label class="checkbox-row full-row"><input name="hidden" type="checkbox" ${b.hidden ? "checked" : ""}/>隐藏预订详情</label>`,
    async (f) => {
      await api("/bookings/" + id, {
        method: "PUT",
        body: JSON.stringify({
          revision: b.revision,
          title: f.get("title"),
          contact: f.get("contact"),
          phone: f.get("phone"),
          hidden: f.has("hidden"),
          roomId: f.get("roomId"),
          date: f.get("date"),
          start: f.get("start"),
          end: f.get("end"),
          scope: f.get("scope") || "single",
        }),
      });
    },
  );
}
function renderEnhancedSchedule() {
  const c = state.calendar;
  if (!c) return '<div class="empty-box">正在加载日程</div>';
  const week = state.scheduleView === "week";
  return `<section class="page">${pageHead("CALENDAR", "预订日程", `${c.total} 间会议室`, `<button class="button" data-calendar-step="-1" aria-label="上一${week ? "周" : "日"}">←</button><input class="button" aria-label="日程日期" id="schedule-date" type="date" value="${state.filters.date}"/><button class="button" data-calendar-step="1" aria-label="下一${week ? "周" : "日"}">→</button><select class="button" aria-label="日程视图" id="schedule-view"><option value="day" ${week ? "" : "selected"}>日视图</option><option value="week" ${week ? "selected" : ""}>周视图</option></select>`)}<div class="panel calendar-scroll"><div class="resource-calendar ${week ? "week" : ""}" style="--columns:${week ? 7 : 10}"><div class="resource-heading">会议室 / ${week ? "日期" : "时段"}</div>${(week ? c.dates : Array.from({ length: 10 }, (_, i) => String(i + 8).padStart(2, "0") + ":00")).map((d) => `<div class="resource-heading">${esc(d)}</div>`).join("")}${c.rooms
    .map(
      (r) =>
        `<div class="resource-room"><b>${esc(r.name)}</b><small>${esc(r.building)} / ${esc(r.floor)}</small></div>${(week
          ? c.dates
          : Array.from(
              { length: 10 },
              (_, i) => String(i + 8).padStart(2, "0") + ":00",
            )
        )
          .map((v) => {
            const date = week ? v : c.dates[0],
              start = week ? "09:00" : v,
              end = week
                ? "10:00"
                : String(Number(v.slice(0, 2)) + 1).padStart(2, "0") + ":00",
              events = c.bookings.filter(
                (b) =>
                  b.roomId === r.id &&
                  b.date === date &&
                  (week || isOverlap(start, end, b.start, b.end)),
              );
            return `<div class="resource-cell" data-drop-room="${r.id}" data-drop-date="${date}" data-drop-start="${start}">${events
              .map((b) => {
                const edit = b.owner === "me" || state.user.role === "admin";
                return `<button class="calendar-event ${b.status === "pending" ? "pending" : ""}" ${edit ? `draggable="true" data-drag-booking="${b.id}" data-edit-booking="${b.id}"` : `data-room="${r.id}"`}><span>${b.start}–${b.end}</span>${esc(b.title)}${b.status === "pending" ? " · 待审批" : ""}</button>`;
              })
              .join(
                "",
              )}<button class="calendar-add" ${r.canBook === false ? "disabled" : ""} data-calendar-book="${r.id}" data-date="${date}" data-start="${start}" aria-label="预订${esc(r.name)} ${date} ${start}">＋</button></div>`;
          })
          .join("")}`,
    )
    .join(
      "",
    )}</div></div><div class="pagination"><button class="button" data-calendar-page="${c.page - 1}" ${c.page <= 1 ? "disabled" : ""}>上一页</button><span>${c.page} / ${c.pages}</span><button class="button" data-calendar-page="${c.page + 1}" ${c.page >= c.pages ? "disabled" : ""}>下一页</button></div></section>`;
}
function patchShape(obj) {
  const [bw, bh] = SHAPES[obj.type],
    w = obj.w || bw,
    h = obj.h || bh;
  const el = document.querySelector(`#editorStage .shape[data-id="${obj.id}"]`);
  if (!el) return;
  const temp = document.createElementNS("http://www.w3.org/2000/svg", "g");
  temp.innerHTML = iconShape(obj, true);
  el.innerHTML = temp.firstChild.innerHTML;
  el.setAttribute(
    "transform",
    `translate(${obj.x} ${obj.y}) rotate(${obj.r || 0},${w / 2},${h / 2})`,
  );
}
async function handleFeatureClick(node) {
  if (node.id === "newBuilding" || node.dataset.editBuilding) {
    editLocation("buildings", node.dataset.editBuilding);
    return true;
  }
  if (node.id === "newFloor" || node.dataset.editFloor) {
    editLocation("floors", node.dataset.editFloor);
    return true;
  }
  if (
    node.hasAttribute("data-location-all") ||
    node.dataset.locationBuilding ||
    node.dataset.locationFloor
  ) {
    const f = state.catalog.floors.find(
      (f) => f.id === node.dataset.locationFloor,
    );
    state.locationFloor = f?.id;
    state.locationBuilding = f?.building_id || node.dataset.locationBuilding;
    render();
    return true;
  }
  if (node.dataset.deleteLocation) {
    await api(
      "/" + node.dataset.locationKind + "/" + node.dataset.deleteLocation,
      { method: "DELETE" },
    );
    closeModal();
    await loadPageData("rooms");
    render();
    return true;
  }
  if (node.dataset.editBooking) {
    if (Date.now() - (state.calendarDraggedAt || 0) < 350) return true;
    editBooking(node.dataset.editBooking);
    return true;
  }
  if (node.dataset.calendarBook) {
    state.filters.date = node.dataset.date;
    openBooking(node.dataset.calendarBook, node.dataset.start);
    return true;
  }
  if (node.dataset.calendarStep || node.dataset.calendarPage) {
    if (node.dataset.calendarStep) {
      const d = new Date(state.filters.date + "T00:00:00Z");
      d.setUTCDate(
        d.getUTCDate() +
          Number(node.dataset.calendarStep) *
            (state.scheduleView === "week" ? 7 : 1),
      );
      state.filters.date = d.toISOString().slice(0, 10);
    } else state.calendarPage = Number(node.dataset.calendarPage);
    await loadPageData("schedule");
    render();
    return true;
  }
  if (node.id === "importLayout") {
    $("#layoutFile").click();
    return true;
  }
  if (node.id === "saveTemplate") {
    showEditDialog(
      "保存为模板",
      uiField("模板名称", "name", "", "text", 'required maxlength="100"'),
      async (f) => {
        await api("/layout-templates", {
          method: "POST",
          body: JSON.stringify({
            name: f.get("name"),
            elements: state.layouts[state.selectedRoom],
          }),
        });
      },
    );
    return true;
  }
  if (node.id === "applyTemplate") {
    const template = state.templates.find(
      (t) => t.id === $("#layoutTemplate").value,
    );
    if (template) {
      saveUndo();
      state.layouts[state.selectedRoom] = structuredClone(template.layout);
      render();
    }
    return true;
  }
  if (node.id === "deleteTemplate") {
    const id = $("#layoutTemplate").value;
    if (id) {
      await api("/layout-templates/" + id, { method: "DELETE" });
      await loadPageData("editor");
      render();
    }
    return true;
  }
  if (node.id === "restoreLayout") {
    const v = $("#layoutVersion").value;
    if (v) {
      const old = await api("/rooms/" + state.selectedRoom + "/versions/" + v);
      saveUndo();
      state.layouts[state.selectedRoom] = old.layout;
      render();
      toast("已载入历史布局，保存后生效");
    }
    return true;
  }
  return false;
}
function bindFeatureEvents() {
  const email = $("#emailForm");
  if (email)
    email.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const f = new FormData(email);
        await api("/account/email", {
          method: "PUT",
          body: JSON.stringify({ email: f.get("email") || null }),
        });
        await refresh();
        toast("通知邮箱已保存");
      } catch (error) {
        toast(error.message);
      }
    };
  const file = $("#layoutFile");
  if (file)
    file.onchange = async () => {
      try {
        if (!file.files[0]) return;
        if (file.files[0].size > 256 * 1024) throw new Error("布局文件过大");
        const data = JSON.parse(await file.files[0].text());
        if (
          data.schemaVersion !== 1 ||
          data.coordinateSystem?.width !== 600 ||
          data.coordinateSystem?.height !== 390 ||
          !Array.isArray(data.elements) ||
          data.elements.length > 300
        )
          throw new Error("布局格式不正确");
        const seen = new Set();
        for (const e of data.elements) {
          if (
            typeof e.id !== "string" ||
            !/^[-\w]{1,80}$/.test(e.id) ||
            seen.has(e.id) ||
            !Object.hasOwn(SHAPES, e.type) ||
            !["x", "y", "r"].every(
              (k) => typeof e[k] === "number" && Number.isFinite(e[k]),
            ) ||
            e.x < 0 ||
            e.x > 600 ||
            e.y < 0 ||
            e.y > 390 ||
            e.r < -360 ||
            e.r > 360 ||
            ["w", "h"].some(
              (k) =>
                e[k] !== undefined &&
                (!Number.isFinite(e[k]) ||
                  e[k] < 8 ||
                  e[k] > (k === "w" ? 600 : 390)),
            )
          )
            throw new Error("布局元素不正确");
          seen.add(e.id);
        }
        saveUndo();
        state.layouts[state.selectedRoom] = data.elements.map(
          ({ id, type, x, y, r, w, h }) => ({
            id,
            type,
            x,
            y,
            r,
            ...(w !== undefined ? { w } : {}),
            ...(h !== undefined ? { h } : {}),
          }),
        );
        state.selection = null;
        render();
        toast("已导入布局，保存后生效");
      } catch (error) {
        toast(error.message);
      }
    };
  document.querySelectorAll("[data-drag-booking]").forEach((el) => {
    el.addEventListener("dragstart", (e) => {
      state.calendarDraggedAt = Date.now();
      e.dataTransfer.setData("text/plain", el.dataset.dragBooking);
      e.dataTransfer.effectAllowed = "move";
    });
    el.addEventListener("dragend", () => {
      state.calendarDraggedAt = Date.now();
    });
  });
  document.querySelectorAll("[data-drop-room]").forEach((el) => {
    el.addEventListener("dragover", (e) => {
      e.preventDefault();
    });
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain"),
        b = state.calendar.bookings.find((b) => b.id === id);
      if (!b) return;
      const duration =
          Number(b.end.slice(0, 2)) * 60 +
          Number(b.end.slice(3)) -
          Number(b.start.slice(0, 2)) * 60 -
          Number(b.start.slice(3)),
        start = state.scheduleView === "week" ? b.start : el.dataset.dropStart,
        minutes =
          Number(start.slice(0, 2)) * 60 + Number(start.slice(3)) + duration;
      if (minutes >= 1440) {
        toast("预订不能跨日");
        return;
      }
      editBooking(id, {
        roomId: el.dataset.dropRoom,
        date: el.dataset.dropDate,
        start,
        end:
          String(Math.floor(minutes / 60)).padStart(2, "0") +
          ":" +
          String(minutes % 60).padStart(2, "0"),
      });
    });
  });
}
