import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { message } from "../api";
import { useDialogFocus } from "./useDialogFocus";
import { useWorkspace } from "../workspace";
export function Field({
  label,
  name,
  id = "edit-" + name,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} {...props} />
    </div>
  );
}
export function Select({
  label,
  name,
  options,
  value,
  multiple = false,
  disabled = false,
  id = "edit-" + name,
}: {
  label: string;
  name: string;
  options: [string, string][];
  value?: string | string[];
  multiple?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        name={name}
        defaultValue={value}
        multiple={multiple}
        size={multiple ? 3 : undefined}
        disabled={disabled}
      >
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}
export function Empty({ children = "暂无记录" }: { children?: ReactNode }) {
  return <div className="empty-box">{children}</div>;
}
export function Tools({ children }: { children: ReactNode }) {
  return <div className="page-tools">{children}</div>;
}
export function EditModal() {
  const { dialog, setDialog, refresh, notify } = useWorkspace();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setDialog(null), [setDialog]);
  useDialogFocus(panel, close);
  if (!dialog) return null;
  return (
    <div ref={panel}>
      <div className="modal-top">
        <h2 id="modalTitle">{dialog.title}</h2>
        <button
          className="icon-btn"
          id="closeModal"
          aria-label="关闭"
          onClick={() => setDialog(null)}
        >
          ×
        </button>
      </div>
      <div id="modalBody">
        <form
          id="editForm"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const data = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await dialog.save(data);
              await refresh();
              setDialog(null);
              notify("已保存");
            } catch (error) {
              setError(message(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="form-grid">{dialog.content}</div>
          <p className="alert" id="editError" role="alert" hidden={!error}>
            {error}
          </p>
          <div className="form-foot">
            <button
              className="button"
              type="button"
              id="cancelModal"
              onClick={() => setDialog(null)}
            >
              取消
            </button>
            <button className="button primary" type="submit" disabled={busy}>
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
export function CheckAll({
  checked,
  mixed,
  onChange,
}: {
  checked: boolean;
  mixed: boolean;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <input
      ref={ref}
      type="checkbox"
      id="roomSelectAll"
      aria-label="选择当前列表全部会议室"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}
