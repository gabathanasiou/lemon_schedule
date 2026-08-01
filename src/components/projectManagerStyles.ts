import { IS_COARSE } from '../lib/device';

export const PM_BTN_PAD = IS_COARSE ? 'p-2' : 'p-1.5';
export const PM_ICON = IS_COARSE ? 'w-4 h-4' : 'w-3.5 h-3.5';
export const PM_ICON_SM = IS_COARSE ? 'w-3.5 h-3.5' : 'w-3 h-3';
export const PM_INPUT = IS_COARSE ? 'px-3 py-2 text-sm' : 'px-2.5 py-1.5 text-xs';
export const PM_TITLE = IS_COARSE ? 'text-sm' : 'text-xs';
export const PM_SUBTITLE = IS_COARSE ? 'text-xs' : 'text-[10px]';
