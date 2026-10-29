import { AlertTriangle, CheckCircle2, Info, Leaf, X, XCircle } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { getImage } from '../db/repo';
import { pushBackHandler } from '../services/native';

export function Spinner({ label = 'Carregando' }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function Button({
  loading, variant = 'default', size, block, children, className = '', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean; variant?: 'default' | 'primary' | 'soft' | 'ghost' | 'danger' | 'white'; size?: 'sm' | 'icon'; block?: boolean;
}) {
  const cls = ['btn', variant !== 'default' && `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} disabled={loading || rest.disabled} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function Field({
  label, error, hint, id, children,
}: { label: ReactNode; error?: string | null; hint?: ReactNode; id: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <span className="field-error" id={`${id}-err`} role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function TextInput({
  label, error, hint, ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string | null; hint?: ReactNode }) {
  const auto = useId();
  const id = rest.id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} id={id}>
      <input className="input" id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} {...rest} />
    </Field>
  );
}

export function Alert({ kind = 'info', title, children }: { kind?: 'info' | 'warning' | 'danger' | 'success'; title?: ReactNode; children?: ReactNode }) {
  const Icon = kind === 'warning' ? AlertTriangle : kind === 'danger' ? XCircle : kind === 'success' ? CheckCircle2 : Info;
  return (
    <div className={`alert ${kind}`} role={kind === 'danger' ? 'alert' : undefined}>
      <Icon size={18} aria-hidden />
      <div className="alert-body stack-sm">
        {title ? <strong>{title}</strong> : null}
        {children ? <div className="small">{children}</div> : null}
      </div>
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="icon">{icon ?? <Leaf size={28} />}</div>
      <h3>{title}</h3>
      {children ? <p className="small">{children}</p> : null}
      {action}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    const popBack = pushBackHandler(onClose);
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not([aria-label="Fechar"])')?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      popBack();
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} ref={ref}>
        <div className="modal-header">
          <h2>{title}</h2>
          <Button size="icon" variant="ghost" aria-label="Fechar" onClick={onClose}><X size={20} /></Button>
        </div>
        {children}
        {footer ? <div className="row mt" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>{footer}</div> : null}
      </div>
    </div>
  );
}

export function useConfirm() {
  const [state, setState] = useState<{ title: string; text: string; confirm: string; danger: boolean; resolve: (v: boolean) => void } | null>(null);
  const ask = (title: string, text: string, opts: { confirm?: string; danger?: boolean } = {}) =>
    new Promise<boolean>((resolve) => setState({ title, text, confirm: opts.confirm ?? 'Confirmar', danger: opts.danger ?? false, resolve }));
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const node = (
    <Modal
      open={!!state}
      onClose={() => close(false)}
      title={state?.title ?? ''}
      footer={<>
        <Button onClick={() => close(false)}>Cancelar</Button>
        <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{state?.confirm}</Button>
      </>}
    >
      <p className="muted">{state?.text}</p>
    </Modal>
  );
  return { ask, node };
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

/** Exibe uma imagem salva no IndexedDB (gera e libera a URL temporária). */
export function StoredImg({ id, alt, className, fallback }: { id?: string; alt: string; className?: string; fallback?: ReactNode }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false;
    let u: string | null = null;
    if (id) {
      getImage(id).then((img) => {
        if (img && !revoked) {
          u = URL.createObjectURL(img.blob);
          setUrl(u);
        }
      }).catch(() => undefined);
    }
    return () => {
      revoked = true;
      if (u) URL.revokeObjectURL(u);
      setUrl(null);
    };
  }, [id]);
  if (!url) return <>{fallback ?? null}</>;
  return <img src={url} alt={alt} className={className} />;
}

export function Skeleton({ h = 18, w = '100%' }: { h?: number; w?: number | string }) {
  return <div className="skeleton" style={{ height: h, width: w }} aria-hidden />;
}

export function PageLoading() {
  return (
    <div className="page stack" aria-busy="true">
      <Skeleton h={34} w="50%" />
      <Skeleton h={140} />
      <Skeleton h={220} />
    </div>
  );
}

export function SourceBadge({ source }: { source: 'rotulo' | 'base' | 'estimativa_ia' | 'manual' }) {
  const map = {
    rotulo: ['blue', 'Rótulo'],
    base: ['green', 'Base nutricional'],
    estimativa_ia: ['amber', 'Estimativa IA'],
    manual: ['', 'Informado por você'],
  } as const;
  const [color, label] = map[source];
  return <span className={`badge ${color}`}>{label}</span>;
}

export function EducationalNotice({ compact }: { compact?: boolean }) {
  return (
    <p className={compact ? 'tiny muted' : 'small muted'}>
      Conteúdo educativo. Não substitui a avaliação de um(a) nutricionista ou médico(a).
    </p>
  );
}
