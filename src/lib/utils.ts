import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Scene } from "../types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Convert "1 3/8" or "2/8" or "1" or "1.4" (eighths) or "1.5" (decimal) to number
export function parsePageCount(fraction: string): number {
  if (!fraction) return 0;

  // e.g. "1.5" or "2.375" → decimal
  const decimalMatch = fraction.trim().match(/^(-?\d+(?:\.\d+)?)$/);
  if (decimalMatch) return parseFloat(decimalMatch[1]);

  let whole = 0;
  let fracPart = '';
  const parts = fraction.trim().split(' ');
  if (parts.length === 2) {
    whole = parseInt(parts[0], 10);
    fracPart = parts[1];
  } else if (parts.length === 1) {
    if (parts[0].includes('/')) {
      fracPart = parts[0];
    } else {
      whole = parseInt(parts[0], 10);
    }
  }

  if (Number.isNaN(whole)) whole = 0;

  if (fracPart) {
    const [num, den] = fracPart.split('/');
    if (num && den) {
      const n = parseInt(num, 10);
      const d = parseInt(den, 10);
      if (!Number.isNaN(n) && !Number.isNaN(d) && d !== 0) {
        return whole + (n / d);
      }
    }
  }

  return whole;
}

// Convert decimal back to eighths, e.g. 1.375 -> "1 3/8"
export function formatPageCount(decimal: number): string {
  if (!decimal) return '0';
  const whole = Math.floor(decimal);
  let remainderEighths = Math.round((decimal - whole) * 8);

  // If it rounds up to a full 8/8
  let adjustedWhole = whole;
  if (remainderEighths === 8) {
    adjustedWhole += 1;
    remainderEighths = 0;
  }

  if (adjustedWhole === 0 && remainderEighths === 0) return '0';
  if (remainderEighths === 0) return String(adjustedWhole);
  if (adjustedWhole === 0) return `${remainderEighths}/8`;
  return `${adjustedWhole} ${remainderEighths}/8`;
}

// Convert "1h 30m", "45m", "0d" to total minutes
export function parseDuration(duration: string): number {
  if (!duration) return 0;
  const str = duration.toLowerCase().trim();
  if (str === '0d' || str === '0') return 0;
  
  let totalMinutes = 0;
  const hoursMatch = str.match(/(\d+)\s*h/);
  if (hoursMatch) totalMinutes += parseInt(hoursMatch[1], 10) * 60;
  
  const minsMatch = str.match(/(\d+)\s*m/);
  if (minsMatch) totalMinutes += parseInt(minsMatch[1], 10);
  
  // If hours given but no explicit "m", treat trailing number as minutes (e.g. "1h25")
  if (hoursMatch && !minsMatch) {
    const afterH = str.slice(hoursMatch.index! + hoursMatch[0].length).trim();
    const trailingNum = afterH.match(/^(\d+)/);
    if (trailingNum) totalMinutes += parseInt(trailingNum[1], 10);
  }
  
  if (!hoursMatch && !minsMatch) {
    // maybe it's just a number like "45"
    const parsed = parseInt(str, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  
  return totalMinutes;
}

export function formatDuration(minutes: number): string {
  if (minutes === 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

// Time from "12:00" string
export function parseTime(timeStr: string): { hour: number; minute: number } {
  const [h, m] = (timeStr || '00:00').split(':');
  return {
    hour: parseInt(h || '0', 10),
    minute: parseInt(m || '0', 10)
  };
}

export function addMinutesToTime(timeStr: string, minutesToAdd: number): string {
  let { hour, minute } = parseTime(timeStr);
  minute += minutesToAdd;
  hour += Math.floor(minute / 60);
  minute = minute % 60;
  // Handle wrapping around midnight by keeping it rolling over visually
  // but if we want to display e.g. "25:30" or "01:30"
  // Spec says: "call times after midnight should display as e.g. "00:45""
  const printHour = ((hour % 24) + 24) % 24; // positive modulo
  return `${String(printHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function getElapsedString(startStr: string, currentStr: string, accumulatedDays: number = 0): string {
  // Rough total based on hour differences.
  // Better approach is tracking actual elapsed minutes.
  return ""; 
}

// Natural sort for scene strings
export function naturalSortSceneStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function exportProjectData(data: string, title: string): void {
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.lemon`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportProjectFromStorage(projectId: string, title: string): void {
  const key = `lemon_schedule_project_v1_${projectId}`;
  const stored = localStorage.getItem(key);
  if (!stored) return;
  exportProjectData(stored, title);
}

export function getUniqueCastIds(scenes: Scene[]): string[] {
  const ids = new Set<string>();
  for (const scene of scenes) {
    if (!scene.cast) continue;
    for (const id of scene.cast.split(',').map(c => c.trim()).filter(Boolean)) {
      ids.add(id);
    }
  }
  return Array.from(ids).sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    if (!isNaN(na)) return -1;
    if (!isNaN(nb)) return 1;
    return a.localeCompare(b);
  });
}

export function formatRuleDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatRuleDateShort(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

export function normalizePunctuation(s: string): string {
  return s
    .replace(/[\u2018\u2019\u02BC\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...');
}

export function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const day = d.getDate();
  const month = d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
  const year = d.getFullYear();
  const suffixes = ['TH', 'ST', 'ND', 'RD'];
  const suffix = (day >= 11 && day <= 13) ? 'TH' : suffixes[day % 10] || 'TH';
  return `${weekday} ${day}${suffix} ${month} ${year}`;
}

export function formatDateShort(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ---- report date formats ------------------------------------------------------
// The global date format lives on the project (Production tab → productionInfo.dateFormat)
// and is the source of truth for every date rendered in reports; day lists combine
// it with a per-block display mode (block.dayFormat).

export const DATE_FORMAT_KEYS = ['short', 'monDayYear', 'ymd', 'dmy', 'mdy', 'iso'] as const;
export type DateFormatKey = (typeof DATE_FORMAT_KEYS)[number];

export const DATE_FORMAT_OPTIONS: { key: DateFormatKey; label: string }[] = [
  { key: 'short', label: 'Tue, Aug 11' },
  { key: 'monDayYear', label: 'Aug 11, 2026' },
  { key: 'ymd', label: '2026/08/11' },
  { key: 'dmy', label: '11/08/2026' },
  { key: 'mdy', label: '08/11/2026' },
  { key: 'iso', label: '2026-08-11' },
];

export function formatDateCustom(dateStr: string, key?: DateFormatKey | string): string {
  if (!dateStr) return '';
  if (!key || key === 'short') return formatDateShort(dateStr);
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  switch (key) {
    case 'monDayYear': return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    case 'ymd': return `${y}/${m}/${day}`;
    case 'dmy': return `${day}/${m}/${y}`;
    case 'mdy': return `${m}/${day}/${y}`;
    case 'iso': return `${y}-${m}-${day}`;
    default: return formatDateShort(dateStr);
  }
}

export const DAY_FORMAT_KEYS = ['dayNumDate', 'dayNum', 'date'] as const;
export type DayFormatMode = (typeof DAY_FORMAT_KEYS)[number];

export const DAY_FORMAT_OPTIONS: { key: DayFormatMode; label: string }[] = [
  { key: 'dayNumDate', label: 'Day N (date)' },
  { key: 'dayNum', label: 'Day N' },
  { key: 'date', label: 'Date only' },
];

/** Renders a structured day list ({day, iso}) per the block's day format + global date format. */
export function formatDayList(
  entries: { day: number; iso: string }[],
  mode?: DayFormatMode | null,
  dateKey?: DateFormatKey | string,
): string {
  if (!entries.length) return '';
  return entries.map(e => {
    if (mode === 'dayNum') return `Day ${e.day}`;
    if (mode === 'date') return formatDateCustom(e.iso, dateKey);
    return `Day ${e.day} (${formatDateCustom(e.iso, dateKey)})`;
  }).join(', ');
}

/**
 * In-app clipboard mirror. The Async Clipboard API can fail on iPad (no user
 * activation for synthetic pen clicks, missing read permission, older iPadOS),
 * so every write also lands here and reads fall back to it when the OS
 * clipboard is unavailable or empty. Copy→Paste then works 1:1 with desktop
 * even when the OS clipboard refuses.
 */
let internalClipboard = '';

export async function clipboardWrite(text: string): Promise<void> {
  internalClipboard = text;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

export async function clipboardRead(): Promise<string> {
  try {
    const t = await navigator.clipboard.readText();
    if (t) return t;
  } catch {
    /* fall through to the in-app mirror */
  }
  return internalClipboard;
}
