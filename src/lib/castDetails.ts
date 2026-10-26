import { useEffect, useState } from 'react';
import type { CastMember } from '../types';

/**
 * Cast performer + booking details (roadmap 157) — the MMS Cast Members
 * `PropertyDefinition` set (Full Name/Phone/Agent/…), plus a Lemon email.
 *
 * ONE field registry feeds the Element Manager columns, the report field
 * getters and the MSD import mapping — never three copies. Fields live on
 * `CastMember` (optional strings; no migration needed) and never on crew
 * records: a performer is not crew.
 */

export type CastDetailKey =
  | 'performer'
  | 'phone'
  | 'email'
  | 'agent'
  | 'agentPhone'
  | 'address'
  | 'rate'
  | 'per'
  | 'notes';

export type CastDetails = Pick<CastMember, CastDetailKey>;

export interface CastDetailField {
  key: CastDetailKey;
  /** Column / report label. `performer` is the call sheet's "Artiste". */
  label: string;
  /** Element Manager column width (px). */
  width: number;
}

export const CAST_DETAIL_FIELDS: CastDetailField[] = [
  { key: 'performer', label: 'Artiste', width: 150 },
  { key: 'phone', label: 'Phone', width: 120 },
  { key: 'email', label: 'Email', width: 170 },
  { key: 'agent', label: 'Agent', width: 160 },
  { key: 'agentPhone', label: 'Agent Ph', width: 120 },
  { key: 'address', label: 'Address', width: 200 },
  { key: 'rate', label: 'Rate', width: 70 },
  { key: 'per', label: 'Per', width: 56 },
  { key: 'notes', label: 'Notes', width: 200 },
];

/** MMS `<Property Name>` → CastDetailKey (the fixture's PropertyDefinitions). */
const MMS_PROPERTY_MAP: Record<string, CastDetailKey> = {
  'Full Name': 'performer',
  Phone: 'phone',
  Agent: 'agent',
  'Agent Ph': 'agentPhone',
  Address: 'address',
  Rate: 'rate',
  Per: 'per',
  Notes: 'notes',
};

/** Any cast details as a complete key→string record (blanks, never undefined). */
export function castDetailsOf(member: Partial<CastDetails> | null | undefined): Record<CastDetailKey, string> {
  const out = {} as Record<CastDetailKey, string>;
  for (const f of CAST_DETAIL_FIELDS) out[f.key] = String(member?.[f.key] ?? '');
  return out;
}

/**
 * Pure mapper for MMS cast `<Property>` children (DOM parsing stays in
 * `msd.ts`; this is the unit-tested part). Unknown names are ignored; empty
 * values are dropped so a file's blank properties don't overwrite defaults.
 */
export function castDetailsFromMmsProperties(
  properties: { name: string; value: string }[],
): CastDetails {
  const out: Partial<CastDetails> = {};
  for (const p of properties) {
    const key = MMS_PROPERTY_MAP[p.name.trim()];
    const value = String(p.value ?? '').trim();
    if (!key || !value) continue;
    out[key] = value;
  }
  return out as CastDetails;
}

const CAST_DETAILS_OPEN_KEY = 'lemon_schedule_cast_details_open';

/** Per-user "show the extended cast columns" pref (the Element Manager only). */
export function useCastDetailsOpen(): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(CAST_DETAILS_OPEN_KEY) === 'true'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(CAST_DETAILS_OPEN_KEY, String(open)); } catch { /* ignore */ }
  }, [open]);
  return [open, setOpen];
}
