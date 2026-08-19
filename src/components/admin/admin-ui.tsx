import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { readableAdminError } from "./format";

/**
 * Peças repetidas do painel administrativo.
 *
 * Só aparência: nenhuma delas conhece query, mutation ou seção. A pintura vem
 * das classes `app-*` de `styles/dashboard.css`, compartilhadas com o `/app`.
 */

export type AdminTone = "ok" | "warn" | "danger" | "accent";

export function AdminCard({
  title,
  hint,
  actions,
  children,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="app-card">
      <div className="app-card-head">
        <div className="min-w-0">
          <h2 className="app-card-title">{title}</h2>
          {hint ? <p className="app-card-desc">{hint}</p> : null}
        </div>
        {actions ? <div className="flex flex-none items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function AdminStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: AdminTone;
}) {
  return (
    <div className="app-stat">
      <div className="app-stat-label">{label}</div>
      <div className="app-stat-value" data-tone={tone}>
        {value}
      </div>
      {hint ? <div className="app-stat-hint">{hint}</div> : null}
    </div>
  );
}

export function AdminAlert({
  tone = "warn",
  children,
  action,
}: {
  tone?: "info" | "warn" | "danger";
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div role="alert" className="app-alert" data-tone={tone}>
      <AlertTriangle aria-hidden="true" />
      <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
        <span>{children}</span>
        {action}
      </div>
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  return <AdminAlert tone="danger">{readableAdminError(error)}</AdminAlert>;
}

export function AdminLoading({ label = "Carregando…" }: { label?: string }) {
  return <p className="app-loading">{label}</p>;
}

export function AdminEmpty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="app-empty">
      <p className="app-empty-title">{title}</p>
      {hint ? <p>{hint}</p> : null}
    </div>
  );
}

/**
 * Confirmação inline consistente para ações destrutivas.
 * Substitui o `confirm()` nativo mantendo o design system.
 */
export function AdminConfirm({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}) {
  if (!open) return null;

  return (
    <div role="alertdialog" className="app-alert app-alert--confirm" data-tone="danger">
      <div className="flex flex-col gap-3">
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-[var(--app-ink-2)]">{message}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" className="app-btn app-btn--ghost" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`app-btn ${destructive ? "app-btn--destructive" : "app-btn--primary"}`}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Campo numérico que só persiste no `blur`: o admin digita valores longos
 * (tokens do mês, câmbio) e salvar a cada tecla dispararia uma mutation por
 * dígito.
 */
export function NumField({
  label,
  value,
  step,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  hint?: string;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  return (
    <div className="app-field">
      <label>{label}</label>
      <input
        className="app-input"
        type="number"
        value={draft}
        step={step ?? 1}
        min={0}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = +draft || 0;
          setDraft(String(v));
          if (v !== value) onChange(v);
        }}
      />
      {hint ? <span className="app-field-hint">{hint}</span> : null}
    </div>
  );
}
