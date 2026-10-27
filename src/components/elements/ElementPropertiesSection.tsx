import React, { useEffect, useState } from 'react';
import { useProject } from '../../store';
import { boardIdOf, elementKey, getCategoryElements, isDuplicateBoardId, compareBoardIds } from '../../lib/elements';
import { CAST_DETAIL_FIELDS, type CastDetailKey } from '../../lib/castDetails';
import type { CastMember } from '../../types';

/**
 * Element View → Properties (roadmap 306). Built-in element fields for every
 * category + the cast performer/booking set from 157. All edits commit on
 * blur/Enter (roadmap 250) through the SAME actions the manager uses — one
 * source of truth, one undo entry per commit.
 */

const FIELD_LABEL = 'block text-[10px] font-semibold text-[color:var(--ui-text-faint)] uppercase tracking-wider mb-1';
const FIELD_INPUT = 'w-full bg-[var(--ui-input-bg)] border border-[color:var(--ui-input-border)] rounded px-2 py-1.5 text-xs text-[color:var(--ui-input-text)] placeholder:text-[color:var(--ui-text-faint)] outline-none focus:border-[color:var(--ui-input-focus-border)] disabled:opacity-50';

function PanelField({ label, value, onCommit, readOnly, numeric, testKey }: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  readOnly?: boolean;
  numeric?: boolean;
  testKey: string;
}) {
  const [draft, setDraft] = useState(value);
  // Follow store changes (element switch, undo, a peer edit) unless typing.
  useEffect(() => { setDraft(value); }, [value]);
  const commit = () => {
    if (readOnly) return;
    if (draft !== value) onCommit(draft.trim());
  };
  return (
    <label className="block min-w-0">
      <span className={FIELD_LABEL}>{label}</span>
      <input
        type="text"
        inputMode={numeric ? 'numeric' : undefined}
        value={draft}
        readOnly={readOnly}
        disabled={readOnly}
        data-element-view-field={testKey}
        onChange={e => setDraft(numeric ? e.target.value.replace(/[^0-9]/g, '') : e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        }}
        className={FIELD_INPUT}
      />
    </label>
  );
}

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

  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <PanelField label="Board ID" value={boardId} onCommit={saveBoardId} readOnly={locked} numeric testKey="boardId" />
        <PanelField label={isCast ? 'Character' : 'Name'} value={element.name} onCommit={saveName} readOnly={locked} testKey="name" />
      </div>

      {isCast ? (
        <div className="space-y-2">
          <div className={FIELD_LABEL}>Performer &amp; booking</div>
          <div className="grid grid-cols-2 gap-3">
            {CAST_DETAIL_FIELDS.map(f => (
              <PanelField
                key={f.key}
                label={f.label}
                value={member[f.key] || ''}
                onCommit={v => saveDetail(f.key, v)}
                readOnly={locked}
                testKey={f.key}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-[color:var(--ui-text-faint)] leading-relaxed">
          Performer details are cast-only. Per-category custom fields are roadmap 307; for now this panel edits the
          element's built-in properties.
        </p>
      )}
    </div>
  );
}

/** The element list for the picker — cast by Board ID, others by name. */
export function elementViewOptions(project: any, category: string): { key: string; id: string; name: string; label: string }[] {
  const list = getCategoryElements(project, category).slice();
  if (category === 'cast') {
    list.sort((a, b) => compareBoardIds(boardIdOf(a, category), boardIdOf(b, category)) || a.name.localeCompare(b.name));
  } else {
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }
  return list.map(e => {
    const boardId = boardIdOf(e, category);
    return { key: elementKey(e), id: e.id, name: e.name, label: boardId ? `${boardId}. ${e.name || e.id}` : (e.name || e.id) };
  });
}
