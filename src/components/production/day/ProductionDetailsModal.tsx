import React, { useState } from 'react';
import { ChevronDown, Info, Plus, UserPlus } from 'lucide-react';
import { useProject } from '../../../store';
import { generateUUID, formatDateShort, DATE_FORMAT_OPTIONS } from '../../../lib/utils';
import { useDaybreakSections } from '../../../lib/useDaybreakSections';
import { getBrowserTimeZone, COMMON_TIMEZONES } from '../../../lib/timezones';
import { useDialog } from '../../Dialog';
import { requestUnsavedSave } from '../../../lib/unsavedGuard';
import Modal, { ModalFooter } from '../../Modal';
import ModalFooterButton from '../../ModalFooterButton';
import DropdownMenu from '../../DropdownMenu';
import DropdownItem from '../../DropdownItem';
import DropdownDivider from '../../DropdownDivider';
import { CommitInput } from '../../CommitInput';
import DateField from '../../DateField';
import Button from '../../Button';
import { initialViewFor } from '../../calendar/calendarUtils';
import { ruleModalSizes } from '../../rules/ColorRuleFormParts';
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

const INPUT_CLS = 'flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400 disabled:opacity-50';
const PICKER_TRIGGER = 'flex w-full items-center justify-between gap-2 rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-xs text-zinc-200 outline-none hover:bg-zinc-900 focus:border-zinc-500 disabled:opacity-50';

// Controlled click-to-toggle dark menu (the modal surfaces).
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
      theme="dark"
    >
      {children}
    </DropdownMenu>
  );
};

export const ProductionDetailsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state, dispatch, readOnly } = useProject();
  const project = state.present;
  const dialog = useDialog();
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

  const wrapDate = React.useMemo(() => {
    const last = productionSections[productionSections.length - 1];
    return last ? formatDateShort(last.date) : '';
  }, [productionSections]);
  const [addingName, setAddingName] = useState<{ role: string } | null>(null);
  const [tzOpen, setTzOpen] = useState(false);

  const commitInfo = (patch: Record<string, string>) => dispatch({ type: 'SET_PRODUCTION_INFO', payload: patch });

  const addPersonToRole = (role: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    dispatch({ type: 'ADD_CREW_PERSON', payload: { role, person: { id: generateUUID(), name: trimmed } } });
  };

  const movePersonToRole = (person: CrewPerson, fromRole: string, toRole: string) => {
    if (fromRole === toRole) return;
    void requestUnsavedSave(dialog, () => dispatch({ type: 'UPDATE_CREW_PERSON', payload: { role: fromRole, id: person.id, updates: {}, toRole } }));
  };

  const rowLabel = (text: string) => <span className={`${CREM_LABEL} text-zinc-400 w-40 shrink-0`}>{text}</span>;

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
          <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-3">
            <span className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider`}>Project Details</span>
          </div>
          <div className="space-y-2.5">
            {DETAIL_FIELDS.map(f => (
              <div key={f.key} className="flex items-center gap-3">
                {rowLabel(f.label)}
                <CommitInput
                  value={String(productionInfo[f.key as keyof typeof productionInfo] ?? '')}
                  onCommit={v => commitInfo({ [f.key]: v })}
                  readOnly={readOnly}
                  placeholder={f.label}
                  className={INPUT_CLS}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-3">
            <span className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider`}>Dates</span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {rowLabel('Production Start')}
              {readOnly ? (
                <span className={`${CREM_TEXT} text-zinc-300`}>{activeCalendarVersion?.productionStart || '—'}</span>
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
              <span className={`${CREM_TEXT} text-zinc-500`}>{wrapDate || '—'}</span>
            </div>
            <div className="flex items-center gap-3">
              {rowLabel('Report Date Format')}
              <div className="flex-1 min-w-0">
                <Menu
                  width="w-56"
                  trigger={
                    <button type="button" disabled={readOnly} className={PICKER_TRIGGER}>
                      <span className="truncate">{DATE_FORMAT_OPTIONS.find(o => o.key === (productionInfo.dateFormat || 'short'))?.label}</span>
                      <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
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
                {readOnly ? (
                  <span className={`${CREM_TEXT} text-zinc-300`}>{productionInfo.timezone || '—'}</span>
                ) : (
                  <Menu
                    width="w-72"
                    searchable
                    searchPlaceholder="Search timezones…"
                    trigger={
                      <button type="button" className={PICKER_TRIGGER}>
                        <span className="truncate">{productionInfo.timezone || `Browser default (${getBrowserTimeZone()})`}</span>
                        <ChevronDown className="w-3 h-3 shrink-0 text-zinc-500" />
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
              <span className="text-[10px] text-zinc-600 w-32 shrink-0 text-right">Sunrise / sunset &amp; weather</span>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 mb-3">
            <span className={`${CREM_LABEL} text-zinc-500 uppercase font-semibold tracking-wider`}>Key Positions</span>
          </div>
          <div className="space-y-2">
            {KEY_POSITIONS.map(kp => {
              const people = crew[kp.key] || [];
              const candidates = allPeople.filter(a => a.role !== kp.key);
              return (
                <div key={kp.key} className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                  <span className={`${CREM_LABEL} text-zinc-300 w-40 shrink-0 font-medium`}>{kp.label}</span>
                  <span className={`flex-1 min-w-0 truncate ${CREM_TEXT} ${people.length ? 'text-zinc-200' : 'text-zinc-600 italic'}`}>
                    {people.length > 0 ? people.map((p: CrewPerson) => p.name).join(', ') : '— unassigned —'}
                  </span>
                  {!readOnly && (
                    <Menu
                      onClose={() => setAddingName(null)}
                      trigger={
                        <Button variant="subtle" type="button" className="gap-1">
                          <UserPlus className="w-3.5 h-3.5" /> Assign
                          <ChevronDown className="w-3 h-3" />
                        </Button>
                      }
                    >
                      {candidates.map(a => (
                        <DropdownItem key={a.person.id} onClick={() => movePersonToRole(a.person, a.role, kp.key)}>
                          {a.person.name} <span className="text-zinc-500">({roleLabel(a.role)})</span>
                        </DropdownItem>
                      ))}
                      {candidates.length > 0 && <DropdownDivider />}
                      <DropdownItem onClick={() => setAddingName({ role: kp.key })} icon={<Plus className="w-3.5 h-3.5" />}>
                        Add new person…
                      </DropdownItem>
                    </Menu>
                  )}
                  {addingName?.role === kp.key && (
                    <CommitInput
                      value=""
                      onCommit={v => { addPersonToRole(kp.key, v); setAddingName(null); }}
                      readOnly={readOnly}
                      placeholder="Name"
                      className="w-40 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 outline-none placeholder:text-zinc-500"
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
