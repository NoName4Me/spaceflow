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
  return `<div class="page-head"><div>${label(kicker)}<h1>${title}</h1><div class="subtext">${sub}</div></div><div class="section-utilities">${tools}</div></div>`;
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
function planSvg(r, mode = "preview", opts = {}) {
  const objects = state.layouts[r.id] || preset(r.type);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 390" preserveAspectRatio="xMidYMid meet" class="room-svg ${mode === "edit" ? "editable" : ""}" data-room-id="${r.id}" aria-label="${esc(r.name)}会议室布局图"><defs><pattern id="grid-${mode}" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#dce7db" stroke-width=".6"/></pattern></defs><rect width="600" height="390" rx="5" fill="#f4f7f1"/><rect width="600" height="390" fill="url(#grid-${mode})" opacity="${mode === "edit" ? 0.85 : 0.28}"/><rect x="60" y="26" width="480" height="334" rx="1" fill="#fdfefa" stroke="#b8cab8" stroke-width="9"/><rect x="75" y="39" width="450" height="306" fill="#fbfcf7"/><rect x="78" y="295" width="72" height="14" fill="#fbfcf7"/><text x="81" y="342" fill="#98ac98" font-size="10">ROOM ${esc(r.code)}</text>${objects.map((o) => iconShape(o, mode === "edit" && state.selection === o.id)).join("")}<text x="527" y="376" fill="#9eafa1" text-anchor="end" font-size="10">布局示意 · 非工程比例</text></svg>`;
}
function renderExplore() {
  const f = state.filters;
  let floors = [
    ...new Set(
      state.rooms
        .filter((r) => f.building === "all" || r.building === f.building)
        .map((r) => r.floor),
    ),
  ].sort((a, b) => parseInt(a) - parseInt(b));
  let availableFloor = (floor) => floors.includes(floor);
  if (f.floor !== "all" && !availableFloor(f.floor)) f.floor = "all";
  let results = state.rooms.filter(
    (r) =>
      (f.building === "all" || r.building === f.building) &&
      (f.floor === "all" || r.floor === f.floor) &&
      r.capacity >= Number(f.capacity) &&
      f.equip.every((x) => r.equip.includes(x)),
  );
  const buildings = [...new Set(state.rooms.map((r) => r.building))];
  return `<section class="page">${pageHead("SPACE EXPLORER", "找到刚好合适的空间", "根据位置、人数、设备和时间，快速找到适合你的会议室。", `<button class="button" data-action="go-schedule">▦ &nbsp; 查看预订日程</button>`)}
<div class="filter-surface"><div class="filter-grid"><div class="field"><label>楼栋</label><select id="f-building"><option value="all">全部楼栋</option>${buildings.map((x) => `<option ${x === f.building ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div><div class="field"><label>楼层</label><select id="f-floor"><option value="all">全部楼层</option>${floors.map((x) => `<option ${x === f.floor ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div><div class="field"><label>使用日期</label><input id="f-date" type="date" value="${esc(f.date)}" /></div><div class="field"><label>开始时间</label><input id="f-start" type="time" value="${esc(f.start)}" /></div><div class="field"><label>结束时间</label><input id="f-end" type="time" value="${esc(f.end)}" /></div><div class="field"><label>容纳人数</label><select id="f-capacity"><option value="0">不限人数</option>${[4, 6, 8, 12, 16, 20].map((n) => `<option value="${n}" ${Number(f.capacity) === n ? "selected" : ""}>${n} 人以上</option>`).join("")}</select></div></div><div class="filter-row2"><span class="filter-label">设施要求</span>${["投屏", "视频会议", "白板", "音响"].map((x) => `<button class="chip ${f.equip.includes(x) ? "on" : ""}" data-equip="${x}">${f.equip.includes(x) ? "✓ " : ""}${x}</button>`).join("")}<button class="linklike" id="clearFilters" style="margin-left:auto">重置筛选 ↺</button></div></div>
<div class="overview-bar"><h2>符合条件的会议室 <span class="muted">(${results.length})</span></h2><small>绿色为空闲时段 · 橙色为已占用</small></div>${
    results.length
      ? `<div class="rooms-grid">${results
          .map(
            (r) =>
              `<article class="room-card"><div class="room-art">${planSvg(r)}<span class="art-label">${esc(r.type)}</span><span class="art-status ${roomAvailable(r) ? "" : "busy"}">${roomAvailable(r) ? "● 时段空闲" : r.status !== "enabled" ? "● 暂停预订" : r.canBook === false ? "● 无预订权限" : "● 时段冲突"}</span></div><div class="room-info"><div class="room-topline"><h3>${esc(r.name)}会议室</h3><span class="muted" style="font-size:11px">${r.capacity} 人</span></div><div class="room-meta">${esc(r.building)} · ${esc(r.floor)} · ${esc(r.code)}</div><div class="amenities">${r.equip
                .slice(0, 3)
                .map((x) => `<span class="amenity">${esc(x)}</span>`)
                .join(
                  "",
                )}</div><div class="room-footer"><span class="availability ${roomAvailable(r) ? "" : "busy"}">${roomAvailable(r) ? "✓ 当前筛选时段可预订" : r.status !== "enabled" ? "暂停预订" : r.canBook === false ? "无预订权限" : "此时段已被占用"}</span><button data-room="${r.id}">查看详情 ↗</button></div></div></article>`,
          )
          .join("")}</div>`
      : `<div class="empty-box">没有找到符合全部条件的会议室，请放宽筛选条件。</div>`
  }</section>`;
}
function renderDetail() {
  const r = room(state.selectedRoom) || state.rooms[0],
    bs = state.bookings
      .filter(
        (b) =>
          b.roomId === r.id &&
          b.date === state.filters.date &&
          ["pending", "confirmed"].includes(b.status),
      )
      .sort((a, b) => a.start.localeCompare(b.start));
  return `<section class="page"><button class="back-btn" data-action="back-explore">← 返回空间发现</button>${pageHead("ROOM PROFILE", `${esc(r.name)}会议室`, ` ${esc(r.building)} / ${esc(r.floor)} / ${esc(r.code)}`, `<button class="button primary" data-book="${r.id}">＋ 预订会议室</button>`)}<div class="detail-layout"><div class="panel"><div class="panel-title"><h2>空间布局</h2><div class="legend"><span><i></i> 设施示意</span><span><i class="orange"></i> 实际尺度以现场为准</span></div></div><div class="detail-hero">${planSvg(r)}</div><div class="divider-line"></div><div class="panel-title"><h2>空间介绍</h2><span class="status-note">当前为管理员配置的最新布局</span></div><p class="subtext" style="line-height:1.9">${esc(r.desc)}</p><div class="amenities" style="margin-top:18px;margin-bottom:0">${r.equip.map((x) => `<span class="amenity">${esc(x)}</span>`).join("")}</div></div><div class="panel"><div class="panel-title"><h2>基础信息</h2><span class="amenity">${esc(r.type)}</span></div>${[
    ["会议室编号", r.code],
    ["可容纳人数", r.capacity + " 人"],
    ["面积", r.area + " ㎡"],
    ["位置", `${r.building} ${r.floor}`],
    [
      "预订方式",
      r.rule === "instant"
        ? "直接预订"
        : r.rule === "approval"
          ? "需要审批"
          : "仅管理员预订",
    ],
  ]
    .map(
      (x) =>
        `<div class="info-pair"><span>${esc(x[0])}</span><span>${esc(x[1])}</span></div>`,
    )
    .join(
      "",
    )}<div class="divider-line"></div><div class="panel-title"><h2>${dateHuman(state.filters.date)} · 已占用时段</h2></div>${bs.length ? `<div class="time-list">${bs.map((b) => `<div class="time-row occupied"><div><b>${b.start} – ${b.end}</b><div class="muted" style="margin-top:7px">${b.hidden && b.owner !== "me" && state.user.role !== "admin" ? "私人预订 · 详情已隐藏" : esc(b.title)}</div></div><span>${b.hidden && b.owner !== "me" && state.user.role !== "admin" ? "信息隐藏" : esc(b.contact)}</span></div>`).join("")}</div>` : `<p class="subtext">该日暂无预订记录。</p>`}<button class="button primary wide" style="margin-top:22px" data-book="${r.id}">预订这个空间 →</button></div></div></section>`;
}
function renderSchedule() {
  const d = state.filters.date,
    hr = Array.from({ length: 10 }, (_, i) => i + 8);
  return `<section class="page">${pageHead("AVAILABILITY CALENDAR", "一眼看清空闲时间", "横向对比不同会议室的使用情况，点选空闲格快速预订。", `<div class="field"><input aria-label="日程日期" type="date" id="schedule-date" value="${esc(d)}"/></div>`)}<div class="summary-stats"><div class="stat"><small>当前会议室</small><div class="stat-value">${state.rooms.length}</div><span class="stat-accent">跨 ${new Set(state.rooms.map((r) => r.building)).size} 座楼栋</span></div><div class="stat"><small>当日已确认预订</small><div class="stat-value">${state.bookings.filter((b) => b.date === d && b.status === "confirmed").length}</div><span class="stat-accent">已确认</span></div><div class="stat"><small>待审批申请</small><div class="stat-value">${state.bookings.filter((b) => b.date === d && b.status === "pending").length}</div><span class="stat-accent">等待处理</span></div></div><div class="schedule-layout"><div class="panel calendar"><div class="calendar-top"><h2>${dateHuman(d)} · 会议室占用矩阵</h2><div class="legend"><span><i></i> 已预订</span><span><i class="orange"></i> 待审批/隐私预订</span></div></div><div class="sched-grid"><div class="sched-head">会议室 / 时段</div>${hr.map((h) => `<div class="sched-head">${String(h).padStart(2, "0")}:00</div>`).join("")}${state.rooms
    .map(
      (r) =>
        `<div class="sched-name"><b>${esc(r.name)} · ${r.capacity}人</b><small>${esc(r.building)} / ${esc(r.floor)}</small></div>${hr
          .map((h) => {
            let start = String(h).padStart(2, "0") + ":00",
              end = String(h + 1).padStart(2, "0") + ":00",
              bs = conflicts(r.id, d, start, end),
              b = bs[0];
            return `<div class="sched-cell" role="button" tabindex="0" title="${esc(r.name)} ${start} - ${end}" data-cell="${r.id}|${start}">${b ? `<span class="sched-event ${b.hidden || b.status === "pending" ? "private" : ""}" title="${b.hidden && b.owner !== "me" && state.user.role !== "admin" ? "详情隐藏" : esc(b.title)}">${b.hidden && b.owner !== "me" && state.user.role !== "admin" ? "已占用" : esc(b.title)}</span>` : ""}</div>`;
          })
          .join("")}`,
    )
    .join(
      "",
    )}</div></div><aside class="panel"><h3 style="margin-bottom:12px">快捷操作</h3><button class="button wide" data-action="back-explore">返回筛选会议室 ↗</button></aside></div></section>`;
}
function renderMine() {
  const bs = state.bookings
    .filter((b) => b.owner === "me")
    .sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
  return `<section class="page">${pageHead("MY BOOKINGS", "我的预订", "查看自己提交的预订申请、已确认会议及取消记录。", `<button class="button primary" data-action="back-explore">＋ 创建新预订</button>`)}<div class="panel"><div class="panel-title"><h2>预订记录 (${bs.length})</h2></div><div class="booking-list">${bs.length ? bs.map((b) => `<div class="booking-item"><div><h3><span class="booking-badge ${b.status === "pending" ? "pending" : b.status === "cancelled" ? "cancelled" : ""}">${{ confirmed: "已确认", pending: "待审批", cancelled: "已取消", rejected: "已拒绝", expired: "已过期" }[b.status]}</span>${esc(b.title)}</h3><p>${esc(room(b.roomId)?.name || b.roomName)}会议室 · ${b.date} · ${b.start}–${b.end}${b.hidden && b.owner !== "me" && state.user.role !== "admin" ? " · 联系方式已隐藏" : ""}</p></div><div>${["pending", "confirmed"].includes(b.status) ? `<button class="button small" data-edit-booking="${b.id}">修改</button> <button class="button small" data-cancel="${b.id}">${b.seriesId ? "取消本次" : "取消预订"}</button>${b.seriesId ? `<button class="button small" data-series="${b.seriesId}" data-series-action="cancel">取消所有后续</button>` : ""}` : ""}</div></div>`).join("") : '<div class="empty-box">还没有自己的预订记录。先去选择一个会议室吧。</div>'}</div></div></section>`;
}
function renderEditor() {
  const r = room(state.selectedRoom) || state.rooms[0],
    objects = state.layouts[r.id] || [],
    obj = objects.find((o) => o.id === state.selection);
  return `<section class="page">${pageHead("LAYOUT DESIGNER", "把真实空间搬到画布上", "拖动家具、门窗和设备，配置会议室内部的示意布局。", `<select id="edit-room" class="button" aria-label="选择会议室">${state.rooms.map((x) => `<option value="${x.id}" ${r.id === x.id ? "selected" : ""}>${esc(x.name)} · ${esc(x.code)}</option>`).join("")}</select><button class="button" id="undoBtn" ${state.undo.length ? "" : "disabled"}>↶ 撤销</button><button class="button primary" id="saveLayout">✓ 保存布局</button>`)}<div class="editor-grid"><aside class="panel editor-side"><div class="panel-title"><h2>组件库</h2></div><div class="property-hint">点击组件插入画布；选中后可拖动位置。</div><div class="palette-group">家具</div>${[
    ["table", "会议长桌", "▰"],
    ["desk", "单排桌", "▬"],
    ["chair", "座椅", "▢"],
  ]
    .map(
      (x) =>
        `<button class="palette-item" data-add="${x[0]}"><span class="palette-symbol">${x[2]}</span>${x[1]}<span style="margin-left:auto">＋</span></button>`,
    )
    .join("")}<div class="palette-group">建筑与设备</div>${[
    ["door", "出入口", "↷"],
    ["window", "窗户", "═"],
    ["screen", "显示屏", "▣"],
    ["board", "白板", "▤"],
  ]
    .map(
      (x) =>
        `<button class="palette-item" data-add="${x[0]}"><span class="palette-symbol">${x[2]}</span>${x[1]}<span style="margin-left:auto">＋</span></button>`,
    )
    .join(
      "",
    )}<div class="palette-group">快速模板</div><button class="button small wide" id="resetTemplate">应用默认布局模板</button></aside><div class="panel" style="padding:12px"><div class="panel-title" style="padding:5px 7px 0"><h2>${esc(r.name)} · 内部布局</h2><span class="status-note">${objects.length} 个元素 · 非比例尺</span></div><div class="editor-stage" id="editorStage">${planSvg(r, "edit")}<div class="canvas-tip">点击选择 / 拖拽移动 · 支持旋转、复制、删除 · 保存布局后生效</div></div></div><aside class="panel editor-side editor-props"><div class="panel-title"><h2>属性面板</h2></div>${obj ? `<div class="editor-selected"><b>${esc(ICONS[obj.type])}</b><div class="property-hint">元素 ID · ${esc(obj.id)}</div></div><div class="property-group"><h3>坐标与旋转</h3><div class="mini-fields"><div><label class="mini-label">X</label><input class="smallinput" type="number" id="prop-x" value="${Math.round(obj.x)}" /></div><div><label class="mini-label">Y</label><input class="smallinput" type="number" id="prop-y" value="${Math.round(obj.y)}" /></div></div><div style="margin-top:10px"><label class="mini-label">旋转（度）</label><input class="smallinput" type="number" id="prop-r" value="${obj.r || 0}" step="15" /></div><div class="editor-actions"><button class="button small" id="rotateEl">↻ 旋转 90°</button><button class="button small" id="cloneEl">复制</button><button class="button small" id="deleteEl">删除</button></div></div>` : `<p class="property-hint">先点击画布上的元素以查看属性。<br/><br/>可添加桌椅、门窗和设备。</p>`}<div class="divider-line"></div><h3>布局数据</h3><label class="checkbox-row"><input id="snapGrid" type="checkbox" ${state.snap === false ? "" : "checked"}/>网格吸附</label><div class="mini-fields"><div><label for="prop-w">宽度</label><input id="prop-w" type="number" class="smallinput" min="8" max="500" value="${obj?.w || SHAPES[obj?.type]?.[0] || 0}" ${obj ? "" : "disabled"}/></div><div><label for="prop-h">高度</label><input id="prop-h" type="number" class="smallinput" min="8" max="330" value="${obj?.h || SHAPES[obj?.type]?.[1] || 0}" ${obj ? "" : "disabled"}/></div></div><button class="button wide" id="importLayout">导入布局 JSON</button><input type="file" id="layoutFile" accept="application/json,.json" hidden/><button class="button wide" id="saveTemplate">保存为模板</button><select id="layoutTemplate" class="smallinput" aria-label="布局模板">${(state.templates || []).map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select><div class="row-actions"><button class="button small" id="applyTemplate">应用模板</button><button class="button small" id="deleteTemplate">删除模板</button></div><select id="layoutVersion" class="smallinput" aria-label="布局历史版本">${(state.layoutVersions || []).map((v) => `<option value="${v.version}">版本 ${v.version} · ${new Date(v.created_at).toLocaleString("zh-CN")}</option>`).join("")}</select><button class="button wide" id="restoreLayout">载入历史版本</button><button class="button wide" style="margin-top:15px" id="exportLayout">导出布局 JSON ↓</button><button class="button wide" style="margin-top:8px" id="previewLayout">查看用户端效果 ↗</button></aside></div></section>`;
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
    explore: renderExplore,
    detail: renderDetail,
    schedule: renderEnhancedSchedule,
    mine: renderMine,
    editor: renderEditor,
    settings: renderSettings,
    approvals: renderApprovals,
    rooms: renderLocationRooms,
    users: renderUsers,
    account: renderAccount,
    audit: renderAudit,
    notifications: renderNotifications,
    reservations: renderAdminBookings,
  };
  $("#content").innerHTML =
    !state.rooms.length && ["detail", "editor"].includes(state.page)
      ? '<div class="empty-box">暂无可用会议室</div>'
      : (pages[state.page] || renderExplore)();
  const texts = {
    explore: "空间发现",
    detail: "会议室详情",
    schedule: "预订日程",
    mine: "我的预订",
    editor: "布局编辑器",
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
  const arr = state.layouts[state.selectedRoom];
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
  state.undo.push(JSON.stringify(state.layouts[state.selectedRoom]));
  if (state.undo.length > 30) state.undo.shift();
}
function getSelected() {
  return state.layouts[state.selectedRoom]?.find(
    (o) => o.id === state.selection,
  );
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
    const o = state.layouts[state.selectedRoom].find(
      (o) => o.id === shape.dataset.id,
    );
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
  const node = e.target.closest("button,[data-cell]");
  if (!node || !state.user) return;
  try {
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
      state.selectedRoom = node.dataset.room;
      navigate("detail");
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
        navigate("detail");
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
          state.layouts[state.selectedRoom] = JSON.parse(state.undo.pop());
          state.selection = null;
          render();
        }
        break;
      case "resetTemplate":
        saveUndo();
        state.layouts[state.selectedRoom] = preset(
          room(state.selectedRoom).type,
        );
        state.selection = null;
        render();
        break;
      case "deleteEl":
        if (getSelected()) {
          saveUndo();
          state.layouts[state.selectedRoom] = state.layouts[
            state.selectedRoom
          ].filter((x) => x.id !== state.selection);
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
          state.layouts[state.selectedRoom].push(o);
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
                  elements: state.layouts[state.selectedRoom],
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
        navigate("detail");
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
  if (e.target.matches("[data-cell]") && ["Enter", " "].includes(e.key)) {
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
$("#todayText").textContent = new Date().toLocaleDateString("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
});
boot();
