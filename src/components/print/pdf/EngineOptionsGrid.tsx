import React from 'react';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, Check } from 'lucide-react';

export interface EngineOptions {
  engine: 'browser' | 'pdf';
  pdfOrientation: 'portrait' | 'landscape';
  pdfPaperSize: 'a4' | 'letter';
}

interface EngineOptionsGridProps {
  options: EngineOptions;
  onChange: (patch: Partial<EngineOptions>) => void;
}

const DROPDOWN_ITEM_CLASS = (active: boolean) =>
  `flex items-center gap-2 px-3 py-2 rounded text-xs transition-colors outline-none cursor-pointer select-none ${
    active ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
  }`;

const EngineOptionsGrid: React.FC<EngineOptionsGridProps> = ({ options, onChange }) => {
  const { engine, pdfOrientation, pdfPaperSize } = options;

  return (
    <div className="space-y-3">
      <div className="flex items-center border-b border-zinc-800 pb-1.5">
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex-1">Print Engine</span>
        <div className="flex items-center gap-3">
          <RadixDropdownMenu.Root>
            <RadixDropdownMenu.Trigger asChild>
              <button className="flex items-center justify-between px-2.5 py-1.5 bg-zinc-950 border border-zinc-700 rounded-md text-xs text-zinc-200 hover:bg-zinc-900 transition-colors gap-1.5 min-w-[90px]">
                <span>{engine === 'browser' ? 'Browser' : 'PDF'}</span>
                <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
              </button>
            </RadixDropdownMenu.Trigger>
            <RadixDropdownMenu.Portal>
              <RadixDropdownMenu.Content
                className="bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-[10001] p-1 min-w-[140px]"
                align="end"
                sideOffset={4}
                collisionPadding={8}
              >
                <RadixDropdownMenu.Item onSelect={() => onChange({ engine: 'browser' })} className={DROPDOWN_ITEM_CLASS(engine === 'browser')}>
                  <span className="flex-1">Browser</span>
                  {engine === 'browser' && <Check className="w-3 h-3 shrink-0" />}
                </RadixDropdownMenu.Item>
                <RadixDropdownMenu.Item onSelect={() => onChange({ engine: 'pdf' })} className={DROPDOWN_ITEM_CLASS(engine === 'pdf')}>
                  <span className="flex-1">PDF</span>
                  {engine === 'pdf' && <Check className="w-3 h-3 shrink-0" />}
                </RadixDropdownMenu.Item>
              </RadixDropdownMenu.Content>
            </RadixDropdownMenu.Portal>
          </RadixDropdownMenu.Root>

          {engine === 'pdf' && (
            <>
              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Orient</span>
              <RadixDropdownMenu.Root>
                <RadixDropdownMenu.Trigger asChild>
                  <button className="flex items-center justify-between px-2.5 py-1.5 bg-zinc-950 border border-zinc-700 rounded-md text-xs text-zinc-200 hover:bg-zinc-900 transition-colors gap-1.5 min-w-[80px]">
                    <span>{pdfOrientation === 'portrait' ? 'Portrait' : 'Landscape'}</span>
                    <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
                  </button>
                </RadixDropdownMenu.Trigger>
                <RadixDropdownMenu.Portal>
                  <RadixDropdownMenu.Content
                    className="bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-[10001] p-1 min-w-[140px]"
                    align="end"
                    sideOffset={4}
                    collisionPadding={8}
                  >
                    <RadixDropdownMenu.Item onSelect={() => onChange({ pdfOrientation: 'portrait' })} className={DROPDOWN_ITEM_CLASS(pdfOrientation === 'portrait')}>
                      <span className="flex-1">Portrait</span>
                      {pdfOrientation === 'portrait' && <Check className="w-3 h-3 shrink-0" />}
                    </RadixDropdownMenu.Item>
                    <RadixDropdownMenu.Item onSelect={() => onChange({ pdfOrientation: 'landscape' })} className={DROPDOWN_ITEM_CLASS(pdfOrientation === 'landscape')}>
                      <span className="flex-1">Landscape</span>
                      {pdfOrientation === 'landscape' && <Check className="w-3 h-3 shrink-0" />}
                    </RadixDropdownMenu.Item>
                  </RadixDropdownMenu.Content>
                </RadixDropdownMenu.Portal>
              </RadixDropdownMenu.Root>

              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Paper</span>
              <RadixDropdownMenu.Root>
                <RadixDropdownMenu.Trigger asChild>
                  <button className="flex items-center justify-between px-2.5 py-1.5 bg-zinc-950 border border-zinc-700 rounded-md text-xs text-zinc-200 hover:bg-zinc-900 transition-colors gap-1.5 min-w-[60px]">
                    <span>{pdfPaperSize === 'a4' ? 'A4' : 'Letter'}</span>
                    <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
                  </button>
                </RadixDropdownMenu.Trigger>
                <RadixDropdownMenu.Portal>
                  <RadixDropdownMenu.Content
                    className="bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl z-[10001] p-1 min-w-[140px]"
                    align="end"
                    sideOffset={4}
                    collisionPadding={8}
                  >
                    <RadixDropdownMenu.Item onSelect={() => onChange({ pdfPaperSize: 'a4' })} className={DROPDOWN_ITEM_CLASS(pdfPaperSize === 'a4')}>
                      <span className="flex-1">A4</span>
                      {pdfPaperSize === 'a4' && <Check className="w-3 h-3 shrink-0" />}
                    </RadixDropdownMenu.Item>
                    <RadixDropdownMenu.Item onSelect={() => onChange({ pdfPaperSize: 'letter' })} className={DROPDOWN_ITEM_CLASS(pdfPaperSize === 'letter')}>
                      <span className="flex-1">Letter</span>
                      {pdfPaperSize === 'letter' && <Check className="w-3 h-3 shrink-0" />}
                    </RadixDropdownMenu.Item>
                  </RadixDropdownMenu.Content>
                </RadixDropdownMenu.Portal>
              </RadixDropdownMenu.Root>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EngineOptionsGrid;
