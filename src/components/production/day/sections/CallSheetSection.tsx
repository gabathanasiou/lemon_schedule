import React, { useMemo } from 'react';
import { FileText, Pencil, Printer } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import GroupedSelect, { GroupedSelectItem } from '../GroupedSelect';
import type { ReportDesign } from '../../../../types';

const isCallSheet = (d: ReportDesign) => /call\s*sheet/i.test(d.name);

const CallSheetSection: React.FC<DaySectionProps> = ({ project, actions, readOnly }) => {
  const designs = project.reportDesigns || [];

  const items: GroupedSelectItem[] = useMemo(() => designs.map(d => ({
    id: d.id,
    name: d.name,
    group: isCallSheet(d) ? 'Call Sheets' : 'Other Reports',
  })), [designs]);

  const designId = actions.callSheetDesignId || '';

  if (designs.length === 0) {
    return <p className="text-xs text-zinc-400">No report designs yet. Create one in Design → Reports Designer.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500 w-20 shrink-0">Design</span>
        <GroupedSelect className="flex-1 min-w-0" items={items} mode="single" selectedIds={designId ? [designId] : []} onChange={ids => actions.selectCallSheetDesign?.(ids[0] || '')} />
        <button type="button" disabled={readOnly || !designId} onClick={() => actions.openCallSheet?.()} className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 disabled:opacity-40 shrink-0">
          <Pencil className="w-3.5 h-3.5" /> Edit
        </button>
        <button type="button" disabled={!designId} onClick={() => actions.printCallSheet?.()} className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 disabled:opacity-40 shrink-0">
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
      </div>
      <p className="text-[11px] text-zinc-400">The live preview is on the right (desktop) or via the Call Sheet toggle (iPad).</p>
    </div>
  );
};

export const CallSheetIcon = FileText;

export default CallSheetSection;
