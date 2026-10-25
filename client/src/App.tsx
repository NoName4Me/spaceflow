import { useCallback, useEffect, useState } from "react";
import { json, message } from "./api";
import { EditModal, Empty } from "./components/ui";
import {
  Account,
  AuditPage,
  Notifications,
  Settings,
  Users,
} from "./pages/Management";
import { BookingForm, Bookings, useBookingActions } from "./pages/Bookings";
import { Discovery, RoomDetail } from "./pages/Discovery";
import { Layouts } from "./pages/Layouts";
import { Rooms } from "./pages/Rooms";
import { Schedule } from "./pages/Schedule";
import { useWorkspace } from "./workspace";
import type { Page } from "./types";
const titles: Record<Page, string> = {
  explore: "空间发现",
  schedule: "预订日程",
  mine: "我的预订",
  rooms: "会议室管理",
  users: "账号与部门",
  reservations: "预订管理",
  audit: "操作记录",
  approvals: "预订审批",
  editor: "布局管理",
  settings: "预订规则",
  account: "账号设置",
  notifications: "通知",
};
const nav: [Page, string][] = [
  ["explore", "◫"],
  ["schedule", "▦"],
  ["mine", "▤"],
  ["rooms", "▣"],
  ["users", "♙"],
  ["reservations", "▤"],
  ["audit", "≡"],
  ["approvals", "✓"],
  ["editor", "⌗"],
  ["settings", "⚙"],
];
function Login() {
  const { request, refresh } = useWorkspace(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div id="login">
      <form
        id="loginForm"
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const form = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            await request("/login", json(Object.fromEntries(form)));
            await refresh();
          } catch (error) {
            setError(message(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className="eyebrow">SPACEFLOW</span>
        <h1>间序</h1>
        <p className="subtext">登录工作空间</p>
        <div className="field">
          <label htmlFor="username">账号</label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor="password">密码</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <p id="loginError" className="alert" role="alert" hidden={!error}>
          {error}
        </p>
        <button className="button primary wide" type="submit" disabled={busy}>
          登录
        </button>
      </form>
    </div>
  );
}
export function App() {
  const {
    data,
    loading,
    page,
    navigate,
    request,
    refresh,
    reset,
    toast,
    dialog,
    setDialog,
    run,
    notify,
  } = useWorkspace();
  const booking = useBookingActions(),
    [detail, setDetail] = useState<string | null>(null);
  const closeDetail = useCallback(() => setDetail(null), []);
  useEffect(() => {
    document.body.classList.toggle("logged-out", !data);
    document.title = data
      ? `${titles[page]} · 间序 Spaceflow`
      : "间序 Spaceflow";
  }, [data, page]);
  useEffect(() => {
    if (!data) {
      closeDetail();
      booking.close();
    }
  }, [data, closeDetail, booking.close]);
  const showDetail = (id: string) =>
    void run(async () => {
      const current = await refresh();
      if (!current.rooms.some((r) => r.id === id)) {
        notify("该会议室当前不可见");
        return;
      }
      setDetail(id);
    });
  const closeModal = () => {
    setDialog(null);
    booking.close();
  };
  const admin = data?.user.role === "admin";
  const menu = (items: typeof nav) =>
    items.map(([key, icon]) => (
      <button
        key={key}
        data-page={key}
        className={`nav-item ${page === key ? "active" : ""}`}
        onClick={() => navigate(key)}
      >
        <span className="nav-icon" aria-hidden="true">
          {icon}
        </span>{" "}
        {titles[key]}
      </button>
    ));
  return (
    <>
      {loading ? (
        <Empty>正在加载</Empty>
      ) : !data ? (
        <Login />
      ) : (
        <div id="app">
          <aside className="sidebar">
            <div className="brand">
              <span className="brand-mark">
                <i />
                <i />
                <i />
                <i />
              </span>
              <div>
                <strong>间序</strong>
                <small>SPACEFLOW</small>
              </div>
            </div>
            <div className="sidebar-label">预订</div>
            <nav id="mainnav">{menu(nav.slice(0, 3))}</nav>
            <div
              className="sidebar-label admin-label admin-only"
              hidden={!admin}
            >
              管理
            </div>
            <nav className="admin-only" hidden={!admin}>
              {menu(nav.slice(3))}
            </nav>
            <div className="side-bottom">
              <div className="user-chip">
                <span className="avatar">间</span>
                <span>
                  <b id="userName">{data.user.name}</b>
                  <small id="userRole">{admin ? "空间管理员" : "员工"}</small>
                </span>
              </div>
              <button
                data-page="account"
                className="button wide"
                onClick={() => navigate("account")}
              >
                账号设置
              </button>
              <button
                id="logout"
                className="button wide"
                onClick={() =>
                  void run(async () => {
                    await request("/logout", { method: "POST" });
                    reset();
                  })
                }
              >
                退出登录
              </button>
            </div>
          </aside>
          <main className="main">
            <header className="topbar">
              <div className="breadcrumbs">
                <span>间序 / </span>
                <h1 id="crumb">{titles[page]}</h1>
              </div>
              <div className="header-right">
                <button
                  className="button small"
                  id="notificationButton"
                  onClick={() => navigate("notifications")}
                >
                  {data.unread ? `通知 (${data.unread})` : "通知"}
                </button>
                <button
                  className="button small"
                  id="refresh"
                  onClick={() => void run(refresh)}
                >
                  刷新
                </button>
              </div>
            </header>
            <div id="content">
              {page === "explore" && <Discovery onDetail={showDetail} />}
              {page === "schedule" && (
                <Schedule
                  onBook={booking.open}
                  onEdit={booking.edit}
                  onDetail={showDetail}
                />
              )}
              {page === "mine" && (
                <Bookings mode="mine" onEdit={booking.edit} />
              )}
              {admin && page === "rooms" && <Rooms />}
              {admin && page === "users" && <Users />}
              {admin && page === "reservations" && (
                <Bookings mode="reservations" onEdit={booking.edit} />
              )}
              {admin && page === "audit" && <AuditPage />}
              {admin && page === "approvals" && (
                <Bookings mode="approvals" onEdit={booking.edit} />
              )}
              {admin && page === "editor" && <Layouts />}
              {admin && page === "settings" && <Settings />}
              {page === "account" && <Account />}
              {page === "notifications" && <Notifications />}
            </div>
          </main>
          <div
            className={`modal-backdrop ${dialog || booking.booking ? "open" : ""}`}
            id="modal"
            aria-hidden={!dialog && !booking.booking}
            onClick={(e) => {
              if (e.target === e.currentTarget) closeModal();
            }}
          >
            <div
              className="modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="modalTitle"
            >
              {dialog ? (
                <EditModal />
              ) : booking.booking ? (
                <BookingForm draft={booking.booking} close={booking.close} />
              ) : null}
            </div>
          </div>
          {detail && (
            <RoomDetail id={detail} close={closeDetail} onBook={booking.open} />
          )}
        </div>
      )}
      <div
        className={`toast ${toast ? "show" : ""}`}
        id="toast"
        role="status"
        aria-live="polite"
      >
        {toast}
      </div>
    </>
  );
}
