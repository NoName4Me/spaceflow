import { AppButton, AppInput, AppLabel } from "./components/primitives";
import { WorkspaceDialog } from "./components/WorkspaceDialog";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Assistant, AssistantButton } from "./components/Assistant";
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
import { Workplace } from "./pages/Workplace";
import { Layouts } from "./pages/Layouts";
import { Rooms } from "./pages/Rooms";
import { Schedule } from "./pages/Schedule";
import { useDialogFocus } from "./components/useDialogFocus";
import { NavIcon } from "./components/NavIcon";
import { useWorkspace } from "./workspace";
import type { Page } from "./types";
const titles: Record<Page, string> = {
  workplace: "办公空间",
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
const nav: Page[] = [
  "explore",
  "schedule",
  "mine",
  "rooms",
  "users",
  "reservations",
  "audit",
  "approvals",
  "editor",
  "settings",
];
function NavigationFocus({
  panel,
  close,
}: {
  panel: RefObject<HTMLElement | null>;
  close: () => void;
}) {
  useDialogFocus(panel, close);
  return null;
}
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
          <AppLabel htmlFor="username">账号</AppLabel>
          <AppInput
            id="username"
            name="username"
            autoComplete="username"
            required
            autoFocus
          />
        </div>
        <div className="field">
          <AppLabel htmlFor="password">密码</AppLabel>
          <AppInput
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
        <AppButton className="button primary wide" type="submit" disabled={busy}>
          登录
        </AppButton>
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
  const [assistantOpen, setAssistantOpen] = useState(false);
  const closeAssistant = useCallback(() => {
    setAssistantOpen(false);
    document.querySelector<HTMLButtonElement>(".assistant-trigger")?.focus();
  }, []);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationPanel = useRef<HTMLElement>(null);
  const closeNavigation = useCallback(() => setNavigationOpen(false), []);
  const goTo = (next: Page) => {
    navigate(next);
    closeNavigation();
  };
  useEffect(() => {
    if (!navigationOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const wide = window.matchMedia("(min-width: 961px)");
    const onResize = () => {
      if (wide.matches) closeNavigation();
    };
    wide.addEventListener("change", onResize);
    return () => {
      document.body.style.overflow = previous;
      wide.removeEventListener("change", onResize);
    };
  }, [navigationOpen, closeNavigation]);
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
      closeNavigation();
      closeAssistant();
    }
  }, [data, closeDetail, booking.close, closeNavigation, closeAssistant]);
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
  const menu = (items: Page[]) =>
    items.map((key) => (
      <AppButton
        key={key}
        data-page={key}
        className={`nav-item ${page === key ? "active" : ""}`}
        onClick={() => goTo(key)}
        aria-current={page === key ? "page" : undefined}
      >
        <span className="nav-icon" aria-hidden="true">
          <NavIcon page={key} />
        </span>{" "}
        {titles[key]}
      </AppButton>
    ));
  return (
    <>
      {loading ? (
        <Empty>正在加载</Empty>
      ) : !data ? (
        <Login />
      ) : (
        <div id="app" className={assistantOpen ? "assistant-open" : undefined}>
          {navigationOpen && (
            <NavigationFocus panel={navigationPanel} close={closeNavigation} />
          )}
          {navigationOpen && (
            <AppButton
              className="navigation-scrim"
              aria-label="关闭导航"
              onClick={closeNavigation}
              tabIndex={-1}
            />
          )}
          <aside
            ref={navigationPanel}
            id="workspaceNavigation"
            className={`sidebar ${navigationOpen ? "navigation-open" : ""}`}
            role={navigationOpen ? "dialog" : undefined}
            aria-modal={navigationOpen || undefined}
            aria-label="工作空间导航"
          >
            <AppButton
              className="navigation-close icon-btn"
              aria-label="关闭导航菜单"
              onClick={closeNavigation}
            >
              <NavIcon page="close" />
            </AppButton>
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
            <nav id="mainnav">{menu(["workplace", ...nav.slice(0, 3)])}</nav>
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
              <AppButton
                data-page="account"
                className="button wide"
                onClick={() => goTo("account")}
              >
                账号设置
              </AppButton>
              <AppButton
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
              </AppButton>
            </div>
          </aside>
          <main className="main" inert={navigationOpen}>
            <header className="topbar">
              <div className="header-location">
                <AppButton
                  className="navigation-toggle icon-btn"
                  aria-label="打开导航菜单"
                  aria-expanded={navigationOpen}
                  aria-controls="workspaceNavigation"
                  onClick={() => setNavigationOpen(true)}
                >
                  <NavIcon page="menu" />
                </AppButton>
                <div className="breadcrumbs">
                  <span>间序 / </span>
                  <h1 id="crumb">{titles[page]}</h1>
                </div>
              </div>
              <div className="header-right">
                <AssistantButton
                  open={assistantOpen}
                  onClick={() => {
                    closeNavigation();
                    setAssistantOpen(!assistantOpen);
                  }}
                />
                <AppButton
                  className="button small"
                  id="notificationButton"
                  onClick={() => navigate("notifications")}
                >
                  {data.unread ? `通知 (${data.unread})` : "通知"}
                </AppButton>
                <AppButton
                  className="button small"
                  id="refresh"
                  onClick={() => void run(refresh)}
                >
                  刷新
                </AppButton>
              </div>
            </header>
            <div id="content">
              {page === "workplace" && <Workplace onDetail={showDetail} />}
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
          <Assistant
            key={data.user.id}
            userId={data.user.id}
            open={assistantOpen}
            onClose={closeAssistant}
            onBook={booking.open}
          />
          <WorkspaceDialog open={!!(dialog||booking.booking)} onClose={closeModal}>
            {dialog?<EditModal/>:booking.booking?<BookingForm draft={booking.booking} close={booking.close}/>:null}
          </WorkspaceDialog>
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
