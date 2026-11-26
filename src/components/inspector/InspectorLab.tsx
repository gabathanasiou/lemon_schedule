import React, { useState } from 'react';
import { Seg, ThemeScope } from '@gabriel/ui-kit';
import { ChevronDown, Palette, RotateCcw } from 'lucide-react';
import {
  INSPECTOR_VALUE_CLS,
  InspectorCheckbox,
  InspectorColor,
  InspectorGroup,
  InspectorMenu,
  InspectorNumber,
  InspectorRow,
  InspectorSection,
  InspectorSeg,
  InspectorSubGroup,
  InspectorSurfaceContext,
  InspectorToggle,
  type InspectorSurface,
} from './index';

/**
 * InspectorLab (roadmap 373) — dev-only grammar laboratory.
 *
 * Route: `#/lab/inspector` (DEV builds only; the dynamic import is dropped
 * from production). Switch width 240/300/360/400, dark/light, panel/bar and
 * 150% text scale to verify wrapping, read-only, disabled, long labels and
 * long values without touching a real project.
 */

const WIDTHS = [240, 300, 360, 400] as const;
const THEMES = ['dark', 'light'] as const;

const LONG_LABEL = 'Use the day’s location';
const LONG_VALUE = 'Production office — 4th floor, 221B Baker Street, Marylebone';

const SwatchGlyph: React.FC = () => <span className="h-3 w-3 rounded-[2px] border border-current" />;

const PresetMenu: React.FC<{ disabled?: boolean }> = ({ disabled }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex min-w-0 flex-1">
      <button
        type="button"
        disabled={disabled}
        title="Block style presets"
        className="inline-flex h-7 w-full min-w-0 items-center justify-between gap-1.5 rounded border border-[color:var(--ui-card-border)] bg-[var(--ui-input-bg)] px-2 text-[10px] font-medium text-[color:var(--ui-text-muted)] transition-colors hover:bg-[var(--ui-item-hover-bg)] hover:text-[color:var(--ui-text-strong)] disabled:opacity-40"
        onClick={() => setOpen(v => !v)}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Palette className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Card</span>
        </span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-10 w-52 rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-menu-bg)] p-1 text-[10px] text-[color:var(--ui-text)] shadow-xl">
          <div className="rounded px-3 py-1.5 hover:bg-[var(--ui-item-hover-bg)]">Black bar</div>
          <div className="rounded px-3 py-1.5 hover:bg-[var(--ui-item-hover-bg)]">Callout</div>
          <div className="rounded px-3 py-1.5 hover:bg-[var(--ui-item-hover-bg)]">Card</div>
        </div>
      )}
    </div>
  );
};

const RowSpecimens: React.FC<{ readOnly?: boolean; disabled?: boolean }> = ({ readOnly, disabled }) => {
  const [fill, setFill] = useState('#1F2937');
  const [border, setBorder] = useState('#D4D4D8');
  const [width, setWidth] = useState(1);
  const [radius, setRadius] = useState(0);
  const [bordered, setBordered] = useState(true);
  const [bold, setBold] = useState(true);
  const [italic, setItalic] = useState(false);
  const [mode, setMode] = useState('contain');
  const [header, setHeader] = useState(true);
  const [borders, setBorders] = useState(true);
  const [axis, setAxis] = useState('columns');
  const off = readOnly || disabled;

  return (
    <>
      <InspectorSection label="Outline">
        <InspectorRow label="Preset">
          <PresetMenu disabled={off} />
        </InspectorRow>
        <InspectorRow label="Fill">
          <InspectorColor
            label="Background colour"
            value={fill}
            onChange={setFill}
            disabled={disabled}
            readOnly={readOnly}
            onClear={() => setFill('#FFFFFF')}
            clearTitle="Remove background"
          />
        </InspectorRow>
        <InspectorRow label="Border">
          <InspectorGroup>
            <InspectorSubGroup>
              <InspectorToggle label="Border around the block" pressed={bordered} onChange={setBordered} icon={<SwatchGlyph />} disabled={disabled} readOnly={readOnly} />
              <InspectorColor label="Border colour" value={border} onChange={v => { setBorder(v); setBordered(true); }} disabled={disabled} readOnly={readOnly} />
            </InspectorSubGroup>
            <InspectorSubGroup>
              <span className="text-[10px] text-[color:var(--ui-text-muted)]">W</span>
              <InspectorNumber label="Border width" unit="px" value={width} min={0} max={12} onCommit={setWidth} disabled={disabled} readOnly={readOnly} />
              <span className="ml-1 text-[10px] text-[color:var(--ui-text-muted)]">R</span>
              <InspectorNumber label="Corner radius" unit="px" value={radius} min={0} max={40} onCommit={setRadius} disabled={disabled} readOnly={readOnly} />
            </InspectorSubGroup>
          </InspectorGroup>
        </InspectorRow>
      </InspectorSection>

      <InspectorSection label="Padding">
        <InspectorRow>
          <InspectorGroup className="gap-2">
            <InspectorSubGroup>
              <span className="shrink-0 text-[10px] text-[color:var(--ui-text-muted)]" title="Vertical padding">V</span>
              <InspectorNumber label="Vertical padding" unit="px" value={2} min={0} max={24} onCommit={() => {}} disabled={disabled} readOnly={readOnly} />
            </InspectorSubGroup>
            <InspectorSubGroup>
              <span className="shrink-0 text-[10px] text-[color:var(--ui-text-muted)]" title="Horizontal padding">H</span>
              <InspectorNumber label="Horizontal padding" unit="px" value={4} min={0} max={24} onCommit={() => {}} disabled={disabled} readOnly={readOnly} />
            </InspectorSubGroup>
          </InspectorGroup>
        </InspectorRow>
      </InspectorSection>

      <InspectorSection label="Display">
        <InspectorRow label="Mode">
          <InspectorSeg value={mode} options={[{ v: 'contain', l: 'Contain' }, { v: 'cover', l: 'Cover' }, { v: 'fill', l: 'Fill' }]} onChange={setMode} label="Image fit" disabled={off} />
        </InspectorRow>
        <InspectorRow label="Axis">
          <InspectorSeg value={axis} options={[{ v: 'columns', l: 'Columns' }, { v: 'rows', l: 'Rows' }]} onChange={setAxis} label="Table axis" disabled={off} />
        </InspectorRow>
        <InspectorRow label="Table">
          <InspectorGroup>
            <InspectorCheckbox checked={header} onChange={setHeader} label="Header" disabled={disabled} readOnly={readOnly} />
            <InspectorCheckbox checked={borders} onChange={setBorders} label="Borders" disabled={disabled} readOnly={readOnly} />
          </InspectorGroup>
        </InspectorRow>
        <InspectorRow label="Marks">
          <InspectorGroup>
            <InspectorToggle label="Bold" text="B" pressed={bold} onChange={setBold} disabled={disabled} readOnly={readOnly} />
            <InspectorToggle label="Italic" text="I" pressed={italic} onChange={setItalic} disabled={disabled} readOnly={readOnly} />
          </InspectorGroup>
          <InspectorGroup>
            <InspectorToggle label="Reset formatting" pressed={false} onChange={() => {}} icon={<RotateCcw className="h-3 w-3" />} disabled={disabled} readOnly={readOnly} />
          </InspectorGroup>
        </InspectorRow>
        <InspectorRow label="Budget">
          <InspectorSeg
            value="topsheet"
            options={[
              { v: 'topsheet', l: 'Top Sheet' },
              { v: 'accounts', l: 'Accounts' },
              { v: 'lines', l: 'Lines' },
              { v: 'comparison', l: 'Compare' },
              { v: 'costReport', l: 'Cost Report' },
            ]}
            onChange={() => {}}
            label="Budget mode"
            disabled={off}
          />
        </InspectorRow>
      </InspectorSection>

      <InspectorSection label="Values">
        <InspectorRow label="Long">
          <InspectorMenu
            label={LONG_LABEL}
            value="day"
            options={[
              { value: 'day', label: 'Use the day’s location' },
              { value: 'scene', label: 'Use the scene’s location' },
              { value: 'none', label: 'Do not show a location' },
            ]}
            onChange={() => {}}
            disabled={off}
          />
        </InspectorRow>
        <InspectorRow label="Suffix">
          <input
            value="— continued — with a very long suffix"
            readOnly
            aria-label="Long suffix value"
            className="h-7 w-full min-w-0 rounded border border-[color:var(--ui-input-border)] bg-[var(--ui-input-bg)] px-2 text-[10px] text-[color:var(--ui-input-text)] outline-none"
          />
        </InspectorRow>
        <InspectorRow label="Height" tall>
          <div className={`${INSPECTOR_VALUE_CLS} w-full whitespace-normal text-[10px] leading-relaxed`}>{LONG_VALUE}</div>
        </InspectorRow>
        <InspectorRow>
          <InspectorGroup className="w-full">
            <InspectorCheckbox checked disabled={off} onChange={() => {}} wrapLabel label="Long checkbox label that wraps inside the control column" />
          </InspectorGroup>
        </InspectorRow>
      </InspectorSection>

      <InspectorSection label="Typography">
        <InspectorRow label="Count">
          <InspectorNumber label="Count" value={4} min={0} max={8} onCommit={() => {}} disabled={disabled} readOnly={readOnly} />
        </InspectorRow>
        <InspectorRow label="Percent">
          <InspectorNumber label="Percent" unit="%" value={100} min={0} max={100} onCommit={() => {}} disabled={disabled} readOnly={readOnly} />
        </InspectorRow>
        <InspectorRow label="Height">
          <InspectorNumber label="Image height" unit="px" value={1200} min={0} max={3000} step={10} onCommit={() => {}} disabled={disabled} readOnly={readOnly} />
        </InspectorRow>
      </InspectorSection>
    </>
  );
};

const BarSpecimen: React.FC<{ readOnly?: boolean; disabled?: boolean }> = ({ readOnly, disabled }) => (
  <InspectorSurfaceContext.Provider value="bar">
    <div className="rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] px-3 py-2">
      <RowSpecimens readOnly={readOnly} disabled={disabled} />
    </div>
  </InspectorSurfaceContext.Provider>
);

const InspectorLab: React.FC = () => {
  const [width, setWidth] = useState<number>(300);
  const [theme, setTheme] = useState<(typeof THEMES)[number]>('dark');
  const [surface, setSurface] = useState<InspectorSurface>('panel');
  const [scale, setScale] = useState<100 | 150>(100);

  return (
    <ThemeScope mode="dark" surface="neutral" className="block min-h-screen">
      <div className="flex min-h-screen flex-col bg-[var(--ui-modal-header-base)] text-[color:var(--ui-text)]">
        <header className="flex flex-wrap items-center gap-3 border-b border-[color:var(--ui-border)] px-4 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ui-text-faint)]">Inspector lab</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[color:var(--ui-text-faint)]">Width</span>
            <Seg theme="dark" dense value={String(width)} options={WIDTHS.map(w => ({ v: String(w), l: String(w) }))} onChange={v => setWidth(Number(v))} ariaLabel="Panel width" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[color:var(--ui-text-faint)]">Theme</span>
            <Seg theme="dark" dense value={theme} options={THEMES.map(t => ({ v: t, l: t === 'dark' ? 'Dark' : 'Light' }))} onChange={v => setTheme(v as (typeof THEMES)[number])} ariaLabel="Theme" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[color:var(--ui-text-faint)]">Surface</span>
            <Seg theme="dark" dense value={surface} options={[{ v: 'panel', l: 'Panel' }, { v: 'bar', l: 'Bar' }]} onChange={v => setSurface(v as InspectorSurface)} ariaLabel="Surface" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[color:var(--ui-text-faint)]">Text</span>
            <Seg theme="dark" dense value={String(scale)} options={[{ v: '100', l: '100%' }, { v: '150', l: '150%' }]} onChange={v => setScale(Number(v) as 100 | 150)} ariaLabel="Text scale" />
          </div>
          <a href="#/" className="ml-auto text-[10px] text-[color:var(--ui-text-muted)] underline-offset-2 hover:underline">Back to app</a>
        </header>

        <div className="flex min-h-0 flex-1 gap-6 overflow-auto p-6">
          <div className="flex shrink-0 flex-col gap-6">
            <div style={{ width }} className="flex flex-col gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ui-text-faint)]">{surface === 'panel' ? 'Panel' : 'Bar'} · {theme}</div>
              <ThemeScope mode={theme} surface="neutral" className="block">
              <div
                  style={{ ['--inspector-text-scale' as string]: String(scale / 100) } as React.CSSProperties}
                  className="flex flex-col gap-4 rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] p-4"
                >
                  {surface === 'panel' ? (
                    <InspectorSurfaceContext.Provider value="panel">
                      <RowSpecimens />
                    </InspectorSurfaceContext.Provider>
                  ) : (
                    <BarSpecimen />
                  )}
                </div>
              </ThemeScope>
            </div>
            <div className="flex flex-wrap gap-6">
              <div style={{ width }} className="flex flex-col gap-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ui-text-faint)]">Read-only</div>
                <ThemeScope mode={theme} surface="neutral" className="block">
                  <div
                    style={{ ['--inspector-text-scale' as string]: String(scale / 100) } as React.CSSProperties}
                    className="rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] p-4"
                  >
                    <InspectorSurfaceContext.Provider value="panel">
                      <RowSpecimens readOnly />
                    </InspectorSurfaceContext.Provider>
                  </div>
                </ThemeScope>
              </div>
              <div style={{ width }} className="flex flex-col gap-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ui-text-faint)]">Disabled</div>
                <ThemeScope mode={theme} surface="neutral" className="block">
                  <div
                    style={{ ['--inspector-text-scale' as string]: String(scale / 100) } as React.CSSProperties}
                    className="rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] p-4"
                  >
                    <InspectorSurfaceContext.Provider value="panel">
                      <RowSpecimens disabled />
                    </InspectorSurfaceContext.Provider>
                  </div>
                </ThemeScope>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ThemeScope>
  );
};

export default InspectorLab;
