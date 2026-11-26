import React, { useEffect, useState } from 'react';
import { useProject } from '../../store';
import { boardIdOf, boardLabel, elementKey, getCategoryElements, isDuplicateBoardId, compareBoardIds } from '../../lib/elements';
import { CAST_DETAIL_FIELDS, type CastDetailKey } from '../../lib/castDetails';
import type { CastMember } from '../../types';
import { isImeConfirm } from '../../lib/keys';
import { TB_INPUT } from '@gabriel/ui-kit';
import { InspectorGroupCard, InspectorRow, InspectorSection, InspectorSubGroup, InspectorSurfaceContext } from '../inspector';

/**
 * Element View → Properties (roadmap 306, 373 batch d). Built-in element
 * fields for every category + the cast performer/booking set from 157, laid
 * out with the shared inspector rows (42px label column, section cards, master
 * groups). Related fields share a row (Phone + Email, Agent + Ph, Rate + Per)
 * and every text box uses the same width. All edits commit on blur/Enter
 * (roadmap 250) through the SAME actions the manager uses — one source of
 * truth, one undo entry per commit.
 */

/** Wide-surface label column: the modal can afford more than the 42px rail. */
const LABEL_W = '4.5rem';
/** One width for every free-text box — mixed widths read as broken chrome. */
const TEXT_W = 'w-56';
/** Numbers and the booking basis stay compact by expected range. */
const NUM_W = 'w-20';

function detailLabel(key: CastDetailKey): string {
  return CAST_DETAIL_FIELDS.find(f => f.key === key)?.label || key;
}

function PanelInput({ label, value, onCommit, readOnly, numeric, testKey, width }: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  readOnly?: boolean;
  numeric?: boolean;
  testKey: string;
  width: string;
}) {
  const [draft, setDraft] = useState(value);
  // Follow store changes (element switch, undo, a peer edit) unless typing.
  useEffect(() => { setDraft(value); }, [value]);
  const commit = () => {
    if (readOnly) return;
    if (draft !== value) onCommit(draft.trim());
  };
  return (
    <input
      type="text"
      inputMode={numeric ? 'numeric' : undefined}
      aria-label={label}
      value={draft}
      readOnly={readOnly}
      disabled={readOnly}
      data-element-view-field={testKey}
      onChange={e => setDraft(numeric ? e.target.value.replace(/[^0-9]/g, '') : e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter' && !isImeConfirm(e)) { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
      }}
      className={`${TB_INPUT} ${width}`}
    />
  );
}

/** A row: one concept, label column + control column (which may hold a pair). */
const PanelRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <InspectorRow label={label} labelWidth={LABEL_W}>{children}</InspectorRow>
);

/** A second field inside the same row — its own short inline label in a fixed
 *  little column so the paired inputs line up across rows. */
const InlineField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <InspectorSubGroup>
    <span className="w-9 shrink-0 pr-1.5 text-right text-[10px] text-[color:var(--ui-text-muted)]">{label}</span>
    {children}
  </InspectorSubGroup>
);

export function ElementPropertiesSection({ category, elementKey: selectedKey, onKeyChange }: {
  category: string;
  elementKey: string;
  /** Cast Board IDs are identity — a change must move the panel's selection. */
  onKeyChange?: (key: string) => void;
}) {
  const { state, dispatch, locked } = useProject();
  const project = state.present;
  const elements = getCategoryElements(project, category);
  const element = elements.find(e => elementKey(e) === selectedKey);
  if (!element) {
    return <div className="p-6 text-xs text-[color:var(--ui-text-faint)]">This element no longer exists.</div>;
  }
  const isCast = category === 'cast';
  const member = element as CastMember;
  const boardId = boardIdOf(element, category);

  const saveName = (name: string) => {
    if (!name) return;
    if (isCast) {
      dispatch({ type: 'UPDATE_CAST_MEMBER', payload: { ...member, name: name.toUpperCase() } });
    } else {
      dispatch({ type: 'UPDATE_ELEMENT', payload: { category, id: element.id, updates: { name } } });
    }
  };

  const saveBoardId = (value: string) => {
    if (!value) return;
    if (isDuplicateBoardId(elements, category, value, elementKey(element))) return;
    if (isCast) {
      // Cast's Board ID IS the id: the reducer re-points every scene reference.
      dispatch({ type: 'UPDATE_ELEMENT', payload: { category, id: element.id, updates: { id: value } } });
      onKeyChange?.(value);
    } else {
      dispatch({ type: 'UPDATE_ELEMENT', payload: { category, id: element.id, updates: { boardId: value } } });
    }
  };

  const saveDetail = (key: CastDetailKey, value: string) => {
    dispatch({ type: 'UPDATE_CAST_MEMBER', payload: { ...member, [key]: value } });
  };

  const inputFor = (key: CastDetailKey, width = TEXT_W) => (
    <PanelInput
      key={key}
      label={detailLabel(key)}
      value={member[key] || ''}
      onCommit={v => saveDetail(key, v)}
      readOnly={locked}
      width={width}
      testKey={key}
    />
  );

  return (
    <InspectorSurfaceContext.Provider value="panel">
      <div className="flex flex-col gap-4 px-6 py-5">
        <InspectorGroupCard label="Element">
          <InspectorSection label="Identity">
            <PanelRow label="Board ID">
              <PanelInput label="Board ID" value={boardId} onCommit={saveBoardId} readOnly={locked} numeric width="w-16" testKey="boardId" />
            </PanelRow>
            <PanelRow label={isCast ? 'Character' : 'Name'}>
              <PanelInput label={isCast ? 'Character' : 'Name'} value={element.name} onCommit={saveName} readOnly={locked} width={TEXT_W} testKey="name" />
            </PanelRow>
          </InspectorSection>
        </InspectorGroupCard>

        {isCast ? (
          <InspectorGroupCard label={'Performer & booking'}>
            <InspectorSection label="Contact">
              <PanelRow label="Artiste">{inputFor('performer')}</PanelRow>
              <PanelRow label="Phone">
                {inputFor('phone')}
                <InlineField label="Email">{inputFor('email')}</InlineField>
              </PanelRow>
            </InspectorSection>

            <InspectorSection label="Agent">
              <PanelRow label="Agent">
                {inputFor('agent')}
                <InlineField label="Ph">{inputFor('agentPhone')}</InlineField>
              </PanelRow>
              <PanelRow label="Address">
                {inputFor('address')}
                <InlineField label="Email">{inputFor('agentEmail')}</InlineField>
              </PanelRow>
            </InspectorSection>

            <InspectorSection label="Booking">
              <PanelRow label="Rate">
                {inputFor('rate', NUM_W)}
                <InlineField label="Per">{inputFor('per', NUM_W)}</InlineField>
              </PanelRow>
              <PanelRow label="Notes">{inputFor('notes', 'w-full')}</PanelRow>
            </InspectorSection>
          </InspectorGroupCard>
        ) : (
          <p className="px-1 text-[10px] leading-relaxed text-[color:var(--ui-text-faint)]">
            Performer details are cast-only. Per-category custom fields are roadmap 307; for now this panel edits the
            element's built-in properties.
          </p>
        )}
      </div>
    </InspectorSurfaceContext.Provider>
  );
}

/** The element list for the picker — every category by Board ID, ties by name
 *  (roadmap 305), labelled "N. NAME". */
export function elementViewOptions(project: any, category: string): { key: string; id: string; name: string; label: string }[] {
  const list = getCategoryElements(project, category).slice();
  list.sort((a, b) => compareBoardIds(boardIdOf(a, category), boardIdOf(b, category)) || (a.name || '').localeCompare(b.name || ''));
  return list.map(e => {
    const boardId = boardIdOf(e, category);
    return { key: elementKey(e), id: e.id, name: e.name, label: boardLabel(boardId, e.name || e.id) };
  });
}
