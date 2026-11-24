import { AppButton, AppInput, AppSelect, AppLabel } from "./primitives";
import {
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { message } from "../api";
import { DialogTitle } from "./ui/dialog";
import { Skeleton } from "./ui/skeleton";
import { useWorkspace } from "../workspace";
export function Field({
  label,
  name,
  id = "edit-" + name,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  return (
    <div className="field">
      <AppLabel htmlFor={id}>{label}</AppLabel>
      <AppInput id={id} name={name} {...props} />
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
      <AppLabel htmlFor={id}>{label}</AppLabel>
      <AppSelect
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
      </AppSelect>
    </div>
  );
}
export function Empty({ children = "暂无记录" }: { children?: ReactNode }) {
  return <div className="empty-box">{children==="正在加载"?<div role="status" className="sf-loading"><Skeleton className="h-4 w-36"/><Skeleton className="h-4 w-52"/><span className="sr-only">正在加载</span></div>:children}</div>;
}
export function Tools({ children }: { children: ReactNode }) {
  return <div className="page-tools">{children}</div>;
}
export function EditModal() {
  const { dialog, setDialog, refresh, notify } = useWorkspace();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!dialog) return null;
  return (
    <div>
      <div className="modal-top">
        <DialogTitle id="modalTitle">{dialog.title}</DialogTitle>
        <AppButton
          className="icon-btn"
          id="closeModal"
          aria-label="关闭"
          onClick={() => setDialog(null)}
        >
          ×
        </AppButton>
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
            <AppButton
              className="button"
              type="button"
              id="cancelModal"
              onClick={() => setDialog(null)}
            >
              取消
            </AppButton>
            <AppButton className="button primary" type="submit" disabled={busy}>
              保存
            </AppButton>
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
    <AppInput
      ref={ref}
      type="checkbox"
      id="roomSelectAll"
      aria-label="选择当前列表全部会议室"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}
