import React, { useMemo, useState } from 'react';
import { ChevronDown, Info, Plus, UserPlus } from 'lucide-react';
import { SearchMenu, useKitTheme } from '@gabriel/ui-kit';
import type { SearchMenuGroup, SearchMenuItem } from '@gabriel/ui-kit';
import { useProject } from '../../../store';
import { generateUUID, formatDateShort, DATE_FORMAT_OPTIONS } from '../../../lib/utils';
import { useDaybreakSections } from '../../../lib/useDaybreakSections';
import { getBrowserTimeZone, COMMON_TIMEZONES } from '../../../lib/timezones';
import Modal, { ModalFooter } from '../../Modal';
import ModalFooterButton from '../../ModalFooterButton';
import DropdownMenu from '../../DropdownMenu';
import DropdownItem from '../../DropdownItem';
import { CommitInput } from '../../CommitInput';
import { useDialog } from '../../Dialog';
import DateField from '../../DateField';
import { initialViewFor } from '../../calendar/calendarUtils';
import { ruleModalSizes } from '../../rules/ColorRuleFormParts';
import { crewRoleGroup } from '../../../lib/crewCatalog';
import { departmentOrder } from '../../../lib/dayCrew';
import type { CrewPerson } from '../../../types';

/**
 * Production Details modal (roadmap 103) — the project's contact/office info,
 * production dates (window + report date format + timezone) and the KEY
 * POSITIONS crew assignments. Formerly the Production tab's Project Details
 * sub-tab; now a draggable kit `Modal` opened from the Day Manager header so a
 * 1st AD can set production-level info while working over the days.
 */
const KEY_POSITIONS: { key: string; label: string }[] = [
  { key: 'director', label: 'Director' },
  { key: 'producer', label: 'Producer' },
  { key: 'lineProducer', label: 'Line Producer' },
  { key: 'firstAD', label: '1st AD' },
  { key: 'upm', label: 'UPM' },
];

const DETAIL_FIELDS: { key: string; label: string }[] = [
  { key: 'company', label: 'Production Company' },
  { key: 'studio', label: 'Studio / Backlot' },
  { key: 'productionOffice', label: 'Production Office' },
  { key: 'address', label: 'Address' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
];

const INPUT_CLS = 'flex-1 min-w-0 bg-[var(--ui-input-bg)] border border-[color:var(--ui-input-border)] rounded px-2 py-1 text-xs text-[color:var(--ui-input-text)] placeholder:text-[color:var(--ui-text-faint)] outline-none focus:border-[color:var(--ui-input-focus-border)] focus:ring-1 focus:ring-[color:var(--ui-accent-focus)] disabled:opacity-50';
const PICKER_TRIGGER = 'flex w-full items-center justify-between gap-2 rounded bg-[var(--ui-input-bg)] border border-[color:var(--ui-input-border)] px-2 py-1 text-xs text-[color:var(--ui-input-text)] outline-none hover:bg-[var(--ui-modal-bg)] focus:border-[color:var(--ui-input-focus-border)] disabled:opacity-50';

// Controlled click-to-toggle menu (follows the modal's ambient theme).
const Menu: React.FC<{ trigger: React.ReactNode; width?: string; searchable?: boolean; searchPlaceholder?: string; onClose?: () => void; children: React.ReactNode }> = ({ trigger, width, searchable, searchPlaceholder, onClose, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu
      open={open}
      onClose={() => setOpen(false)}
      onOpenChange={o => { setOpen(o); if (!o) onClose?.(); }}
      trigger={trigger}
      width={width}
      searchable={searchable}
      searchPlaceholder={searchPlaceholder}
    >
      {children}
    </DropdownMenu>
  );
};

export const ProductionDetailsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state, dispatch, locked } = useProject();
  const dialog = useDialog();
  const ambient = useKitTheme();
  const project = state.present;
  const sizes = ruleModalSizes();
  const { CREM_LABEL, CREM_TEXT, CREM_BODY } = sizes;
  const activeCalendarVersion = project.calendarVersions.find(v => v.id === project.activeCalendarVersionId);
  const { productionSections } = useDaybreakSections();

  const productionInfo = project.productionInfo || {};
  const crewRoles = project.crewRoles || [];
  const crew = project.crew || {};

  const roleLabel = (key: string) => crewRoles.find(r => r.key === key)?.label || key;
  const allPeople: { person: CrewPerson; role: string }[] = [];
  for (const role of crewRoles) {
    for (const p of crew[role.key] || []) allPeople.push({ person: p, role: role.key });
  }

  // Assign catalogue (roadmap 318): every person on the crew is a record, the
  // departments are the categories — `departmentOrder`'s ordering, the same one
  // the Crew surfaces use (never a local sort).
  const depts = useMemo(() => departmentOrder(project), [project]);
  const deptOfRole = useMemo(() => new Map(crewRoles.map(r => [r.key, crewRoleGroup(r)])), [crewRoles]);

  const wrapDate = React.useMemo(() => {
    const last = productionSections[productionSections.length - 1];
    return last ? formatDateShort(last.date) : '';
  }, [productionSections]);
  const [tzOpen, setTzOpen] = useState(false);

  const commitInfo = (patch: Record<string, string>) => dispatch({ type: 'SET_PRODUCTION_INFO', payload: patch });

  const addPersonToRole = (role: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    dispatch({ type: 'ADD_CREW_PERSON', payload: { role, person: { id: generateUUID(), name: trimmed } } });
  };

  const addPersonPrompt = async (role: string) => {
    const name = await dialog.prompt({ title: 'Add person', placeholder: 'Full name' });
    if (name) addPersonToRole(role, name);
  };

  const movePersonToRole = (person: CrewPerson, fromRole: string, toRole: string) => {
    if (fromRole === toRole) return;
    dispatch({ type: 'UPDATE_CREW_PERSON', payload: { role: fromRole, id: person.id, updates: {}, toRole } });
  };

  const rowLabel = (text: string) => <span className={`${CREM_LABEL} text-[color:var(--ui-text-muted)] w-40 shrink-0`}>{text}</span>;

  return (
    <Modal open onClose={onClose} title="Production Details" icon={<Info className="w-4 h-4" />} width="max-w-xl"
      footer={
        <ModalFooter>
          <ModalFooterButton onClick={onClose}>Close</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className={CREM_BODY}>
        <div>
          <div className="flex items-center justify-between border-b border-[color:var(--ui-border)] pb-1.5 mb-3">
            <span className={`${CREM_LABEL} text-[color:var(--ui-text-faint)] uppercase font-semibold tracking-wider`}>Project Details</span>
          </div>
          <div className="space-y-2.5">
            {DETAIL_FIELDS.map(f => (
              <div key={f.key} className="flex items-center gap-3">
                {rowLabel(f.label)}
                <CommitInput
                  value={String(productionInfo[f.key as keyof typeof productionInfo] ?? '')}
                  onCommit={v => commitInfo({ [f.key]: v })}
                  readOnly={locked}
                  placeholder={f.label}
                  className={INPUT_CLS}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between border-b border-[color:var(--ui-border)] pb-1.5 mb-3">
            <span className={`${CREM_LABEL} text-[color:var(--ui-text-faint)] uppercase font-semibold tracking-wider`}>Dates</span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {rowLabel('Production Start')}
              {locked ? (
                <span className={`${CREM_TEXT} text-[color:var(--ui-text)]`}>{activeCalendarVersion?.productionStart || '—'}</span>
              ) : (
                <div className="flex-1 min-w-0">
                  <DateField
                    value={activeCalendarVersion?.productionStart ? [activeCalendarVersion.productionStart] : []}
                    onChange={ds => activeCalendarVersion && dispatch({ type: 'UPDATE_CALENDAR_VERSION', payload: { id: activeCalendarVersion.id, productionStart: ds[0] || '' } })}
                    placeholder="Pick a date"
                    initialView={initialViewFor(activeCalendarVersion?.productionStart ? [activeCalendarVersion.productionStart] : [], activeCalendarVersion?.productionStart)}
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {rowLabel('Wrap Date')}
              <span className={`${CREM_TEXT} text-[color:var(--ui-text-faint)]`}>{wrapDate || '—'}</span>
            </div>
            <div className="flex items-center gap-3">
              {rowLabel('Report Date Format')}
              <div className="flex-1 min-w-0">
                <Menu
                  width="w-56"
                  trigger={
                    <button type="button" disabled={locked} className={PICKER_TRIGGER}>
                      <span className="truncate">{DATE_FORMAT_OPTIONS.find(o => o.key === (productionInfo.dateFormat || 'short'))?.label}</span>
                      <ChevronDown className="w-3 h-3 shrink-0 text-[color:var(--ui-text-faint)]" />
                    </button>
                  }
                >
                  {DATE_FORMAT_OPTIONS.map(o => (
                    <DropdownItem key={o.key} onClick={() => commitInfo({ dateFormat: o.key })}>
                      {o.label}
                    </DropdownItem>
                  ))}
                </Menu>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {rowLabel('Timezone')}
              <div className="flex-1 min-w-0">
                {locked ? (
                  <span className={`${CREM_TEXT} text-[color:var(--ui-text)]`}>{productionInfo.timezone || '—'}</span>
                ) : (
                  <Menu
                    width="w-72"
                    searchable
                    searchPlaceholder="Search timezones…"
                    trigger={
                      <button type="button" className={PICKER_TRIGGER}>
                        <span className="truncate">{productionInfo.timezone || `Browser default (${getBrowserTimeZone()})`}</span>
                        <ChevronDown className="w-3 h-3 shrink-0 text-[color:var(--ui-text-faint)]" />
                      </button>
                    }
                  >
                    {COMMON_TIMEZONES.map(tz => (
                      <DropdownItem key={tz} selected={productionInfo.timezone === tz} onClick={() => commitInfo({ timezone: tz })}>
                        {tz}
                      </DropdownItem>
                    ))}
                  </Menu>
                )}
              </div>
              <span className="text-[10px] text-[color:var(--ui-text-faint)] w-32 shrink-0 text-right">Sunrise / sunset &amp; weather</span>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between border-b border-[color:var(--ui-border)] pb-1.5 mb-3">
            <span className={`${CREM_LABEL} text-[color:var(--ui-text-faint)] uppercase font-semibold tracking-wider`}>Key Positions</span>
          </div>
          <div className="space-y-2">
            {KEY_POSITIONS.map(kp => {
              const people = crew[kp.key] || [];
              const candidates = allPeople.filter(a => a.role !== kp.key);
              // Department buckets (roadmap 318) — the crew catalogue's own
              // grouping, ordered by `departmentOrder`.
              const counts = new Map<string, number>();
              const items: SearchMenuItem[] = candidates.map(a => {
                const group = deptOfRole.get(a.role) || 'Other';
                counts.set(group, (counts.get(group) || 0) + 1);
                return {
                  id: a.person.id,
                  label: a.person.name,
                  group,
                  detail: roleLabel(a.role),
                  fields: [
                    { label: 'Role', value: roleLabel(a.role) },
                    { label: 'Phone', value: a.person.phone || '' },
                    { label: 'Email', value: a.person.email || '' },
                  ],
                };
              });
              const groups: SearchMenuGroup[] = depts
                .filter(d => counts.has(d))
                .map(d => ({ key: d, label: d, count: counts.get(d) }));
              return (
                <div key={kp.key} className="flex items-center gap-3 rounded border border-[color:var(--ui-border)] bg-[var(--ui-card-band)] px-3 py-2">
                  <span className={`${CREM_LABEL} text-[color:var(--ui-text)] w-40 shrink-0 font-medium`}>{kp.label}</span>
                  <span className={`flex-1 min-w-0 truncate ${CREM_TEXT} ${people.length ? 'text-[color:var(--ui-text-strong)]' : 'text-[color:var(--ui-text-faint)] italic'}`}>
                    {people.length > 0 ? people.map((p: CrewPerson) => p.name).join(', ') : '— unassigned —'}
                  </span>
                  {!locked && (
                    <SearchMenu
                      mode="expandable"
                      theme={ambient?.mode ?? 'light'}
                      items={items}
                      groups={groups}
                      triggerLabel="Assign"
                      triggerIcon={<UserPlus className="w-3.5 h-3.5" />}
                      placeholder="Search crew…"
                      onSelect={item => {
                        const hit = candidates.find(a => a.person.id === item.id);
                        if (hit) movePersonToRole(hit.person, hit.role, kp.key);
                      }}
                      expandableGroups
                      groupExpandMode="single"
                      collapsedWidth={104}
                      expandedWidth={220}
                      panelWidth={300}
                      emptyHint="Try a name, role, phone or department — or add a new person."
                      emptyActions={[{
                        label: (query: string) => query.trim() ? `Add “${query.trim()}”…` : 'Add new person…',
                        icon: <Plus className="w-3.5 h-3.5" />,
                        onClick: (query: string) => {
                          if (query.trim()) addPersonToRole(kp.key, query);
                          else void addPersonPrompt(kp.key);
                        },
                      }]}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
};

/** Last production section's date (memoized — `useDaybreakSections` recomputes
 *  on every store change, so derive the wrap label once per sections change). */

export default ProductionDetailsModal;
