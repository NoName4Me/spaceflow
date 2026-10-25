import { useState } from "react";
import { json, message } from "../api";
import { Empty, Field, Select, Tools } from "../components/ui";
import { roomStatusLabels, ruleLabels, statusLabels, value } from "../model";
import { useResource, useWorkspace } from "../workspace";
import type {
  Audit,
  Directory,
  DirectoryUser,
  Notification,
  Room,
} from "../types";
export function Users() {
  const { setDialog, request } = useWorkspace();
  const { result: directory, loading } = useResource<Directory>(
    "/admin/directory",
    { users: [], departments: [] },
  );
  const editDepartment = (id?: string) =>
    setDialog({
      title: id ? "重命名部门" : "新增部门",
      content: (
        <Field
          label="部门名称"
          name="name"
          defaultValue={
            directory.departments.find((d) => d.id === id)?.name || ""
          }
          required
          maxLength={100}
        />
      ),
      save: async (f) => {
        await request(
          `/departments${id ? "/" + id : ""}`,
          json({ name: value(f, "name") }, id ? "PUT" : "POST"),
        );
      },
    });
  const editUser = (u?: DirectoryUser) =>
    setDialog({
      title: u ? "编辑账号" : "新增账号",
      content: (
        <>
          {!u && (
            <Field
              label="登录账号"
              name="username"
              required
              pattern="[a-zA-Z0-9_.-]{2,64}"
              autoComplete="off"
            />
          )}
          <Field
            label="姓名"
            name="name"
            defaultValue={u?.name || ""}
            required
            maxLength={100}
          />
          <Field
            label="通知邮箱"
            name="email"
            type="email"
            defaultValue={u?.email || ""}
            maxLength={254}
          />
          <Select
            label="角色"
            name="role"
            options={[
              ["member", "员工"],
              ["admin", "管理员"],
            ]}
            value={u?.role || "member"}
          />
          <Select
            label="所属部门"
            name="departmentId"
            options={[
              ["", "未分配部门"],
              ...directory.departments.map(
                (d) => [d.id, d.name] as [string, string],
              ),
            ]}
            value={u?.department_id || ""}
          />
          <Select
            label="账号状态"
            name="active"
            options={[
              ["true", "启用"],
              ["false", "停用"],
            ]}
            value={String(u?.active ?? true)}
          />
          {!u && (
            <Field
              label="初始密码"
              name="password"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
            />
          )}
        </>
      ),
      save: async (f) => {
        await request(
          `/users${u ? "/" + u.id : ""}`,
          json(
            {
              name: value(f, "name"),
              email: value(f, "email") || null,
              role: value(f, "role"),
              departmentId: value(f, "departmentId") || null,
              active: value(f, "active") === "true",
              ...(!u
                ? {
                    username: value(f, "username"),
                    password: value(f, "password"),
                  }
                : {}),
            },
            u ? "PUT" : "POST",
          ),
        );
      },
    });
  return (
    <section className="page" aria-busy={loading}>
      <Tools>
        <button
          className="button"
          id="newDepartment"
          disabled={loading}
          onClick={() => editDepartment()}
        >
          ＋ 新增部门
        </button>
        <button
          className="button primary"
          id="newUser"
          disabled={loading}
          onClick={() => editUser()}
        >
          ＋ 新增账号
        </button>
      </Tools>
      <div className="panel">
        <div className="panel-title">
          <h2>账号</h2>
        </div>
        <div className="management-list">
          {directory.users.map((u) => (
            <article className="management-row" key={u.id}>
              <div>
                <h3>
                  {u.name} <small>{u.active ? "启用" : "停用"}</small>
                </h3>
                <p>
                  {u.username} · {u.role === "admin" ? "管理员" : "员工"} ·{" "}
                  {u.department || "未分配部门"}
                </p>
              </div>
              <div className="row-actions">
                <button
                  className="button small"
                  data-edit-user={u.id}
                  onClick={() => editUser(u)}
                >
                  编辑
                </button>
                <button
                  className="button small"
                  onClick={() =>
                    setDialog({
                      title: "重置密码",
                      content: (
                        <Field
                          label="新密码"
                          name="password"
                          type="password"
                          required
                          minLength={10}
                          autoComplete="new-password"
                        />
                      ),
                      save: async (f) => {
                        await request(
                          `/users/${u.id}/password`,
                          json({ password: value(f, "password") }),
                        );
                      },
                    })
                  }
                >
                  重置密码
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
      <div className="panel section-gap">
        <div className="panel-title">
          <h2>部门</h2>
        </div>
        <div className="management-list">
          {directory.departments.map((d) => (
            <article className="management-row" key={d.id}>
              <span>{d.name}</span>
              <button
                className="button small"
                onClick={() => editDepartment(d.id)}
              >
                重命名
              </button>
            </article>
          ))}
          {!directory.departments.length && <Empty>暂无部门</Empty>}
        </div>
      </div>
    </section>
  );
}
export function Account() {
  const { data, request, refresh, reset, notify } = useWorkspace();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [emailBusy, setEmailBusy] = useState(false);
  return (
    <section className="page">
      <form
        id="passwordForm"
        className="panel compact-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            if (f.get("newPassword") !== f.get("confirmPassword"))
              throw Error("两次输入的新密码不一致");
            await request(
              "/account/password",
              json({
                currentPassword: value(f, "currentPassword"),
                newPassword: value(f, "newPassword"),
              }),
            );
            reset();
            notify("密码已修改，请重新登录");
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field
          label="当前密码"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
        />
        <Field
          label="新密码"
          name="newPassword"
          type="password"
          required
          minLength={10}
          maxLength={256}
          autoComplete="new-password"
        />
        <Field
          label="确认新密码"
          name="confirmPassword"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
        />
        <p className="alert" id="passwordError" role="alert" hidden={!error}>
          {error}
        </p>
        <button className="button primary" type="submit" disabled={busy}>
          修改密码并重新登录
        </button>
      </form>
      <form
        id="emailForm"
        className="panel compact-form section-gap"
        onSubmit={async (e) => {
          e.preventDefault();
          if (emailBusy) return;
          const f = new FormData(e.currentTarget);
          setEmailBusy(true);
          try {
            await request(
              "/account/email",
              json({ email: value(f, "email") || null }, "PUT"),
            );
            await refresh();
            notify("通知邮箱已保存");
          } catch (e) {
            notify(message(e));
          } finally {
            setEmailBusy(false);
          }
        }}
      >
        <Field
          label="通知邮箱"
          name="email"
          type="email"
          defaultValue={data?.user.email || ""}
          maxLength={254}
        />
        <button className="button primary" type="submit" disabled={emailBusy}>
          保存通知邮箱
        </button>
      </form>
    </section>
  );
}
const actionLabels: Record<string, string> = {
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
export function AuditPage() {
  const { result: rows } = useResource<Audit[]>("/audit", []);
  return (
    <section className="page">
      <div className="panel management-list">
        {rows.map((a) => (
          <article className="management-row" key={a.id}>
            <div>
              <h3>{actionLabels[a.action] || a.action}</h3>
              <p>
                {a.name || "系统"} ·{" "}
                {new Date(a.created_at).toLocaleString("zh-CN")}
              </p>
              <small className="record-id">{a.target_name}</small>
            </div>
          </article>
        ))}
        {!rows.length && <Empty>暂无操作记录</Empty>}
      </div>
    </section>
  );
}
export function Notifications() {
  const { result: rows } = useResource<Notification[]>("/notifications", []);
  const { request, refresh, run } = useWorkspace();
  return (
    <section className="page">
      <Tools>
        <button
          className="button"
          onClick={() =>
            void run(async () => {
              await request("/notifications/read", { method: "POST" });
              await refresh();
            })
          }
        >
          全部标为已读
        </button>
      </Tools>
      <div className="panel management-list">
        {rows.map((n) => (
          <article
            className={`management-row ${n.read_at ? "" : "unread"}`}
            key={n.id}
          >
            <div>
              <h3>
                {n.title} · {statusLabels[n.status]}
              </h3>
              <p>
                {n.room} · {n.start}
              </p>
              <small>{new Date(n.created_at).toLocaleString("zh-CN")}</small>
            </div>
            {!n.read_at && <span className="unread-dot" aria-label="未读" />}
          </article>
        ))}
        {!rows.length && <Empty>暂无通知</Empty>}
      </div>
    </section>
  );
}
export function Settings() {
  const { data, request, refresh, notify } = useWorkspace(),
    [busy, setBusy] = useState("");
  async function policy(
    r: Room,
    patch: Partial<Pick<Room, "rule" | "status">>,
  ) {
    setBusy(r.id);
    try {
      await request(
        `/rooms/${r.id}/policy`,
        json({ rule: r.rule, status: r.status, ...patch }, "PUT"),
      );
      await refresh();
      notify("规则已保存");
    } catch (e) {
      notify(message(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="page">
      <div className="rules-grid">
        {data?.rooms.map((r) => (
          <article className="rule-card" key={r.id}>
            <div className="rule-head">
              <b>{r.name}会议室</b>
              <span>{r.code}</span>
            </div>
            <div className="field">
              <label htmlFor={"rule-" + r.id}>预订方式</label>
              <select
                id={"rule-" + r.id}
                data-rule={r.id}
                value={r.rule}
                disabled={busy === r.id}
                onChange={(e) =>
                  void policy(r, { rule: e.target.value as Room["rule"] })
                }
              >
                {Object.entries(ruleLabels).map(([k, v]) => (
                  <option value={k} key={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={"status-" + r.id}>开放状态</label>
              <select
                id={"status-" + r.id}
                data-status={r.id}
                value={r.status}
                disabled={busy === r.id}
                onChange={(e) =>
                  void policy(r, { status: e.target.value as Room["status"] })
                }
              >
                {Object.entries(roomStatusLabels).map(([k, v]) => (
                  <option value={k} key={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
