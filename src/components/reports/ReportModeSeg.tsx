import React from 'react';
import { Seg } from '@gabriel/ui-kit';
import type { ReportViewMode } from '../../types';

/**
 * Fields | Values display-mode switch (roadmap 203) — the ONE segmented
 * control for the Reports Designer toolbar and the Call Sheet editor toolbar
 * (roadmap 212). `value`/`onChange` are host-owned; the shared
 * `useReportViewMode` hook persists the choice.
 */
interface ReportModeSegProps {
  value: ReportViewMode;
  onChange: (mode: ReportViewMode) => void;
}

const ReportModeSeg: React.FC<ReportModeSegProps> = ({ value, onChange }) => (
  <Seg
    variant="track"
    theme="dark"
    dense
    value={value}
    options={[
      { v: 'fields', l: 'Fields', title: 'Fields — chips everywhere; text and tables edit in place', dataProps: { 'data-presence-anchor': 'toolbar:designer:fields' } },
      { v: 'values', l: 'Values', title: 'Values — the final look; double-click or tap again to edit', dataProps: { 'data-presence-anchor': 'toolbar:designer:values' } },
    ]}
    onChange={v => onChange(v as ReportViewMode)}
  />
);

export default ReportModeSeg;
