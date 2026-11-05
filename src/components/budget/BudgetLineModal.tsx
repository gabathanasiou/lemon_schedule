import React from 'react';
import { ChevronDown, Copy, Link2, Pin, Trash2, Unlink } from 'lucide-react';
import { Checklist, type PickerItem } from '@gabriel/ui-kit';
import type { BudgetLine, BudgetLineSource, Project } from '../../types';
import type { BudgetModel, ComputedBudgetLine } from '../../lib/budget/calc';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import Button from '../Button';
import { BudgetInput, MoneyField, NumberField } from './fields';
import { FormulaField } from './FormulaField';
import { buildFormulaBook } from '../../lib/budget/formulaBook';
import { scheduleSourceKey } from '../../lib/budget/scheduleSync';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import { formatMoney } from '../../lib/budget/format';

type LinkOption = { id: string; label: string; group: string; source: BudgetLineSource };

function linkOptionsOf(project: Project): LinkOption[] {
  const out: LinkOption[] = [
    { id: 'shootDays', label: 'Shoot days', group: 'Schedule', source: { kind: 'shootDays' } },
  ];
  for (const role of project.crewRoles || []) {
    const people = project.crew?.[role.key] || [];
    if (people.length === 0) continue;
    out.push({ id: `role:${role.key}`, label: `${role.label} — any person`, group: 'Crew', source: { kind: 'crewRole', roleKey: role.key } });
    for (const person of people) {
      out.push({
        id: `crew:${role.key}:${person.id}`,
        label: `${person.name} — ${role.label}`,
        group: 'Crew',
        source: { kind: 'crewRole', roleKey: role.key, personId: person.id },
      });
    }
  }
  for (const member of project.castMembers || []) {
    out.push({ id: `cast:${member.id}`, label: `${member.id}. ${member.name}`, group: 'Cast', source: { kind: 'cast', castId: member.id } });
  }
  for (const location of project.locations || []) {
    out.push({ id: `loc:${location.id}`, label: location.name, group: 'Locations', source: { kind: 'location', locationId: location.id } });
  }
  return out;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[color:var(--ui-border)] px-5 py-3 first:border-t-0">
      <div className="text-[10px] uppercase tracking-wide text-[color:var(--ui-text-faint)] mb-2">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 min-w-0">
      <span className="w-24 shrink-0 text-xs text-[color:var(--ui-text-muted)]">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </label>
  );
}

/** The per-line editor (`docs/BUDGETING-SURFACES.md` §2). All writes commit on
 *  blur/pick; no Save button, no per-keystroke persistence. */
export function BudgetLineModal({
  open, onClose, line, model, project, readOnly,
  onUpdate, onDelete, onDuplicate, onLink, onUnlink, onPin, onUnpin,
}: {
  open: boolean;
  onClose: () => void;
  line: BudgetLine;
  model: BudgetModel;
  project: Project;
  readOnly: boolean;
  onUpdate: (updates: Partial<BudgetLine>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onLink: (source: BudgetLineSource) => void;
  onUnlink: () => void;
  onPin: (qty: number) => void;
  onUnpin: () => void;
}) {
  const computed: ComputedBudgetLine | undefined = model.categories
    .flatMap(c => c.accounts).flatMap(a => a.lines).find(l => l.line.id === line.id);
  const units = model.budget.units || [];
  const currencies = model.budget.currencies || [];
  const fringes = model.budget.fringes || [];
  const groups = model.budget.groups || [];
  const linkOptions = React.useMemo(() => linkOptionsOf(project), [project]);
  const [unitOpen, setUnitOpen] = React.useState(false);
  const [currencyOpen, setCurrencyOpen] = React.useState(false);
  const [groupsOpen, setGroupsOpen] = React.useState(false);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const currentLink = scheduleSourceKey(line.source);

  const unitItems: PickerItem[] = units.map(u => ({ id: u.id, label: `${u.name}${u.hours ? ` (${u.hours}h)` : ''}` }));
  const currencyItems: PickerItem[] = currencies.map(c => ({ id: c.code, label: c.symbol ? `${c.symbol} ${c.code}` : c.code }));
  const groupItems = groups.map(g => ({ id: g.id, label: g.name }));
  const formulaEntries = React.useMemo(
    () => buildFormulaBook(model.globals, model.budget.globals),
    [model.globals, model.budget.globals],
  );
  const fringeItems = fringes.map(f => {
    const contribution = computed?.fringes.find(x => x.id === f.id)?.cents;
    const definition = f.calc === 'percent' ? `${f.percent || 0}%` : formatMoney(f.amountCents || 0, model.settings);
    return {
      id: f.id,
      label: f.name,
      // Roadmap 338: the canonical computed contribution for THIS line, never
      // a re-derived fringe amount.
      secondary: contribution != null ? `+ ${formatMoney(contribution, model.settings)} · ${definition}` : `${definition} · —`,
    };
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Line — ${line.description || 'Untitled'}`}
      width="max-w-2xl"
      footer={
        <ModalFooter>
          <Button variant="subtle" onClick={onDuplicate} disabled={readOnly}>
            <Copy className="w-3.5 h-3.5" /> Duplicate
          </Button>
          <Button variant="subtle" onClick={onDelete} className="text-red-600" disabled={readOnly}>
            <Trash2 className="w-3.5 h-3.5" /> Delete line
          </Button>
          <div className="ml-auto text-xs font-semibold text-[color:var(--ui-text-strong)]">
            {computed ? formatMoney(computed.localTotalCents, { ...model.settings, currencySymbol: computed.currencySymbol }) : ''}
          </div>
          <ModalFooterButton onClick={onClose}>Done</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="max-h-[65vh] overflow-y-auto scrollbar-custom">
        <Section title="Amounts">
          <div className="space-y-2">
            <Field label="Description">
              <BudgetInput value={line.description} onCommit={v => onUpdate({ description: v })} readOnly={readOnly} />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Qty">
                <NumberField value={line.qty} onCommit={v => onUpdate(line.source && line.qtyOverride == null ? { qtyOverride: v } : { qty: v })} readOnly={readOnly} min={0} ariaLabel="Quantity" />
              </Field>
              <Field label="Rate">
                <MoneyField cents={line.rateCents} onCommit={v => onUpdate({ rateCents: v })} readOnly={readOnly} symbol={computed?.currencySymbol} ariaLabel="Rate" />
              </Field>
              <Field label="Multiplier">
                <NumberField value={line.multiplier} onCommit={v => onUpdate({ multiplier: v })} readOnly={readOnly} ariaLabel="Multiplier" />
              </Field>
            </div>
            {computed && computed.errors.length > 0 && (
              <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                {computed.errors.join(' · ')}
              </div>
            )}
          </div>
        </Section>

        <Section title="Schedule link">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <DropdownMenu
                  open={linkOpen}
                  onOpenChange={setLinkOpen}
                  width="w-64"
                  theme="light"
                  searchable
                  searchPlaceholder="Search the schedule…"
                  trigger={
                    <Button variant="outline" theme="dark" className="w-full justify-between" disabled={readOnly}>
                      <span className="truncate">{linkOptions.find(o => o.id === currentLink)?.label || 'Not linked'}</span>
                      <ChevronDown className="w-3 h-3 shrink-0" />
                    </Button>
                  }
                >
                  {linkOptions.map(option => (
                    <DropdownItem
                      key={option.id}
                      onClick={() => { setLinkOpen(false); onLink(option.source); }}
                      icon={option.id === currentLink ? <span className="text-[10px]">✓</span> : undefined}
                    >
                      <span className="truncate">{option.label}</span>
                      <span className="ml-2 text-[10px] text-[color:var(--ui-text-faint)]">{option.group}</span>
                    </DropdownItem>
                  ))}
                  {line.source && (
                    <DropdownItem onClick={() => { setLinkOpen(false); onUnlink(); }}>
                      <span className="text-[color:var(--ui-text-muted)]">Not linked</span>
                    </DropdownItem>
                  )}
                </DropdownMenu>
              </div>
              {line.source && !readOnly && (
                <Button variant="subtle" onClick={onUnlink} title="Unlink from the schedule">
                  <Unlink className="w-3.5 h-3.5" /> Unlink
                </Button>
              )}
            </div>
            {line.source && computed && (
              <div className="flex items-center gap-2 text-[11px] text-[color:var(--ui-text-muted)]">
                <Link2 className="w-3 h-3" />
                {line.qtyOverride != null ? (
                  <>
                    Pinned at {line.qtyOverride} (schedule now {computed.scheduleQty ?? 0})
                    <Button variant="subtle" onClick={onUnpin} disabled={readOnly} title="Follow the schedule again">
                      <Pin className="w-3 h-3" /> Unpin
                    </Button>
                  </>
                ) : (
                  <>
                    Following the schedule — {computed.scheduleQty ?? computed.qty} {computed.qty === 1 ? 'unit' : 'units'}
                    <Button variant="subtle" onClick={() => onPin(computed.scheduleQty ?? computed.qty)} disabled={readOnly} title="Freeze the current quantity">
                      <Pin className="w-3 h-3" /> Pin
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </Section>

        <Section title="Details">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Unit">
              <DropdownMenu
                open={unitOpen}
                onOpenChange={setUnitOpen}
                width="w-48"
                theme="light"
                trigger={
                  <Button variant="outline" theme="dark" className="w-full justify-between" disabled={readOnly}>
                    <span className="truncate">{units.find(u => u.id === line.unit)?.name || 'Unit'}</span>
                    <ChevronDown className="w-3 h-3 shrink-0" />
                  </Button>
                }
              >
                {unitItems.map(item => (
                  <DropdownItem key={item.id} onClick={() => { setUnitOpen(false); onUpdate({ unit: item.id }); }} icon={item.id === line.unit ? <span className="text-[10px]">✓</span> : undefined}>
                    {item.label}
                  </DropdownItem>
                ))}
              </DropdownMenu>
            </Field>
            <Field label="Currency">
              <DropdownMenu
                open={currencyOpen}
                onOpenChange={setCurrencyOpen}
                width="w-44"
                theme="light"
                trigger={
                  <Button variant="outline" theme="dark" className="w-full justify-between" disabled={readOnly}>
                    <span className="truncate">{currencyItems.find(c => c.id === (line.currency || model.settings.currency))?.label || 'Currency'}</span>
                    <ChevronDown className="w-3 h-3 shrink-0" />
                  </Button>
                }
              >
                {currencyItems.map(item => (
                  <DropdownItem key={item.id} onClick={() => { setCurrencyOpen(false); onUpdate({ currency: item.id }); }} icon={item.id === (line.currency || model.settings.currency) ? <span className="text-[10px]">✓</span> : undefined}>
                    {item.label}
                  </DropdownItem>
                ))}
              </DropdownMenu>
            </Field>
          </div>
          <div className="mt-2">
            <Field label="Notes">
              <BudgetInput value={line.notes || ''} onCommit={v => onUpdate({ notes: v })} readOnly={readOnly} placeholder="Notes" />
            </Field>
          </div>
        </Section>

        {fringes.length > 0 && (
          <Section title="Fringes">
            <Checklist
              items={fringeItems}
              selected={line.fringes || []}
              disabled={readOnly}
              onToggle={(id) => {
                const set = new Set(line.fringes || []);
                if (set.has(String(id))) set.delete(String(id)); else set.add(String(id));
                onUpdate({ fringes: [...set] });
              }}
              maxHeight={160}
              emptyHint="No fringes in the library yet"
            />
          </Section>
        )}

        {groups.length > 0 && (
          <Section title="Groups">
            <DropdownMenu
              open={groupsOpen}
              onOpenChange={setGroupsOpen}
              width="w-56"
              multiple={{
                selectedIds: line.groups || [],
                commitLabel: count => `Apply groups (${count})`,
                onCommit: ids => onUpdate({ groups: ids }),
              }}
              trigger={
                <Button variant="outline" disabled={readOnly} className="w-full justify-between">
                  <span className="truncate">{(line.groups || []).length ? `${(line.groups || []).length} selected` : 'No groups'}</span>
                  <ChevronDown className="w-3 h-3 shrink-0" />
                </Button>
              }
            >
              {groupItems.map(group => (
                <DropdownItem key={group.id} itemId={group.id} onClick={() => {}}>
                  {group.label}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </Section>
        )}

        <Section title="Formula overrides (advanced)">
          <div className="space-y-2">
            <Field label="Qty formula">
              <FormulaField value={line.qtyFormula || ''} onCommit={v => onUpdate({ qtyFormula: v || undefined })} entries={formulaEntries} readOnly={readOnly} ariaLabel="Qty formula" placeholder="e.g. SHOOT_DAYS * 2" />
            </Field>
            <Field label="Rate formula">
              <FormulaField value={line.rateFormula || ''} onCommit={v => onUpdate({ rateFormula: v || undefined })} entries={formulaEntries} readOnly={readOnly} ariaLabel="Rate formula" placeholder="e.g. PREP_WEEKS * 5000" />
            </Field>
            <Field label="X formula">
              <FormulaField value={line.multiplierFormula || ''} onCommit={v => onUpdate({ multiplierFormula: v || undefined })} entries={formulaEntries} readOnly={readOnly} ariaLabel="X formula" placeholder="e.g. 1 + 0.1" />
            </Field>
            <p className="text-[10px] text-[color:var(--ui-text-faint)]">
              Type to autocomplete, or open the book. Functions: ROUND, MIN, MAX, ABS, CLAMP. Error codes show on the line; unknown names are #REF!.
            </p>
          </div>
        </Section>
      </div>
    </Modal>
  );
}
