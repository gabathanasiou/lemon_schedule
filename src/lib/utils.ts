import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Convert "1 3/8" or "2/8" or "1" or "1.4" (eighths) or "1.5" (decimal) to number
export function parsePageCount(fraction: string): number {
  if (!fraction) return 0;

  // "1.4" with a single digit 0-7 after the dot → eighths notation (1 + 4/8 = 1.5)
  const parts = fraction.trim().split(' ');
  if (parts.length === 1) {
    const decimalMatch = parts[0].match(/^(-?\d+)\.(\d+)$/);
    if (decimalMatch && decimalMatch[2].length === 1 && /^[0-7]$/.test(decimalMatch[2])) {
      return parseInt(decimalMatch[1], 10) + parseInt(decimalMatch[2], 10) / 8;
    }
  }

  let whole = 0;
  let fracPart = '';

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
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
