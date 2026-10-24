const statusLabels = {
  confirmed: "已确认",
  pending: "待审批",
  cancelled: "已取消",
  rejected: "已拒绝",
  expired: "已过期",
  updated: "已修改",
};
const actionLabels = {
  "booking.created": "创建预订",
  "booking.updated": "修改预订",
  "building.created": "新增楼栋",
  "building.deleted": "删除空楼栋",
  "floor.deleted": "删除空楼层",
  "building.updated": "修改楼栋",
  "floor.created": "新增楼层",
  "floor.updated": "修改楼层",
  "template.created": "新增布局",
  "template.updated": "修改布局",
  "template.deleted": "删除布局",
  "booking.cancel": "取消预订",
  "booking.approve": "通过审批",
  "booking.reject": "拒绝申请",
  "booking.expired": "申请过期",
  "series.cancel": "取消所有后续预订",
  "series.approve": "通过周期申请",
  "series.reject": "拒绝周期申请",
  "layout.saved": "保存布局",
  "policy.updated": "修改规则",
  "room.created": "新增会议室",
  "room.updated": "修改会议室",
  "user.created": "新增账号",
  "user.updated": "修改账号",
  "user.password": "重置密码",
  "account.password": "修改密码",
  "department.created": "新增部门",
  "department.updated": "修改部门",
};
async function loadPageData(page) {
  if (page === "rooms") state.catalog = await api("/admin/locations");
  if (page === "schedule") {
    const request = (state.calendarRequest = (state.calendarRequest || 0) + 1);
    const result = await api(
      "/calendar?" +
        new URLSearchParams({
          date: state.filters.date,
          view: state.scheduleView || "day",
          page: state.calendarPage || 1,
          size: 20,
        }),
    );
    if (request === state.calendarRequest) state.calendar = result;
  }
  if (["rooms", "users"].includes(page))
    state.directory = await api("/admin/directory");
  if (page === "audit") state.audit = await api("/audit");
  if (page === "notifications")
    state.notifications = await api("/notifications");
}
function uiField(label, name, value = "", type = "text", extra = "") {
  return `<div class="field"><label for="edit-${name}">${esc(label)}</label><input id="edit-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}/></div>`;
}
function uiSelect(label, name, options, value) {
  return `<div class="field"><label for="edit-${name}">${esc(label)}</label><select id="edit-${name}" name="${name}">${options.map(([id, text]) => `<option value="${esc(id)}" ${String(id) === String(value) ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></div>`;
}
function uiMulti(label, name, options, values = []) {
  return `<div class="field"><label for="edit-${name}">${esc(label)}</label><select id="edit-${name}" name="${name}" multiple size="3">${options.map(([id, text]) => `<option value="${esc(id)}" ${values.includes(id) ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></div>`;
}
function renderUsers() {
  return `<section class="page">${pageHead("IDENTITY", "账号与部门", "", `<button class="button" id="newDepartment">＋ 新增部门</button><button class="button primary" id="newUser">＋ 新增账号</button>`)}<div class="panel"><div class="panel-title"><h2>账号</h2></div><div class="management-list">${state.directory.users.map((u) => `<article class="management-row"><div><h3>${esc(u.name)} <small>${u.active ? "启用" : "停用"}</small></h3><p>${esc(u.username)} · ${u.role === "admin" ? "管理员" : "员工"} · ${esc(u.department || "未分配部门")}</p></div><div class="row-actions"><button class="button small" data-edit-user="${u.id}">编辑</button><button class="button small" data-reset-user="${u.id}">重置密码</button></div></article>`).join("")}</div></div><div class="panel section-gap"><div class="panel-title"><h2>部门</h2></div><div class="management-list">${state.directory.departments.map((d) => `<article class="management-row"><span>${esc(d.name)}</span><button class="button small" data-edit-department="${d.id}">重命名</button></article>`).join("") || '<div class="empty-box">暂无部门</div>'}</div></div></section>`;
}
function renderAccount() {
  return `<section class="page">${pageHead("ACCOUNT", "账号设置", `${esc(state.user.name)} · ${esc(state.user.username)}`)}<form id="passwordForm" class="panel compact-form">${uiField("当前密码", "currentPassword", "", "password", 'required autocomplete="current-password"')}${uiField("新密码", "newPassword", "", "password", 'required minlength="10" maxlength="256" autocomplete="new-password"')}${uiField("确认新密码", "confirmPassword", "", "password", 'required minlength="10" autocomplete="new-password"')}<p class="alert" id="passwordError" role="alert" hidden></p><button class="button primary" type="submit">修改密码并重新登录</button></form><form id="emailForm" class="panel compact-form section-gap">${uiField("通知邮箱", "email", state.user.email || "", "email", 'maxlength="254"')}<button class="button primary" type="submit">保存通知邮箱</button></form></section>`;
}
function renderAudit() {
  return `<section class="page">${pageHead("AUDIT", "操作记录", "最近 100 条操作")}<div class="panel management-list">${state.audit.map((a) => `<article class="management-row"><div><h3>${esc(actionLabels[a.action] || a.action)}</h3><p>${esc(a.name || "系统")} · ${new Date(a.created_at).toLocaleString("zh-CN")}</p><small class="record-id">${esc(a.target_name)}</small></div></article>`).join("") || '<div class="empty-box">暂无操作记录</div>'}</div></section>`;
}
function renderNotifications() {
  return `<section class="page">${pageHead("INBOX", "通知", "最近 100 条预订动态", `<button class="button" id="readNotifications">全部标为已读</button>`)}<div class="panel management-list">${state.notifications.map((n) => `<article class="management-row ${n.read_at ? "" : "unread"}"><div><h3>${esc(n.title)} · ${statusLabels[n.status]}</h3><p>${esc(n.room)} · ${esc(n.start)}</p><small>${new Date(n.created_at).toLocaleString("zh-CN")}</small></div>${n.read_at ? "" : '<span class="unread-dot" aria-label="未读"></span>'}</article>`).join("") || '<div class="empty-box">暂无通知</div>'}</div></section>`;
}
function renderAdminBookings() {
  return `<section class="page">${pageHead("RESERVATIONS", "预订管理", "")}<div class="panel booking-list">${state.bookings.map((b) => `<article class="booking-item"><div><h3><span class="booking-badge">${statusLabels[b.status]}</span>${esc(b.title)}</h3><p>${esc(b.roomName)} · ${b.date} ${b.start}–${b.end} · ${esc(b.contact)}</p></div><div class="row-actions">${["confirmed", "pending"].includes(b.status) ? `<button class="button small" data-cancel="${b.id}">取消预订</button>${b.seriesId ? `<button class="button small" data-series="${b.seriesId}" data-series-action="cancel">取消所有后续</button>` : ""}` : ""}</div></article>`).join("") || '<div class="empty-box">暂无预订</div>'}</div></section>`;
}
function showEditDialog(title, body, onSubmit) {
  previousFocus = document.activeElement;
  $("#modalTitle").textContent = title;
  $("#modal").classList.add("open");
  $("#modal").setAttribute("aria-hidden", "false");
  $("#modalBody").innerHTML =
    `<form id="editForm"><div class="form-grid">${body}</div><p class="alert" id="editError" role="alert" hidden></p><div class="form-foot"><button class="button" type="button" id="cancelModal">取消</button><button class="button primary" type="submit">保存</button></div></form>`;
  $("#cancelModal").onclick = closeModal;
  $("#editForm").onsubmit = async (e) => {
    e.preventDefault();
    const button = e.currentTarget.querySelector('[type="submit"]'),
      form = new FormData(e.currentTarget);
    button.disabled = true;
    try {
      await onSubmit(form);
      closeModal();
      await refresh();
      await loadPageData(state.page);
      render();
      toast("已保存");
    } catch (error) {
      $("#editError").hidden = false;
      $("#editError").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  $("#editForm").querySelector("input,select")?.focus();
}
function editRoom(id) {
  const r = room(id) || {
    name: "",
    code: "",
    building: "",
    floor: "",
    capacity: 6,
    area: 0,
    type: "董事会式",
    equip: [],
    desc: "",
    rule: "instant",
    status: "enabled",
    repeat: false,
    access: {},
  };
  const a = r.access || {},
    depts = state.directory.departments.map((d) => [d.id, d.name]),
    users = state.directory.users.map((u) => [
      u.id,
      u.name + " (" + u.username + ")",
    ]);
  let fields =
    uiField("名称", "name", r.name, "text", 'required maxlength="100"') +
    uiField("编号", "code", r.code, "text", 'required maxlength="100"') +
    uiSelect(
      "所属楼层",
      "floorId",
      state.catalog.floors.map((f) => [
        f.id,
        state.catalog.buildings.find((b) => b.id === f.building_id)?.name +
          " / " +
          f.name,
      ]),
      r.floorId || state.locationFloor,
    ) +
    uiField(
      "容量",
      "capacity",
      r.capacity,
      "number",
      'required min="1" max="1000"',
    ) +
    uiField(
      "面积（㎡）",
      "area",
      r.area,
      "number",
      'required min="0" max="100000" step="0.1"',
    ) +
    uiSelect(
      "布局",
      "layoutTemplateId",
      state.layoutTemplates.map((t) => [t.id, t.name]),
      r.layoutTemplateId ||
        state.layoutTemplates.find((t) => t.type === r.type)?.id,
    ) +
    uiSelect(
      "预订方式",
      "rule",
      [
        ["instant", "直接预订"],
        ["approval", "管理员审批"],
        ["admin", "仅管理员"],
      ],
      r.rule,
    ) +
    uiSelect(
      "开放状态",
      "status",
      [
        ["enabled", "启用"],
        ["disabled", "停用"],
        ["hidden", "隐藏"],
        ["maintenance", "维护"],
      ],
      r.status,
    ) +
    uiField("设施（逗号分隔）", "equip", r.equip.join("，")) +
    `<div class="field full-row"><label for="edit-desc">介绍</label><textarea id="edit-desc" name="desc" maxlength="2000">${esc(r.desc)}</textarea></div><label class="checkbox-row full-row"><input name="repeat" type="checkbox" ${r.repeat ? "checked" : ""}/>允许周期预订</label><details class="full-row access-fields"><summary>可见与预订权限</summary><label class="checkbox-row"><input type="checkbox" name="viewRestricted" ${a.viewRestricted ? "checked" : ""}/>仅指定部门或人员可见</label>${uiMulti("可见部门", "viewDepartments", depts, a.viewDepartments)}${uiMulti("可见人员", "viewUsers", users, a.viewUsers)}<label class="checkbox-row"><input type="checkbox" name="bookRestricted" ${a.bookRestricted ? "checked" : ""}/>仅指定部门或人员可预订</label>${uiMulti("可订部门", "bookDepartments", depts, a.bookDepartments)}${uiMulti("可订人员", "bookUsers", users, a.bookUsers)}${uiMulti("不可见人员", "denyViewUsers", users, a.denyViewUsers)}${uiMulti("不可订人员", "denyBookUsers", users, a.denyBookUsers)}</details>`;
  showEditDialog(id ? "编辑会议室" : "新增会议室", fields, async (f) => {
    const access = {
      viewRestricted: f.has("viewRestricted"),
      bookRestricted: f.has("bookRestricted"),
    };
    for (const k of [
      "viewDepartments",
      "bookDepartments",
      "viewUsers",
      "bookUsers",
      "denyViewUsers",
      "denyBookUsers",
    ])
      access[k] = f.getAll(k);
    await api("/rooms" + (id ? "/" + id : ""), {
      method: id ? "PUT" : "POST",
      body: JSON.stringify({
        name: f.get("name"),
        code: f.get("code"),
        floorId: f.get("floorId"),
        capacity: Number(f.get("capacity")),
        area: Number(f.get("area")),
        type: state.layoutTemplates.find(
          (t) => t.id === f.get("layoutTemplateId"),
        ).type,
        layoutTemplateId: f.get("layoutTemplateId"),
        equip: String(f.get("equip"))
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean),
        desc: f.get("desc"),
        rule: f.get("rule"),
        status: f.get("status"),
        repeat: f.has("repeat"),
        access,
      }),
    });
  });
}
function editUser(id) {
  const u = state.directory.users.find((u) => u.id === id) || {
    name: "",
    username: "",
    role: "member",
    active: true,
    department_id: null,
  };
  showEditDialog(
    id ? "编辑账号" : "新增账号",
    (!id
      ? uiField(
          "登录账号",
          "username",
          "",
          "text",
          'required pattern="[a-zA-Z0-9_.-]{2,64}" autocomplete="off"',
        )
      : "") +
      uiField("姓名", "name", u.name, "text", 'required maxlength="100"') +
      uiField("通知邮箱", "email", u.email || "", "email", 'maxlength="254"') +
      uiSelect(
        "角色",
        "role",
        [
          ["member", "员工"],
          ["admin", "管理员"],
        ],
        u.role,
      ) +
      uiSelect(
        "所属部门",
        "departmentId",
        [
          ["", "未分配部门"],
          ...state.directory.departments.map((d) => [d.id, d.name]),
        ],
        u.department_id || "",
      ) +
      uiSelect(
        "账号状态",
        "active",
        [
          ["true", "启用"],
          ["false", "停用"],
        ],
        String(u.active),
      ) +
      (!id
        ? uiField(
            "初始密码",
            "password",
            "",
            "password",
            'required minlength="10" autocomplete="new-password"',
          )
        : ""),
    async (f) => {
      await api("/users" + (id ? "/" + id : ""), {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
          name: f.get("name"),
          email: f.get("email") || null,
          role: f.get("role"),
          departmentId: f.get("departmentId") || null,
          active: f.get("active") === "true",
          ...(!id
            ? { username: f.get("username"), password: f.get("password") }
            : {}),
        }),
      });
    },
  );
}
function editDepartment(id) {
  const d = state.directory.departments.find((d) => d.id === id);
  showEditDialog(
    id ? "重命名部门" : "新增部门",
    uiField(
      "部门名称",
      "name",
      d?.name || "",
      "text",
      'required maxlength="100"',
    ),
    async (f) => {
      await api("/departments" + (id ? "/" + id : ""), {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({ name: f.get("name") }),
      });
    },
  );
}
function bindManagementForms() {
  if ($("#passwordForm"))
    $("#passwordForm").onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget),
        button = e.currentTarget.querySelector("button");
      try {
        if (f.get("newPassword") !== f.get("confirmPassword"))
          throw new Error("两次输入的新密码不一致");
        button.disabled = true;
        await api("/account/password", {
          method: "POST",
          body: JSON.stringify({
            currentPassword: f.get("currentPassword"),
            newPassword: f.get("newPassword"),
          }),
        });
        state.user = null;
        closeModal();
        showLogin();
        toast("密码已修改，请重新登录");
      } catch (error) {
        $("#passwordError").hidden = false;
        $("#passwordError").textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
}
async function handleManagementClick(node) {
  if (node.id === "newRoom" || node.dataset.editRoom) {
    editRoom(node.dataset.editRoom);
    return true;
  }
  if (node.id === "newUser" || node.dataset.editUser) {
    editUser(node.dataset.editUser);
    return true;
  }
  if (node.id === "newDepartment" || node.dataset.editDepartment) {
    editDepartment(node.dataset.editDepartment);
    return true;
  }
  if (node.dataset.resetUser) {
    showEditDialog(
      "重置密码",
      uiField(
        "新密码",
        "password",
        "",
        "password",
        'required minlength="10" autocomplete="new-password"',
      ),
      async (f) => {
        await api("/users/" + node.dataset.resetUser + "/password", {
          method: "POST",
          body: JSON.stringify({ password: f.get("password") }),
        });
      },
    );
    return true;
  }
  if (node.id === "readNotifications") {
    await api("/notifications/read", { method: "POST" });
    await refresh();
    await loadPageData("notifications");
    render();
    return true;
  }
  if (node.dataset.series) {
    node.disabled = true;
    await api(`/series/${node.dataset.series}/${node.dataset.seriesAction}`, {
      method: "POST",
    });
    await refresh();
    render();
    toast("已处理后续预订");
    return true;
  }
  return false;
}
