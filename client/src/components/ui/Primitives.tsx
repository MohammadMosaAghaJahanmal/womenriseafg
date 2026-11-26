import { createContext, useContext, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type MouseEvent, type ReactElement, type ReactNode, type SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import * as Tabs from '@radix-ui/react-tabs';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AlertCircle, BookOpen, ChevronDown, ChevronLeft, ChevronRight, FileSearch, Search, X } from 'lucide-react';
import './primitives.css';

// Adapted from the MIT-licensed shadcn/ui Button. Project color semantics live in primitives.css.
const buttonVariants = cva('ui-btn', {
  variants: { variant: { primary: 'ui-btn--primary', secondary: 'ui-btn--secondary', ghost: 'ui-btn--ghost' } },
  defaultVariants: { variant: 'primary' },
});
const PanelContext = createContext<{ close: () => void; container: HTMLDialogElement | null } | undefined>(undefined);

export function Button({ variant, asChild = false, type = 'button', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button';
  return <Component {...props} type={asChild ? undefined : type} data-slot="button" className={twMerge(clsx(buttonVariants({ variant }), className))} />;
}

export function IconButton({ label, children, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & { label: string }) {
  const panel = useContext(PanelContext);
  return (
    <Tooltip.Provider delayDuration={400}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild><Button {...props} variant="ghost" className="ui-icon-btn" aria-label={label}>{children}</Button></Tooltip.Trigger>
        <Tooltip.Portal container={panel?.container}><Tooltip.Content className="ui-tooltip" sideOffset={6}>{label}</Tooltip.Content></Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="ui-badge">{children}</span>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`ui-card ${className}`}>{children}</div>;
}

export function InputField({ label, id: providedId, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  return <label className="ui-field" htmlFor={id}><span>{label}</span><span className="ui-input-wrap">{props.type === 'search' && <Search size={17} aria-hidden="true" />}<input {...props} id={id} /></span></label>;
}

export function SelectField({ label, id: providedId, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  return <div className="ui-field"><label htmlFor={id}>{label}</label><span className="ui-select-wrap"><select {...props} id={id}>{children}</select><ChevronDown size={15} aria-hidden="true" /></span></div>;
}

export function StatePanel({ kind, title, description, children }: { kind: 'loading' | 'empty' | 'error'; title: string; description?: string; children?: ReactNode }) {
  const Icon = kind === 'error' ? AlertCircle : FileSearch;
  return <div className="ui-state" role={kind === 'error' ? 'alert' : 'status'}>
    {kind === 'loading'
      ? <span className="ui-skeleton" aria-hidden="true"><i /><i /></span>
      : <Icon className="ui-state-icon" size={24} aria-hidden="true" />}
    <strong>{title}</strong>{description && <p>{description}</p>}{children}
  </div>;
}

function onBackdrop(event: MouseEvent<HTMLDialogElement>) {
  if (event.target !== event.currentTarget) return false;
  const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
  return event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom;
}

export function PanelDialog({ title, description, trigger, closeLabel, children, drawer = false, open, onOpenChange }: {
  title: string; description?: string; trigger: ReactElement; closeLabel: string; children: ReactNode; drawer?: boolean;
  open?: boolean; onOpenChange?: (value: boolean) => void;
}) {
  const id = useId();
  const panel = useRef<HTMLDialogElement>(null);
  const startedOnBackdrop = useRef(false);
  const [localOpen, setLocalOpen] = useState(false);
  const shown = open ?? localOpen;
  const titleId = id + '-title';
  const descriptionId = id + '-description';

  function change(next: boolean) {
    if (open === undefined) setLocalOpen(next);
    onOpenChange?.(next);
  }

  useLayoutEffect(() => {
    const dialog = panel.current;
    if (!shown || !dialog) return;
    const owner = dialog.ownerDocument;
    const opener = owner.activeElement;
    const main = opener?.closest('main');
    dialog.showModal();
    return () => {
      dialog.close();
      // A successful operation can replace its trigger during this commit.
      if (main) queueMicrotask(() => {
        if (!opener?.isConnected && main.isConnected && owner.activeElement === owner.body) {
          main.focus({ preventScroll: true });
        }
      });
    };
  }, [shown]);

  return <>
    <Slot aria-haspopup="dialog" aria-expanded={shown} aria-controls={id} onClick={event => {
      if (event.defaultPrevented) return;
      event.currentTarget.focus({ preventScroll: true });
      change(true);
    }}>{trigger}</Slot>
    {createPortal(<dialog ref={panel} id={id} className={drawer ? 'ui-dialog ui-drawer' : 'ui-dialog'}
      aria-labelledby={shown ? titleId : undefined} aria-describedby={shown && description ? descriptionId : undefined}
      onCancel={event => { event.preventDefault(); change(false); }}
      onPointerDown={event => { startedOnBackdrop.current = onBackdrop(event); }}
      onClick={event => {
        if (startedOnBackdrop.current && onBackdrop(event)) change(false);
        startedOnBackdrop.current = false;
      }}>
      {shown && <PanelContext.Provider value={{ close: () => change(false), container: panel.current }}>
        <div className="ui-dialog-heading"><h2 id={titleId}>{title}</h2>
          <DialogClose className="ui-btn ui-btn--ghost ui-icon-btn" aria-label={closeLabel}><X size={20} aria-hidden="true" /></DialogClose>
        </div>
        {description && <p id={descriptionId} className="ui-dialog-copy">{description}</p>}{children}
      </PanelContext.Provider>}
    </dialog>, document.body)}
  </>;
}

export function DialogClose({ asChild = false, type = 'button', onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  const panel = useContext(PanelContext);
  const Component = asChild ? Slot : 'button';
  return <Component {...props} type={asChild ? undefined : type} onClick={event => {
    onClick?.(event);
    if (!event.defaultPrevented) panel?.close();
  }} />;
}

export function SectionTabs({ label, value, onValueChange, dir, items }: {
  label: string; value: string; onValueChange: (value: string) => void; dir: 'ltr' | 'rtl';
  items: { value: string; label: string; content: ReactNode }[];
}) {
  return <Tabs.Root value={value} dir={dir} onValueChange={onValueChange}>
    <Tabs.List className="ui-tabs" aria-label={label}>{items.map(item => <Tabs.Trigger key={item.value} className="ui-tab" value={item.value}>{item.label}</Tabs.Trigger>)}</Tabs.List>
    {items.map(item => <Tabs.Content className="ui-tabpanel" key={item.value} value={item.value}>{item.content}</Tabs.Content>)}
  </Tabs.Root>;
}

export function ResourceCard({ title, description, label, icon, onOpen }: { title: string; description: string; label: string; icon?: ReactNode; onOpen: () => void }) {
  return <button type="button" className="ui-resource" onClick={onOpen}>
    <span className="ui-resource-art">{icon ?? <BookOpen />}</span><span className="ui-resource-type">{label}</span>
    <strong>{title}</strong><span className="ui-resource-copy">{description}</span>
  </button>;
}

export function Pagination({ page, pages, pageLabel, previous, next, label, onChange }: {
  page: number; pages: number; pageLabel: string; previous: string; next: string; label: string; onChange: (page: number) => void;
}) {
  return <nav aria-label={label} className="ui-pagination"><span aria-live="polite">{pageLabel}</span>
    <div><IconButton label={previous} disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft className="ui-direction" /></IconButton>
      <IconButton label={next} disabled={page >= pages} onClick={() => onChange(page + 1)}><ChevronRight className="ui-direction" /></IconButton></div>
  </nav>;
}

export function ProgressIndicator({ value, label }: { value: number; label: string }) {
  return <progress className="ui-progress" value={value} max={100} aria-label={label} />;
}

export function Toast({ message }: { message: string }) {
  return <div className={message ? 'ui-toast' : 'ui-toast ui-toast--idle'} role="status" aria-live="polite" aria-atomic="true">{message}</div>;
}
