/* Spaceflow workspace. */
"use strict";
const TODAY = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();
const $ = (q) => document.querySelector(q);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const ICONS = {
  table: "会议桌",
  desk: "单排会议桌",
  chair: "椅子",
  screen: "屏幕",
  door: "门",
  window: "窗户",
  board: "白板",
};
const SHAPES = {
  table: [190, 88],
  desk: [130, 46],
  chair: [30, 32],
  screen: [90, 15],
  door: [55, 9],
  window: [85, 8],
  board: [82, 14],
};
function preset(type) {
  let a = [
    { id: "door1", type: "door", x: 84, y: 300, r: 0 },
    { id: "win1", type: "window", x: 365, y: 56, r: 0 },
    { id: "screen1", type: "screen", x: 218, y: 44, r: 0 },
  ];
  const add = (t, x, y, r = 0) =>
    a.push({ id: Math.random().toString(36).slice(2, 9), type: t, x, y, r });
  if (type === "教室式") {
    for (let k = 0; k < 3; k++) {
      add("desk", 110, 122 + k * 68);
      add("desk", 285, 122 + k * 68);
    }
  } else if (type === "U 型") {
    add("desk", 140, 105);
    add("desk", 305, 105);
    add("desk", 115, 203, 90);
    add("desk", 328, 203, 90);
  } else if (type === "圆桌式" || type === "洽谈式") {
    add("table", 180, 140);
    for (let i = 0; i < 6; i++)
      add("chair", 172 + (i % 3) * 55, 110 + Math.floor(i / 3) * 128);
  } else {
    add("table", 180, 139);
    for (let i = 0; i < 5; i++) {
      add("chair", 180 + i * 32, 95);
      add("chair", 180 + i * 32, 248);
    }
    add("chair", 140, 167, 90);
    add("chair", 386, 167, 90);
  }
  a.push({ id: "board1", type: "board", x: 74, y: 70, r: 90 });
  return a;
}
const state = {
  page: "explore",
  selectedRoom: "r1",
  filters: {
    building: "all",
    floor: "all",
    date: TODAY,
    start: "10:00",
    end: "11:00",
    capacity: 0,
    equip: [],
  },
  rooms: [],
  bookings: [],
  layouts: {},
  selection: null,
  undo: [],
  user: null,
};
async function api(path, options = {}) {
  const res = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await res.json();
  if (!res.ok) {
    if (res.status === 401 && path !== "/login") showLogin();
    throw Object.assign(new Error(body.message || "请求失败"), {
      conflicts: body.conflicts,
    });
  }
  return body;
}
async function refresh() {
  const data = await api("/state");
  Object.assign(state, data);
  if (
    state.filters.building !== "all" &&
    !state.rooms.some((r) => r.building === state.filters.building)
  )
    state.filters.building = "all";
  if (!room(state.selectedRoom)) state.selectedRoom = state.rooms[0]?.id;
  document
    .querySelectorAll(".admin-only")
    .forEach((n) => (n.hidden = state.user.role !== "admin"));
  $("#notificationButton").textContent = state.unread
    ? `通知 (${state.unread})`
    : "通知";
  $("#userName").textContent = state.user.name;
  $("#userRole").textContent =
    state.user.role === "admin" ? "空间管理员" : "员工";
}
async function persist() {
  const r = room(state.selectedRoom);
  await api("/rooms/" + r.id + "/layout", {
    method: "PUT",
    body: JSON.stringify({ version: r.version, elements: state.layouts[r.id] }),
  });
  await refresh();
}
function room(id) {
  return state.rooms.find((r) => r.id === id);
}
function isOverlap(a, b, c, d) {
  return a < d && c < b;
}
function conflicts(roomId, date, start, end, except) {
  return state.bookings.filter(
    (b) =>
      b.roomId === roomId &&
      b.date === date &&
      b.id !== except &&
      ["confirmed", "pending"].includes(b.status) &&
      isOverlap(start, end, b.start, b.end),
  );
}
function roomAvailable(r) {
  const f = state.filters;
  return (
    r.canBook !== false &&
    r.status === "enabled" &&
    !(r.rule === "admin" && state.user.role !== "admin") &&
    f.start < f.end &&
    conflicts(r.id, f.date, f.start, f.end).length === 0
  );
}
function dateHuman(d) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}
function toast(s) {
  const el = $("#toast");
  el.textContent = s;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2800);
}
const label = (s) => `<span class="eyebrow">${s}</span>`;
function pageHead(kicker, title, sub, tools = "") {
  return tools ? `<div class="page-tools">${tools}</div>` : "";
}
function iconShape(o, selected = false) {
  const [bw, bh] = SHAPES[o.type] || [40, 30],
    w = o.w || bw,
    h = o.h || bh,
    x = o.x,
    y = o.y,
    r = o.r || 0;
  let shape = "";
  if (o.type === "table") {
    shape = `<rect width="${w}" height="${h}" rx="20" fill="#b3c6b5" stroke="#8cac97" stroke-width="2"/><path d="M20 ${h / 2} H${w - 20}" stroke="#96b29f" stroke-width="1" opacity=".5"/>`;
  }
  if (o.type === "desk") {
    shape = `<rect width="${w}" height="${h}" rx="5" fill="#b2c6b6" stroke="#8eae97" stroke-width="1.4"/><path d="M${w / 2} 1 V${h - 1}" stroke="#9db6a4" stroke-dasharray="3 3"/>`;
  }
  if (o.type === "chair") {
    shape = `<rect x="3" y="3" width="${w - 6}" height="${h - 8}" rx="7" fill="#d6dfcf" stroke="#9bb5a3" stroke-width="1.3"/><path d="M5 ${h - 5} h${w - 10}" stroke="#8caa96" stroke-width="5" stroke-linecap="round"/>`;
  }
  if (o.type === "screen") {
    shape = `<rect width="${w}" height="${h}" rx="3" fill="#253d37"/><path d="M6 4 H${w - 6}" stroke="#7da898" stroke-width="2"/>`;
  }
  if (o.type === "board") {
    shape = `<rect width="${w}" height="${h}" rx="2" fill="#e3e9dd" stroke="#a2b2a3" stroke-width="2"/>`;
  }
  if (o.type === "window") {
    shape = `<rect width="${w}" height="${h}" fill="#95c8c4" rx="2"/><path d="M${w / 2} 0 V${h}" stroke="#e3f3ee" stroke-width="2"/>`;
  }
  if (o.type === "door") {
    shape = `<path d="M0 0 H${w}" stroke="#a6a793" stroke-width="4"/><path d="M0 0 A${w} ${w} 0 0 1 ${w} ${w}" fill="none" stroke="#a6a793" stroke-width="1.4" stroke-dasharray="3 3"/>`;
  }
  return `<g class="shape" data-id="${esc(o.id)}" transform="translate(${x} ${y}) rotate(${r},${w / 2},${h / 2})" style="cursor:${selected ? "move" : "default"}">${shape}${selected ? `<rect x="-6" y="-6" width="${w + 12}" height="${h + 12}" rx="3" fill="none" stroke="#267b5b" stroke-width="2" stroke-dasharray="5 4"/><rect class="resize-handle" x="${w - 5}" y="${h - 5}" width="10" height="10" fill="#267b5b" style="cursor:nwse-resize"/>` : ""}</g>`;
}
function planSvg(r, mode = "preview") {
  const objects =
    mode === "edit" ? editorElements() : r.preview || previewElements(r);
  planSvg.serial = (planSvg.serial || 0) + 1;
  const grid = "plan-grid-" + planSvg.serial;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 390" preserveAspectRatio="xMidYMid meet" class="room-svg ${mode === "edit" ? "editable" : ""}" aria-label="${esc(r.name || "布局")}预览"><defs><pattern id="${grid}" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#dce7db" stroke-width=".6"/></pattern></defs><rect width="600" height="390" fill="#f4f7f1"/>${mode === "edit" ? `<rect width="600" height="390" fill="url(#${grid})"/>` : ""}<rect x="60" y="26" width="480" height="334" fill="#fdfefa" stroke="#b8cab8" stroke-width="6"/>${objects.map((o) => iconShape(o, mode === "edit" && state.selection === o.id)).join("")}</svg>`;
}
function renderMine() {
  const bs = state.bookings
    .filter((b) => b.owner === "me")
    .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
  return `<section class="page">${pageHead("MY BOOKINGS", "我的预订", "查看自己提交的预订申请、已确认会议及取消记录。", `<button class="button primary" data-action="back-explore">＋ 创建新预订</button>`)}<div class="panel"><div class="panel-title"><h2>预订记录 (${bs.length})</h2></div><div class="booking-list">${bs.length ? bs.map((b) => `<div class="booking-item"><div><h3><span class="booking-badge ${b.status === "pending" ? "pending" : b.status === "cancelled" ? "cancelled" : ""}">${{ confirmed: "已确认", pending: "待审批", cancelled: "已取消", rejected: "已拒绝", expired: "已过期" }[b.status]}</span>${esc(b.title)}</h3><p>${esc(room(b.roomId)?.name || b.roomName)}会议室 · ${b.date} · ${b.start}–${b.end}${b.hidden && b.owner !== "me" && state.user.role !== "admin" ? " · 联系方式已隐藏" : ""}</p></div><div>${["pending", "confirmed"].includes(b.status) ? `<button class="button small" data-edit-booking="${b.id}">修改</button> <button class="button small" data-cancel="${b.id}">${b.seriesId ? "取消本次" : "取消预订"}</button>${b.seriesId ? `<button class="button small" data-series="${b.seriesId}" data-series-action="cancel">取消所有后续</button>` : ""}` : ""}</div></div>`).join("") : '<div class="empty-box">暂无预订</div>'}</div></div></section>`;
}
function renderSettings() {
  return `<section class="page">${pageHead("ROOM POLICIES", "预订规则", "按会议室配置预订方式和开放状态。")}<div class="rules-grid">${state.rooms
    .map(
      (r) =>
        `<article class="rule-card"><div class="rule-head"><b>${esc(r.name)}会议室</b><span>${esc(r.code)}</span></div><div class="field"><label for="rule-${r.id}">预订方式</label><select id="rule-${r.id}" data-rule="${r.id}">${[
          ["instant", "直接预订"],
          ["approval", "管理员审批"],
          ["admin", "仅管理员预订"],
        ]
          .map(
            ([v, t]) =>
              `<option value="${v}" ${r.rule === v ? "selected" : ""}>${t}</option>`,
          )
          .join(
            "",
          )}</select></div><div class="field"><label for="status-${r.id}">开放状态</label><select id="status-${r.id}" data-status="${r.id}">${[
          ["enabled", "启用"],
          ["disabled", "停用"],
          ["hidden", "隐藏"],
          ["maintenance", "维护"],
        ]
          .map(
            ([v, t]) =>
              `<option value="${v}" ${r.status === v ? "selected" : ""}>${t}</option>`,
          )
          .join("")}</select></div></article>`,
    )
    .join("")}</div></section>`;
}
function renderApprovals() {
  const bs = state.bookings.filter((b) => b.status === "pending");
  return `<section class="page">${pageHead("APPROVALS", "预订审批", `${bs.length} 条待处理申请`)}<div class="panel booking-list">${bs.map((b) => `<div class="booking-item"><div><h3>${esc(b.title)}</h3><p>${esc(room(b.roomId)?.name || b.roomName)} · ${b.date} ${b.start}–${b.end} · ${esc(b.contact)}</p></div><div><button class="button" data-decision="reject" data-id="${b.id}">拒绝</button> <button class="button primary" data-decision="approve" data-id="${b.id}">通过</button>${b.seriesId ? ` <button class="button small" data-series="${b.seriesId}" data-series-action="approve">通过后续</button> <button class="button small" data-series="${b.seriesId}" data-series-action="reject">拒绝后续</button>` : ""}</div></div>`).join("") || '<div class="empty-box">暂无待审批申请</div>'}</div></section>`;
}
function render() {
  const pages = {
    explore: renderDiscovery,
    detail: renderDiscovery,
    schedule: renderEnhancedSchedule,
    mine: renderMine,
    editor: renderLayoutManagement,
    settings: renderSettings,
    approvals: renderApprovals,
    rooms: renderManagedRoomList,
    users: renderUsers,
    account: renderAccount,
    audit: renderAudit,
    notifications: renderNotifications,
    reservations: renderAdminBookings,
  };
  $("#content").innerHTML =
    !state.rooms.length && ["detail"].includes(state.page)
      ? '<div class="empty-box">暂无可用会议室</div>'
      : (pages[state.page] || renderDiscovery)();
  const texts = {
    explore: "空间发现",
    detail: "会议室详情",
    schedule: "预订日程",
    mine: "我的预订",
    editor: "布局管理",
    settings: "预订规则",
    approvals: "预订审批",
    rooms: "会议室管理",
    users: "账号与部门",
    account: "账号设置",
    audit: "操作记录",
    notifications: "通知",
    reservations: "预订管理",
  };
  $("#crumb").textContent = texts[state.page];
  document
    .querySelectorAll("[data-page]")
    .forEach((x) =>
      x.classList.toggle(
        "active",
        x.dataset.page === state.page ||
          (state.page === "detail" && x.dataset.page === "explore"),
      ),
    );
  document.title = `${texts[state.page]} · 间序 Spaceflow`;
  document.querySelectorAll(".field").forEach((field) => {
    const label = field.querySelector("label"),
      input = field.querySelector("input,select");
    if (label && input?.id) label.htmlFor = input.id;
  });
  if (state.page === "editor") bindCanvas();
  document.querySelectorAll("label:not([for])").forEach((label) => {
    const input =
      label.querySelector("input,select,textarea") ||
      label.parentElement.querySelector("input,select,textarea");
    if (input?.id) label.htmlFor = input.id;
  });
  bindManagementForms();
  bindFeatureEvents();
  bindWorkspace();
}
async function navigate(p) {
  try {
    await loadPageData(p);
  } catch (error) {
    toast(error.message);
    return;
  }
  state.page = p;
  state.selection = null;
  state.undo = [];
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function addElement(type) {
  const arr = editorElements();
  saveUndo();
  const item = {
    id: "e" + Math.random().toString(36).slice(2, 8),
    type,
    x: 190 + Math.floor(Math.random() * 65),
    y: 150 + Math.floor(Math.random() * 50),
    r: 0,
  };
  arr.push(item);
  state.selection = item.id;
  render();
}
function saveUndo() {
  state.undo.push(JSON.stringify(editorElements()));
  if (state.undo.length > 30) state.undo.shift();
}
function getSelected() {
  return editorElements()?.find((o) => o.id === state.selection);
}
function bindCanvas() {
  const svg = $("#editorStage svg");
  if (!svg) return;
  let drag = null;
  const point = (e) => {
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  };
  svg.addEventListener("pointerdown", (e) => {
    const shape = e.target.closest(".shape");
    if (!shape) {
      state.selection = null;
      render();
      return;
    }
    const o = editorElements().find((o) => o.id === shape.dataset.id);
    if (!o) return;
    state.selection = o.id;
    const p = point(e);
    drag = {
      x: p.x,
      y: p.y,
      original: { ...o },
      resize: !!e.target.closest(".resize-handle"),
      moved: false,
    };
    svg.setPointerCapture(e.pointerId);
    patchShape(o);
  });
  svg.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const p = point(e),
      o = getSelected();
    if (!o) return;
    if (Math.hypot(p.x - drag.x, p.y - drag.y) < 2 && !drag.moved) return;
    if (!drag.moved) {
      saveUndo();
      drag.moved = true;
    }
    const step = state.snap === false ? 1 : 10,
      snap = (n) => Math.round(n / step) * step,
      old = drag.original;
    if (drag.resize) {
      const angle = ((old.r || 0) * Math.PI) / 180,
        dx = p.x - drag.x,
        dy = p.y - drag.y;
      o.w = Math.max(
        8,
        Math.min(
          480,
          snap(
            (old.w || SHAPES[old.type][0]) +
              dx * Math.cos(angle) +
              dy * Math.sin(angle),
          ),
        ),
      );
      o.h = Math.max(
        8,
        Math.min(
          330,
          snap(
            (old.h || SHAPES[old.type][1]) -
              dx * Math.sin(angle) +
              dy * Math.cos(angle),
          ),
        ),
      );
    } else {
      o.x = Math.max(
        60,
        Math.min(540 - (o.w || SHAPES[o.type][0]), snap(old.x + p.x - drag.x)),
      );
      o.y = Math.max(
        26,
        Math.min(360 - (o.h || SHAPES[o.type][1]), snap(old.y + p.y - drag.y)),
      );
    }
    patchShape(o);
  });
  const finish = () => {
    if (drag) {
      drag = null;
      render();
    }
  };
  svg.addEventListener("pointerup", finish);
  svg.addEventListener("pointercancel", finish);
}
let previousFocus = null;
async function openBooking(id, start = null) {
  if (state.user.role === "admin") {
    try {
      state.directory = await api("/admin/directory");
    } catch (error) {
      toast(error.message);
      return;
    }
  }
  const r = room(id);
  if (!r) return;
  if (
    r.canBook === false ||
    r.status !== "enabled" ||
    (r.rule === "admin" && state.user.role !== "admin")
  ) {
    toast("该会议室当前不可预订");
    return;
  }
  previousFocus = document.activeElement;
  $("#modalTitle").textContent = "预订会议室";
  $("#modal").classList.add("open");
  $("#modal").setAttribute("aria-hidden", "false");
  const first = start || state.filters.start,
    end = start
      ? `${String(Math.min(23, Number(start.slice(0, 2)) + 1)).padStart(2, "0")}:00`
      : state.filters.end;
  $("#modalBody").innerHTML =
    `<form id="bookingForm"><div class="form-grid"><div class="field full-row"><label>会议室</label><input value="${esc(r.name)} · ${esc(r.code)}" disabled/></div>${
      state.user.role === "admin"
        ? `<div class="field full-row"><label for="book-owner">预订人</label><select id="book-owner" name="userId"><option value="">本人预订</option>${state.directory.users
            .filter((u) => u.active && u.id !== state.user.id)
            .map(
              (u) =>
                `<option value="${u.id}">${esc(u.name)} (${esc(u.username)})</option>`,
            )
            .join("")}</select></div>`
        : ""
    }<div class="field full-row"><label for="book-title">会议主题</label><input id="book-title" name="title" maxlength="100" required/></div><div class="field full-row"><label for="book-date">使用日期</label><input id="book-date" name="date" type="date" value="${state.filters.date}" min="${TODAY}" required/></div><div class="field"><label for="book-start">开始时间</label><input id="book-start" name="start" type="time" value="${first}" required/></div><div class="field"><label for="book-end">结束时间</label><input id="book-end" name="end" type="time" value="${end}" required/></div><div class="field"><label for="book-contact">联系人</label><input id="book-contact" name="contact" value="${esc(state.user.name)}" maxlength="100" required/></div><div class="field"><label for="book-phone">联系方式</label><input id="book-phone" name="phone" maxlength="100" required/></div>${r.repeat ? '<div class="field"><label for="repeat-frequency">重复方式</label><select name="frequency" id="repeat-frequency"><option value="none">不重复</option><option value="weekly">每周</option><option value="daily">每天</option><option value="monthly">每月</option></select></div><div class="field"><label for="repeat-count">次数</label><input name="count" id="repeat-count" type="number" min="2" max="52" value="4"/></div><div class="field"><label for="repeat-interval">间隔</label><input id="repeat-interval" name="interval" type="number" min="1" max="12" value="1"/></div><div class="field"><label for="repeat-weekdays">每周日期</label><select id="repeat-weekdays" name="weekdays" multiple><option value="1">周一</option><option value="2">周二</option><option value="3">周三</option><option value="4">周四</option><option value="5">周五</option><option value="6">周六</option><option value="0">周日</option></select></div>' : ""}<label class="checkbox-row full-row"><input name="hidden" type="checkbox"/>隐藏预订详情</label><div id="bookingError" class="full-row alert" role="alert" hidden></div><label class="checkbox-row full-row" id="skipConflictRow" hidden><input id="skipConflicts" type="checkbox"/>仅提交无冲突日期</label></div><div class="form-foot"><button class="button" type="button" id="cancelModal">取消</button><button class="button primary" type="submit">${r.rule === "approval" ? "提交审批" : "确认预订"}</button></div></form>`;
  let reviewedConflicts = [],
    reviewedWindow = "";
  $("#bookingForm").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    const data = new FormData(form);
    try {
      const payload = {
        roomId: id,
        title: data.get("title"),
        contact: data.get("contact"),
        phone: data.get("phone"),
        date: data.get("date"),
        start: data.get("start"),
        end: data.get("end"),
        hidden: data.has("hidden"),
      };
      if (data.get("frequency") && data.get("frequency") !== "none")
        payload.repeat = {
          frequency: data.get("frequency"),
          count: Number(data.get("count")),
          interval: Number(data.get("interval") || 1),
          ...(data.get("frequency") === "weekly" &&
          data.getAll("weekdays").length
            ? { weekdays: data.getAll("weekdays").map(Number) }
            : {}),
        };
      if (data.get("userId")) payload.userId = data.get("userId");
      const preview = await api("/bookings/preview", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const windowKey = JSON.stringify([
        payload.date,
        payload.start,
        payload.end,
        payload.repeat,
      ]);
      if (preview.conflicts.length) {
        const reviewed =
          windowKey === reviewedWindow &&
          preview.conflicts.every((d) => reviewedConflicts.includes(d));
        if (!payload.repeat || !$("#skipConflicts").checked || !reviewed) {
          reviewedConflicts = preview.conflicts;
          reviewedWindow = windowKey;
          $("#skipConflicts").checked = false;
          $("#skipConflictRow").hidden = !payload.repeat;
          throw new Error("以下日期已占用：" + preview.conflicts.join("、"));
        }
        payload.skipDates = reviewedConflicts;
      }
      await api("/bookings", { method: "POST", body: JSON.stringify(payload) });
      await refresh();
      closeModal();
      navigate("mine");
      toast(r.rule === "approval" ? "已提交审批" : "预订成功");
    } catch (error) {
      $("#bookingError").hidden = false;
      $("#bookingError").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  $("#cancelModal").onclick = closeModal;
  $("#book-title").focus();
}
function closeModal() {
  $("#modal").classList.remove("open");
  $("#modal").setAttribute("aria-hidden", "true");
  previousFocus?.focus();
}
function showLogin() {
  if ($("#roomDialog").open) $("#roomDialog").close();
  document.body.classList.add("logged-out");
  $("#login").hidden = false;
  $("#login").innerHTML =
    `<form id="loginForm" class="login-card"><span class="eyebrow">SPACEFLOW</span><h1>间序</h1><p class="subtext">登录工作空间</p><div class="field"><label for="username">账号</label><input id="username" name="username" autocomplete="username" required/></div><div class="field"><label for="password">密码</label><input id="password" name="password" type="password" autocomplete="current-password" required/></div><p id="loginError" class="alert" role="alert" hidden></p><button class="button primary wide" type="submit">登录</button></form>`;
  $("#loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const button = e.currentTarget.querySelector("button");
    button.disabled = true;
    try {
      await api("/login", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
      });
      await boot();
    } catch (error) {
      $("#loginError").hidden = false;
      $("#loginError").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  $("#username").focus();
}
async function boot() {
  try {
    await refresh();
    document.body.classList.remove("logged-out");
    $("#login").hidden = true;
    state.page = "explore";
    state.undo = [];
    state.selection = null;
    render();
  } catch (error) {
    if (!state.user) showLogin();
    else toast(error.message);
  }
}
document.body.addEventListener("click", async (e) => {
  const node = e.target.closest("button,[data-cell],[data-room]");
  if (!node || !state.user) return;
  try {
    if (await handleWorkspaceClick(node)) return;
    if (await handleFeatureClick(node)) return;
    if (await handleManagementClick(node)) return;
    if (node.id === "logout") {
      await api("/logout", { method: "POST" });
      state.user = null;
      state.bookings = [];
      showLogin();
      return;
    }
    if (node.id === "refresh") {
      await refresh();
      await loadPageData(state.page);
      render();
      return;
    }
    if (node.dataset.page) {
      if (
        [
          "editor",
          "settings",
          "approvals",
          "rooms",
          "users",
          "audit",
          "reservations",
        ].includes(node.dataset.page) &&
        state.user.role !== "admin"
      )
        return;
      navigate(node.dataset.page);
      return;
    }
    if (node.dataset.room) {
      await showRoomDetail(node.dataset.room);
      return;
    }
    if (node.dataset.book) {
      openBooking(node.dataset.book);
      return;
    }
    if (node.dataset.equip) {
      const x = node.dataset.equip;
      state.filters.equip = state.filters.equip.includes(x)
        ? state.filters.equip.filter((v) => v !== x)
        : [...state.filters.equip, x];
      render();
      return;
    }
    if (node.dataset.add) {
      addElement(node.dataset.add);
      return;
    }
    if (node.dataset.cell) {
      const [id, start] = node.dataset.cell.split("|");
      if (
        conflicts(
          id,
          state.filters.date,
          start,
          `${String(Number(start.slice(0, 2)) + 1).padStart(2, "0")}:00`,
        ).length
      ) {
        state.selectedRoom = id;
        await showRoomDetail(id);
      } else openBooking(id, start);
      return;
    }
    if (node.dataset.cancel || node.dataset.decision) {
      node.disabled = true;
      await api(
        `/bookings/${node.dataset.cancel || node.dataset.id}/${node.dataset.decision || "cancel"}`,
        { method: "POST" },
      );
      await refresh();
      render();
      toast("已更新预订");
      return;
    }
    switch (node.id) {
      case "clearFilters":
        state.filters = {
          building: "all",
          floor: "all",
          date: TODAY,
          start: "10:00",
          end: "11:00",
          capacity: 0,
          equip: [],
        };
        render();
        break;
      case "closeModal":
        closeModal();
        break;
      case "saveLayout":
        node.disabled = true;
        await persist();
        await loadPageData("editor");
        render();
        toast("布局已保存");
        break;
      case "undoBtn":
        if (state.undo.length) {
          setEditorElements(JSON.parse(state.undo.pop()));
          state.selection = null;
          render();
        }
        break;
      case "resetTemplate":
        saveUndo();
        setEditorElements(
          preset(state.layoutEditor?.type || room(state.selectedRoom).type),
        );
        state.selection = null;
        render();
        break;
      case "deleteEl":
        if (getSelected()) {
          saveUndo();
          setEditorElements(
            editorElements().filter((o) => o.id !== state.selection),
          );
          state.selection = null;
          render();
        }
        break;
      case "rotateEl":
        if (getSelected()) {
          saveUndo();
          getSelected().r = ((getSelected().r || 0) + 90) % 360;
          render();
        }
        break;
      case "cloneEl":
        if (getSelected()) {
          const old = getSelected();
          saveUndo();
          const o = {
            ...old,
            id: "e" + Math.random().toString(36).slice(2, 8),
            x: Math.min(550, old.x + 24),
            y: Math.min(350, old.y + 24),
          };
          editorElements().push(o);
          state.selection = o.id;
          render();
        }
        break;
      case "exportLayout": {
        const blob = new Blob(
            [
              JSON.stringify(
                {
                  schemaVersion: 1,
                  spaceId: state.selectedRoom,
                  coordinateSystem: { width: 600, height: 390 },
                  elements: editorElements(),
                },
                null,
                2,
              ),
            ],
            { type: "application/json" },
          ),
          url = URL.createObjectURL(blob),
          a = document.createElement("a");
        a.href = url;
        a.download = "spaceflow-layout.json";
        a.click();
        URL.revokeObjectURL(url);
        break;
      }
      case "previewLayout":
        await showRoomDetail(state.selectedRoom);
        break;
      default:
        if (node.dataset.action === "go-schedule") navigate("schedule");
        if (node.dataset.action === "back-explore") navigate("explore");
    }
  } catch (error) {
    toast(error.message);
    node.disabled = false;
  }
});
document.body.addEventListener("change", async (e) => {
  const t = e.target;
  try {
    if (t.id === "detailDate") {
      state.filters.date = t.value;
      await showRoomDetail(state.selectedRoom);
      return;
    }
    const filters = {
      "f-building": "building",
      "f-floor": "floor",
      "f-date": "date",
      "schedule-date": "date",
      "f-start": "start",
      "f-end": "end",
      "f-capacity": "capacity",
    };
    if (filters[t.id]) {
      state.filters[filters[t.id]] =
        t.id === "f-capacity" ? Number(t.value) : t.value;
      if (t.id === "f-building") state.filters.floor = "all";
      if (t.id === "schedule-date") await loadPageData("schedule");
      render();
    }
    if (t.id === "schedule-view") {
      state.scheduleView = t.value;
      state.calendarPage = 1;
      await loadPageData("schedule");
      render();
    }
    if (t.id === "snapGrid") state.snap = t.checked;
    if (t.id === "edit-room") {
      state.selectedRoom = t.value;
      await loadPageData("editor");
      state.selection = null;
      state.undo = [];
      render();
    }
    if (
      ["prop-x", "prop-y", "prop-r", "prop-w", "prop-h"].includes(t.id) &&
      getSelected()
    ) {
      saveUndo();
      const k = {
        "prop-x": "x",
        "prop-y": "y",
        "prop-r": "r",
        "prop-w": "w",
        "prop-h": "h",
      }[t.id];
      getSelected()[k] = Math.max(
        k === "r" ? -360 : ["w", "h"].includes(k) ? 8 : 0,
        Math.min(
          k === "r" ? 360 : k === "x" || k === "w" ? 600 : 390,
          Number(t.value) || 0,
        ),
      );
      const obj = getSelected();
      patchShape(obj);
      t.value = String(obj[k]);
      $("#undoBtn").disabled = false;
    }
    if (t.dataset.rule || t.dataset.status) {
      const r = room(t.dataset.rule || t.dataset.status);
      await api("/rooms/" + r.id + "/policy", {
        method: "PUT",
        body: JSON.stringify({
          rule: t.dataset.rule ? t.value : r.rule,
          status: t.dataset.status ? t.value : r.status,
        }),
      });
      await refresh();
      render();
      toast("规则已保存");
    }
  } catch (error) {
    toast(error.message);
  }
});
document.addEventListener("keydown", (e) => {
  if (
    e.target.matches("[data-cell],[data-room]") &&
    ["Enter", " "].includes(e.key)
  ) {
    e.preventDefault();
    e.target.click();
  }
  if (e.key === "Escape" && $("#modal").classList.contains("open"))
    closeModal();
  if ($("#modal").classList.contains("open") && e.key === "Tab") {
    const nodes = [
      ...$("#modal").querySelectorAll(
        "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)",
      ),
    ];
    if (e.shiftKey && document.activeElement === nodes[0]) {
      e.preventDefault();
      nodes.at(-1).focus();
    } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
      e.preventDefault();
      nodes[0].focus();
    }
  }
  if (
    state.page === "editor" &&
    state.selection &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
  ) {
    if (e.key === "Delete" || e.key === "Backspace") $("#deleteEl")?.click();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      $("#undoBtn")?.click();
    }
  }
});
$("#modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
});
$("#closeModal").onclick = closeModal;
boot();

try {
  state.discoverView = localStorage.getItem("spaceflow-view") || "grid";
} catch {}
$("#closeRoomDetail").onclick = () => $("#roomDialog").close();
$("#roomDialog").addEventListener("click", (e) => {
  if (e.target === $("#roomDialog")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      e.target.close();
  }
});
