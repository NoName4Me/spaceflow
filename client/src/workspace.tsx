import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiError, api, message } from "./api";
import { initialFilters } from "./model";
import type { Page, Workspace } from "./types";
export interface EditDialog {
  title: string;
  content: ReactNode;
  save: (form: FormData) => Promise<void>;
}
function useWorkspaceState() {
  const [data, setData] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>("explore");
  const [filters, setFilters] = useState(initialFilters);
  const [revision, setRevision] = useState(0);
  const [toast, setToast] = useState("");
  const [dialog, setDialog] = useState<EditDialog | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const session = useRef(0);
  const refreshRequest = useRef(0);
  const notify = useCallback((text: string) => {
    setToast(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 2800);
  }, []);
  const reset = useCallback(() => {
    session.current++;
    setData(null);
    setDialog(null);
    setPage("explore");
    setFilters(initialFilters());
  }, []);
  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      try {
        return await api<T>(path, init);
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status === 401 &&
          path !== "/login"
        )
          reset();
        throw error;
      }
    },
    [reset],
  );
  const refresh = useCallback(async () => {
    const current = session.current,
      sequence = ++refreshRequest.current;
    const next = await request<Workspace>("/state");
    if (current === session.current && sequence === refreshRequest.current) {
      setData(next);
      setRevision((r) => r + 1);
    }
    return next;
  }, [request]);
  useEffect(() => {
    void refresh()
      .catch((error) => {
        if (!(error instanceof ApiError && error.status === 401))
          notify(message(error));
      })
      .finally(() => setLoading(false));
    return () => clearTimeout(timer.current);
  }, [refresh, notify]);
  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      notify(message(error));
    }
  };
  const navigate = (next: Page) => {
    setPage(next);
    window.scrollTo({ top: 0 });
  };
  return {
    data,
    loading,
    page,
    navigate,
    filters,
    setFilters,
    revision,
    refresh,
    request,
    notify,
    run,
    reset,
    toast,
    dialog,
    setDialog,
  };
}
type WorkspaceContext = ReturnType<typeof useWorkspaceState>;
const Context = createContext<WorkspaceContext | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const state = useWorkspaceState();
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function useWorkspace() {
  const state = useContext(Context);
  if (!state) throw Error("WorkspaceProvider missing");
  return state;
}
// Each resource owns cancellation and ignores an older response after a route/parameter change.
export function useResource<T>(path: string | null, initial: T) {
  const { request, revision, notify } = useWorkspace();
  const [result, setResult] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void request<T>(path, { signal: controller.signal })
      .then((next) => {
        if (!controller.signal.aborted) setResult(next);
      })
      .catch((error) => {
        if (!controller.signal.aborted) notify(message(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision, request, notify]);
  return { result, loading };
}
