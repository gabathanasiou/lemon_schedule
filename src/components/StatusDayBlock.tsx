import React from 'react';
import { StatusDayEntry } from '../types';
import { formatDateLong } from '../lib/utils';
import { Pause, Truck } from 'lucide-react';

interface StatusDayBlockProps {
  entry: StatusDayEntry;
  date: string;
}

const STATUS_CONFIG = {
  hold: { bg: 'bg-red-900/40', border: 'border-red-700/60', label: 'HOLD', labelClass: 'text-red-400', icon: Pause },
  travel: { bg: 'bg-purple-900/40', border: 'border-purple-700/60', label: 'TRAVEL', labelClass: 'text-purple-400', icon: Truck },
} as const;

const StatusDayBlock: React.FC<StatusDayBlockProps> = ({ entry, date }) => {
  const config = STATUS_CONFIG[entry.status];
  const Icon = config.icon;

  return (
    <div className={`border-y border-dashed py-2 px-3 ${config.bg} ${config.border}`}>
      <div className="flex items-center gap-2 text-xs font-medium">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className={config.labelClass}>{config.label}</span>
        <span className="text-zinc-400">{formatDateLong(date)}</span>
        {entry.label && <span className="text-zinc-500">· {entry.label}</span>}
      </div>
    </div>
  );
};

export default StatusDayBlock;
