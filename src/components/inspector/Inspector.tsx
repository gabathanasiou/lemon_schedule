import React from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { SectionHeader, Seg, TB_BTN, TB_INPUT, TB_PICKER, TB_TOGGLE, TB_TOGGLE_OFF, TB_TOGGLE_ON } from '@gabriel/ui-kit';
import Checkbox from '../Checkbox';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import { LiveNumberInput } from '../LiveNumberInput';

/**
 * Inspector control system (roadmap 373) — the shared grammar for every
 * inspector row/group/section. Read `docs/DESIGN-LANGUAGE.md`
 * §Inspector & control rows before changing these.
 *
 * THREE levels:
 *   Row   — one concept: a 42px label column + the control column.
 *   Group — related controls; wraps BETWEEN its sub-groups when the row is
 *           too narrow.
 *   Sub   — an atomic pair (toggle + swatch, W + R). Never splits.
 *
 * Surfaces come from `InspectorSurfaceContext`: `panel` (docked rail) and
 * `bar` (floating chrome). Custom JSX is always allowed — the tiny control
 * registry below only removes copies of the repeated kinds.
 */

export type InspectorSurface = 'panel' | 'bar';

export const InspectorSurfaceContext = React.createContext<InspectorSurface>('bar');

export const useInspectorSurface = (): InspectorSurface => React.useContext(InspectorSurfaceContext);

// Spacing scale: 2/4/6/8/12/16/24/32 only.
const SECTION_STACK = 'flex flex-col gap-4 min-w-0';
const ROW_STACK = 'flex flex-col gap-2 min-w-0';
const ROW_CONTROLS = 'flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-2';
const GROUP = 'flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-2';
export const INSPECTOR_LABEL_CLS =
  'text-[length:calc(10px*var(--inspector-text-scale,1))] font-medium text-[color:var(--ui-text-muted)] truncate';
export const INSPECTOR_VALUE_CLS = 'text-[10px] text-[color:var(--ui-text-muted)] truncate';

/** Compact (24px) variant of a kit chrome class, derived from the kit recipe. */
const compactOf = (cls: string) => (cls.includes('h-7') ? cls.replace('h-7', 'h-6') : cls);

// ---- levels -------------------------------------------------------------------

export interface InspectorSectionProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

/** A section: a raised card with an eyebrow + hairline rule and rows. The bar
 *  keeps the same card but lays its label + controls inline. */
export const InspectorSection: React.FC<InspectorSectionProps> = ({ label, children, className = '' }) => {
  const surface = useInspectorSurface();
  if (surface === 'bar') {
    return (
      <section
        className={`flex min-w-0 flex-wrap items-center gap-2 rounded-[var(--ui-radius-btn)] border border-[var(--ui-border)] bg-[var(--ui-card-band)] px-2.5 py-2 ${className}`}
        aria-label={label}
      >
        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-[color:var(--ui-text-faint)]" title={label}>{label}</span>
        <span className="h-5 w-px shrink-0 bg-[var(--ui-border)]" />
        {children}
      </section>
    );
  }
  return (
    <section
      className={`${SECTION_STACK} rounded-[var(--ui-radius-btn)] border border-[var(--ui-border)] bg-[var(--ui-card-band)] p-3 ${className}`}
      aria-label={label}
    >
      <SectionHeader>{label}</SectionHeader>
      <div className={ROW_STACK}>{children}</div>
    </section>
  );
};
export interface InspectorRowProps {
  /** Short label (≤6 characters fits the 42px column). Long concepts belong
   *  in the section label; the title always carries the full name. */
  label?: string;
  children?: React.ReactNode;
  /** Alternate to children: declarative specs for the repeated control kinds. */
  controls?: InspectorControlSpec[];
  /** Sentence-length content in a tall row: align the label to the FIRST line
   *  (not the vertical middle of a wrapped value). */
  tall?: boolean;
  /** Span both grid columns (big composites). Default rows keep the control
   *  column even when they have no label, so controls never jump left. */
  full?: boolean;
  /** Wide-surface override for the label column (e.g. a modal property panel
   *  where the 42px rail column would truncate "Character"). Never below 42px. */
  labelWidth?: string;
  className?: string;
}

/** One concept: fixed 42px label column + wrapping control column. A group
 *  wraps between its sub-groups; a sub-group never splits. */
export const InspectorRow: React.FC<InspectorRowProps> = ({ label, children, controls, tall, full, labelWidth, className = '' }) => {
  const surface = useInspectorSurface();
  const body = (
    <>
      {children}
      {controls?.map((spec, i) => <InspectorControl key={i} spec={spec} />)}
    </>
  );
  if (surface === 'bar') {
    return (
      <div className={`flex items-center gap-1.5 min-w-0 ${className}`}>
        {label && <span className="shrink-0 text-[10px] text-[color:var(--ui-text-faint)]" title={label}>{label}</span>}
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">{body}</div>
      </div>
    );
  }
  return (
    <div
      className={`grid grid-cols-[calc(42px*var(--inspector-text-scale,1))_minmax(0,1fr)] items-start gap-x-2 min-h-7 min-w-0 ${className}`}
      style={labelWidth ? { gridTemplateColumns: `calc(${labelWidth} * var(--inspector-text-scale,1)) minmax(0,1fr)` } : undefined}
    >
      {full ? null : label ? (
        <span
          className={`${INSPECTOR_LABEL_CLS} text-right ${tall ? 'leading-relaxed' : 'leading-7'}`}
          title={label}
        >
          {label}
        </span>
      ) : (
        <span aria-hidden />
      )}
      <div className={`${ROW_CONTROLS} ${full ? 'col-span-2' : ''}`}>{body}</div>
    </div>
  );
};

export interface InspectorSubGroupProps {
  children: React.ReactNode;
  className?: string;
}

export interface InspectorGroupProps {
  children: React.ReactNode;
  className?: string;
}

/** Related controls — stays together as a unit, but may wrap BETWEEN its
 *  sub-groups when the row is too narrow (the pair inside a sub-group never
 *  splits). This is what keeps W + R on one line and lets the pair drop
 *  together below the swatch. */
export const InspectorGroup: React.FC<InspectorGroupProps> = ({ children, className = '' }) => (
  <div className={`${GROUP} ${className}`}>{children}</div>
);

/** An atomic pair (toggle + swatch, W + R) — they travel together. */
export const InspectorSubGroup: React.FC<InspectorSubGroupProps> = ({ children, className = '' }) => (
  <div className={`inline-flex min-w-0 shrink-0 flex-nowrap items-center gap-0.5 ${className}`}>{children}</div>
);

export interface InspectorGroupCardProps {
  label: string;
  children: React.ReactNode;
  /** Optional control rendered to the LEFT of the group header (e.g. the
   *  Block title on/off checkbox) so the group stays one compact row. */
  headerLeft?: React.ReactNode;
  className?: string;
}

/** A big section-level group card (the Content umbrella, Block title) that
 *  holds section cards. Raised above the recessed section cards so the
 *  hierarchy reads: chrome → group card → section card → group. */
export const InspectorGroupCard: React.FC<InspectorGroupCardProps> = ({ label, children, headerLeft, className = '' }) => {
  const hasBody = React.Children.toArray(children).filter(Boolean).length > 0;
  return (
    <div
      className={`flex min-w-0 flex-col gap-2 rounded-[var(--ui-radius-btn)] border border-[var(--ui-border)] bg-[var(--ui-card-bg)] p-2 ${className}`}
      aria-label={label}
    >
      <div className="flex min-w-0 items-center gap-2">
        {headerLeft}
        <div className="min-w-0 flex-1">
          <SectionHeader>{label}</SectionHeader>
        </div>
      </div>
      {hasBody && <div className="flex min-w-0 flex-col gap-2">{children}</div>}
    </div>
  );
};

// ---- control faces ------------------------------------------------------------

export interface InspectorColorProps {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name; the swatch tooltip also names the value. */
  label: string;
  disabled?: boolean;
  readOnly?: boolean;
  /** Renders the shared clear button (a colour that can be unset). */
  onClear?: () => void;
  clearTitle?: string;
  className?: string;
}

/** Colour is a SWATCH ONLY — no hex entry. The value lives in the tooltip
 *  and the accessible name. */
export const InspectorColor: React.FC<InspectorColorProps> = ({
  value, onChange, label, disabled, readOnly, onClear, clearTitle, className = '',
}) => {
  const off = disabled || readOnly;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className}`}>
      <label
        title={`${label} ${value}`}
        className={`relative inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded border border-[color:var(--ui-border-strong)] bg-[var(--ui-panel-bg)] p-0 transition-colors focus-within:border-[var(--ui-input-focus-border)] ${off ? 'opacity-40' : 'hover:border-[var(--ui-input-focus-border)]'}`}
      >
        <span className="pointer-events-none h-[18px] w-[18px] rounded-[4px] border border-black/15" style={{ background: value }} />
        <input
          type="color"
          value={value}
          disabled={off}
          onChange={e => onChange(e.target.value)}
          aria-label={label}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
        />
      </label>
      {onClear && (
        <button
          type="button"
          disabled={off}
          onClick={onClear}
          title={clearTitle || `Clear ${label.toLowerCase()}`}
          aria-label={clearTitle || `Clear ${label.toLowerCase()}`}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[color:var(--ui-text-faint)] transition-colors hover:bg-[var(--ui-item-hover-bg)] hover:text-[color:var(--ui-text-strong)] disabled:opacity-25"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
};

export interface InspectorNumberProps {
  value: number | undefined;
  min: number;
  max: number;
  onCommit: (value: number) => void;
  /** Accessible name; the unit is appended for screen readers. */
  label: string;
  fallback?: number;
  step?: number;
  unit?: string;
  /** Fixed width by expected range — never grows with the value. */
  width?: string;
  compact?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
}

/** Number = the kit LiveNumberInput, fixed width by range, right aligned. */
export const InspectorNumber: React.FC<InspectorNumberProps> = ({
  value, min, max, onCommit, label, fallback = min, step, unit, width, compact,
  disabled, readOnly, placeholder, className = '',
}) => {
  const span = Math.max(Math.abs(min), Math.abs(max));
  // The kit NumberInput keeps its stepper column; the field is sized by the
  // expected range so the stepper never sits on top of the digits.
  const autoWidth = span < 10 ? 'w-12' : span < 100 ? 'w-13' : span < 1000 ? 'w-14' : 'w-16';
  const base = compact ? compactOf(TB_INPUT) : TB_INPUT;
  return (
    <span className={`inline-flex shrink-0 ${width || autoWidth}`}>
      <LiveNumberInput
        value={value}
        min={min}
        max={max}
        step={step}
        fallback={fallback}
        onCommit={onCommit}
        disabled={disabled}
        readOnly={readOnly}
        placeholder={placeholder}
        ariaLabel={unit ? `${label} (${unit})` : label}
        title={unit ? `${label} (${unit})` : label}
        className={`${base} w-full shrink-0 text-right ${className}`}
      />
    </span>
  );
};

export interface InspectorActionProps {
  onClick: () => void;
  /** Native tooltip + accessible name. Icon-only actions keep both. */
  title: string;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** A bare icon/text action with a NATIVE title. The kit `ToolButton` wraps a
 *  delayed tooltip bubble; dense inspector chrome wants the browser tooltip
 *  that disappears with the pointer. Use the kit ToolButton where a styled
 *  tooltip is the better affordance. */
export const InspectorAction: React.FC<InspectorActionProps> = ({
  onClick, title, disabled, className = TB_BTN, children,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={title}
    className={className}
    style={disabled ? { opacity: 0.45 } : undefined}
  >
    {children}
  </button>
);

export interface InspectorToggleProps {
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  /** Accessible name and tooltip. */
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  readOnly?: boolean;
  /** Text glyph face (B / I) — ignored when `icon` is set. */
  text?: string;
  className?: string;
}

/** Mode toggle: square, icon or glyph, kit on/off faces. */
export const InspectorToggle: React.FC<InspectorToggleProps> = ({
  pressed, onChange, label, icon, disabled, readOnly, text, className = '',
}) => (
  <button
    type="button"
    disabled={disabled || readOnly}
    aria-label={label}
    aria-pressed={pressed}
    title={label}
    onClick={() => onChange(!pressed)}
    className={`${TB_TOGGLE} ${pressed ? TB_TOGGLE_ON : TB_TOGGLE_OFF} shrink-0 ${className}`}
  >
    {icon || <span className="text-[10px] font-semibold">{text}</span>}
  </button>
);

export interface InspectorMenuOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface InspectorMenuProps {
  value: string;
  options: InspectorMenuOption[];
  onChange: (value: string) => void;
  /** Accessible name and tooltip. */
  label: string;
  /** Shown when the value has no matching option (e.g. "Select…"). */
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  /** Menu panel width (a `w-*` class; never the trigger's `w-full`). */
  menuWidth?: string;
  /** Fixed trigger width in a bar; the panel always fills its column. */
  width?: string;
  className?: string;
}

/** Value menu: the kit picker trigger + a dark dropdown panel. */
export const InspectorMenu: React.FC<InspectorMenuProps> = ({
  value, options, onChange, label, placeholder = '—', disabled, readOnly, menuWidth = 'w-56',
  width = 'w-40', className = '',
}) => {
  const surface = useInspectorSurface();
  const [open, setOpen] = React.useState(false);
  const current = options.find(o => o.value === value);
  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      theme="dark"
      width={menuWidth}
      trigger={
        <button
          type="button"
          disabled={disabled || readOnly}
          aria-label={label}
          title={label}
          className={`${TB_PICKER} ${surface === 'panel' ? 'w-full' : width} min-w-0 ${className} disabled:pointer-events-none`}
        >
          <span className={`truncate text-left ${current ? '' : 'text-[color:var(--ui-text-faint)]'}`} title={current?.label || label}>
            {current?.label || placeholder}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-[color:var(--ui-text-faint)]" />
        </button>
      }
    >
      {options.map(o => (
        <DropdownItem
          key={o.value}
          disabled={o.disabled}
          onClick={() => { onChange(o.value); setOpen(false); }}
          icon={o.icon || (o.value === value ? <Check className="h-3.5 w-3.5" /> : undefined)}
        >
          <span className="truncate">{o.label}</span>
        </DropdownItem>
      ))}
    </DropdownMenu>
  );
};

export interface InspectorCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  disabled?: boolean;
  readOnly?: boolean;
  /** Let a sentence-length label wrap inside the row. */
  wrapLabel?: boolean;
  className?: string;
}

/** A checkbox row: plain inline checkbox, one line by default. */
export const InspectorCheckbox: React.FC<InspectorCheckboxProps> = ({
  checked, onChange, label, disabled, readOnly, wrapLabel, className = '',
}) => (
  <Checkbox
    checked={checked}
    onChange={onChange}
    label={label}
    disabled={disabled || readOnly}
    variant="plain"
    labelClassName={`${wrapLabel ? '' : 'whitespace-nowrap'} text-[10px]! text-[color:var(--ui-text-muted)]`}
    className={`${wrapLabel ? 'items-start!' : ''} ${className}`}
  />
);

export interface InspectorSegOption {
  v: string;
  l: string;
  title?: string;
}

export interface InspectorSegProps {
  value: string;
  options: InspectorSegOption[];
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
}

/** Segmented control that stretches to the control column on the panel. When
 *  its labels cannot fit the available width it adapts to the SAME value menu
 *  — a squeezed segment never clips a label. */
export const InspectorSeg: React.FC<InspectorSegProps> = ({ value, options, onChange, label, disabled }) => {
  const surface = useInspectorSurface();
  const ref = React.useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = React.useState(false);
  const signature = options.map(o => o.l).join('|');
  React.useEffect(() => {
    if (surface !== 'panel') {
      setNarrow(false);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // ~6.2px per character at 10px + 16px cell padding + 2px track border.
      const needed = options.reduce((sum, o) => sum + o.l.length * 6.2 + 16, 2);
      const next = el.clientWidth > 0 && needed > el.clientWidth;
      setNarrow(prev => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, surface]);
  return (
    <div ref={ref} className="min-w-0 flex-1">
      {narrow && surface === 'panel' ? (
        <InspectorMenu
          label={label}
          value={value}
          options={options.map(o => ({ value: o.v, label: o.l }))}
          onChange={onChange}
          disabled={disabled}
          menuWidth="w-56"
        />
      ) : (
        <Seg
          value={value}
          options={options}
          onChange={onChange}
          disabled={disabled}
          stretch={surface === 'panel'}
          ariaLabel={label}
        />
      )}
    </div>
  );
};

// ---- tiny control registry ----------------------------------------------------
// Repeated kinds only. Custom JSX is always valid (children or a `node` spec);
// never turn this into a rigid schema.

export type InspectorControlSpec =
  | ({ kind: 'color' } & InspectorColorProps)
  | ({ kind: 'number' } & InspectorNumberProps)
  | ({ kind: 'toggle' } & InspectorToggleProps)
  | ({ kind: 'menu' } & InspectorMenuProps)
  | ({ kind: 'checkbox' } & InspectorCheckboxProps)
  | ({ kind: 'seg' } & InspectorSegProps)
  | { kind: 'node'; node: React.ReactNode };

export const InspectorControl: React.FC<{ spec: InspectorControlSpec }> = ({ spec }) => {
  switch (spec.kind) {
    case 'color': return <InspectorColor {...spec} />;
    case 'number': return <InspectorNumber {...spec} />;
    case 'toggle': return <InspectorToggle {...spec} />;
    case 'menu': return <InspectorMenu {...spec} />;
    case 'checkbox': return <InspectorCheckbox {...spec} />;
    case 'seg': return <InspectorSeg {...spec} />;
    case 'node': return <>{spec.node}</>;
    default: return null;
  }
};
