import {
  Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning,
  type LucideIcon,
} from 'lucide-react';

/**
 * WMO weather code (4677) → the app's weather glyph (roadmap 301). One map
 * shared by the Day Manager chip and the Day Details weather rows. The code is
 * stored alongside the fetched values; entries cached before codes existed
 * (or a manual override with no API base) fall back to CloudSun.
 */
export function wmoIcon(code?: number | null): LucideIcon {
  if (code == null) return CloudSun;
  if (code === 0 || code === 1) return Sun;
  if (code === 2) return CloudSun;
  if (code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if (code >= 51 && code <= 57) return CloudDrizzle;
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return CloudRain;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return CloudSnow;
  if (code >= 95) return CloudLightning;
  return CloudSun;
}
