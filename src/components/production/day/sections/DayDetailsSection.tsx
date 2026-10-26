import React, { useEffect, useMemo, useState } from 'react';
import { Info, Loader2, MapPin, Pencil, RefreshCw, Sunrise, Sunset } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import { formatDateTitle, formatDuration, formatPageCount, normalizeTime, parseTime } from '../../../../lib/utils';
import { getDayType } from '../../../../lib/dayTypes';
import { formatWeatherValue } from '../../../../lib/reportWeather';
import { useTouchMode } from '../../../../lib/useMarquee';
import type { DayWeatherOverride } from '../../../../types';
import TimeField from '../../../TimeField';
import { LiveNumberInput } from '../../../LiveNumberInput';
import Checkbox from '../../../Checkbox';
import { LocationEntityDropdown } from '../../../location/LocationEntityDropdown';
import { dayLocationRefs, setDayMaster } from '../../../../lib/dayLocations';
import { locationOptions } from '../../../../lib/locationOptions';
import { wmoIcon } from '../weatherIcon';
import { DAY_INPUT } from '../tableStyles';

const LABEL = 'text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ui-text-muted)] leading-3';
const LABEL_ROW = 'flex min-h-[26px] items-start justify-between gap-1';
const LABEL_BOX = 'min-h-[26px]';
const TILE = 'min-w-0 rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] px-2.5 py-2';
const TILE_VALUE = 'mt-1 text-xs font-semibold leading-5 text-[color:var(--ui-text-strong)] tabular-nums';

interface WeatherDraft {
  weather: string;
  sunrise: string;
  sunset: string;
}

function weatherDraftFrom(ov?: DayWeatherOverride): WeatherDraft {
  return {
    weather: ov?.weather ?? '',
    sunrise: ov?.sunrise ?? '',
    sunset: ov?.sunset ?? '',
  };
}

/** Call → wrap span, wrapped at midnight (a 20:00 call with a 02:00 wrap is 6h). */
function dayLength(start: string, end: string): string {
  if (!start || !end) return '';
  const from = parseTime(start);
  const to = parseTime(end);
  let minutes = (to.hour * 60 + to.minute) - (from.hour * 60 + from.minute);
  if (minutes < 0) minutes += 1440;
  return minutes > 0 ? formatDuration(minutes) : '';
}

const DayDetailsSection: React.FC<DaySectionProps> = ({
  day, patchMeta, patchRow, readOnly, project, weatherView, refreshWeather, weatherRefreshing,
}) => {
  const isTouch = useTouchMode();
  const dayType = day.status ? getDayType(project, day.status) : null;

  // ---- master location ------------------------------------------------------
  // The master is a pointer into the day's ordered attached-location list
  // (`lib/dayLocations.ts`). The picker offers what is already on the day,
  // grouped by location type through the SAME `locationOptions` category
  // builder the Locations grid and crew Report-to cells use; the Locations
  // card below is where locations get attached.
  const locationItems = useMemo(() => {
    const attached = new Set(dayLocationRefs(day.meta).map(ref => ref.id));
    return locationOptions(project).filter(item => attached.has(item.id));
  }, [day.meta, project]);
  const masterId = day.masterLocation?.id || '';

  // ---- manual weather (roadmap 301) -----------------------------------------
  // The override is stored on the governing daybreak (`daybreakMeta`), written
  // through the section's patchMeta — the same path as every other day field.
  const override = day.meta.weatherOverride;
  const manual = !!override?.enabled;
  const [weatherDraft, setWeatherDraft] = useState<WeatherDraft>(() => weatherDraftFrom(override));

  useEffect(() => {
    setWeatherDraft(weatherDraftFrom(day.meta.weatherOverride));
  }, [day.sectionIndex, day.meta.weatherOverride]);

  const toggleOverride = (on: boolean) => {
    const current = day.meta.weatherOverride;
    if (!on) {
      if (!current) return;
      // Keep typed values (so re-ticking is non-destructive), but never store
      // an empty shell — it would make the day look like it has details.
      const hasValues = !!(current.weather || current.sunrise || current.sunset
        || current.tempMin != null || current.tempMax != null);
      patchMeta({ weatherOverride: hasValues ? { ...current, enabled: false } : undefined });
      return;
    }
    // Seed empty fields from what is on screen, so the first edit starts from
    // the fetched values instead of a blank form.
    const entry = weatherView?.entry;
    const next: DayWeatherOverride = { ...(current || {}), enabled: true };
    if (!next.weather && entry?.weather) next.weather = entry.weather;
    if (!next.sunrise && entry?.sunrise) next.sunrise = entry.sunrise;
    if (!next.sunset && entry?.sunset) next.sunset = entry.sunset;
    if (next.tempMin == null && entry?.tempMin != null) next.tempMin = entry.tempMin;
    if (next.tempMax == null && entry?.tempMax != null) next.tempMax = entry.tempMax;
    patchMeta({ weatherOverride: next });
  };

  const setDraft = (field: keyof WeatherDraft, value: string) => {
    setWeatherDraft(d => ({ ...d, [field]: value }));
  };

  const commitWeatherField = (field: keyof WeatherDraft) => {
    const current = day.meta.weatherOverride;
    const value = weatherDraft[field].trim();
    if (value === (current?.[field] || '')) return; // blur without an edit — no empty undo entry
    const next: DayWeatherOverride = { ...(current || {}), enabled: true };
    if (value) next[field] = value;
    else delete next[field];
    patchMeta({ weatherOverride: next });
  };

  /** Kit NumberInput commit — its draft model already finalizes on blur. */
  const commitWeatherTemp = (field: 'tempMin' | 'tempMax', value: number) => {
    const current = day.meta.weatherOverride;
    if ((current?.[field] ?? undefined) === value) return;
    patchMeta({ weatherOverride: { ...(current || {}), enabled: true, [field]: value } });
  };

  /** Touch keypad commit — weather times are absolute clock times only. */
  const commitWeatherTime = (field: 'sunrise' | 'sunset', raw: string) => {
    const current = day.meta.weatherOverride;
    const value = raw.trim() ? normalizeTime(raw) : null;
    if (raw.trim() && !value) return; // relative/invalid expression — keep the old value
    if (!value && !current?.[field]) return; // empty keypad, nothing stored yet
    if (value === (current?.[field] || '')) return;
    const next: DayWeatherOverride = { ...(current || {}), enabled: true };
    if (value) next[field] = value;
    else delete next[field];
    patchMeta({ weatherOverride: next });
  };

  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };

  const entry = weatherView?.entry;
  const WeatherIcon = wmoIcon(entry?.code);
  const weatherText = entry
    ? (formatWeatherValue(entry) || '—')
    : weatherView?.miss === 'too-far' ? 'No forecast yet' : '—';
  const noPinHint = !!weatherView && !weatherView.hasPin && !manual && !entry;
  const hasSun = !!entry && (!!entry.sunrise || !!entry.sunset);

  /** Desktop keeps the native time box; touch opens the shared TimeField
   *  keypad (the same `:` entry as call times). */
  const renderTimeInput = (field: 'sunrise' | 'sunset', Icon: React.ComponentType<{ className?: string }>) => (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-[color:var(--ui-text-muted)]">
      <Icon className="w-3.5 h-3.5 text-[color:var(--ui-text-faint)]" />
      {isTouch ? (
        <TimeField
          value={weatherDraft[field]}
          resolvedTime={weatherDraft[field] || (entry?.[field] || '')}
          onChange={raw => commitWeatherTime(field, raw)}
          readOnly={readOnly}
          hideOverrideDot
          theme="light"
          ariaLabel={field === 'sunrise' ? 'Sunrise' : 'Sunset'}
          className="w-24"
        />
      ) : (
        <input
          type="time"
          value={weatherDraft[field]}
          readOnly={readOnly}
          onChange={e => setDraft(field, e.target.value)}
          onBlur={() => commitWeatherField(field)}
          onKeyDown={blurOnEnter}
          aria-label={field === 'sunrise' ? 'Sunrise' : 'Sunset'}
          className={`${DAY_INPUT} px-1.5 py-1 w-24`}
        />
      )}
    </span>
  );

  const elementCount = Object.values(day.elements).reduce((n, list) => n + list.length, 0);
  const pages = day.sums.pages > 0 ? formatPageCount(day.sums.pages) : '';
  const stats = [
    `${day.scenes.length} scene${day.scenes.length !== 1 ? 's' : ''}`,
    pages ? `${pages} pgs` : '',
    `${day.cast.length} cast`,
    `${elementCount} element${elementCount !== 1 ? 's' : ''}`,
  ].filter(Boolean).join(' · ');
  const length = dayLength(day.callTime, day.wrap);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold leading-5 text-[color:var(--ui-text-strong)]">{day.date ? formatDateTitle(day.date) : 'No date'}</span>
            <span className="text-[11px] text-[color:var(--ui-text-faint)]">Day {day.chronoDay}</span>
          </div>
          <div className="mt-1.5 text-[11px] text-[color:var(--ui-text-muted)]">{stats}</div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${dayType ? '' : 'bg-[var(--ui-card-band)] text-[color:var(--ui-text-muted)]'}`}
          style={dayType?.color ? { backgroundColor: `${dayType.color}22`, color: dayType.color } : undefined}
        >
          {dayType?.label || 'Work'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className={`${TILE} group`} title={readOnly ? undefined : 'Click the time to edit'}>
          <div className={LABEL_ROW}>
            <div className={LABEL}>General call</div>
            {!readOnly && <Pencil className="w-3 h-3 shrink-0 text-[color:var(--ui-text-faint)] transition-colors group-hover:text-[color:var(--ui-text-muted)]" aria-hidden />}
          </div>
          <TimeField
            value={day.daybreakRow?.daybreakCallTime || '08:00'}
            onChange={v => patchRow({ daybreakCallTime: v })}
            readOnly={readOnly}
            hideOverrideDot
            align="left"
            ariaLabel="General call"
            className="mt-1 font-semibold"
          />
        </div>
        <div className={TILE}>
          <div className={LABEL_BOX}><div className={LABEL}>First turnover</div></div>
          <div className={TILE_VALUE}>{day.firstCall || '—'}</div>
        </div>
        <div className={TILE}>
          <div className={LABEL_BOX}><div className={LABEL}>Est. wrap</div></div>
          <div className={`${TILE_VALUE} flex items-baseline gap-1.5`}>
            <span>{day.wrap || '—'}</span>
            {length && <span className="text-[10px] font-normal text-[color:var(--ui-text-faint)]">{length}</span>}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[color:var(--ui-border)] px-2.5 py-2">
        <div className="flex flex-wrap items-center gap-2" data-master-location>
          <MapPin className="w-3.5 h-3.5 shrink-0 text-[color:var(--ui-text-faint)]" />
          <span className={`${LABEL} shrink-0`}>Master location</span>
          {locationItems.length === 0 ? (
            <span className="flex min-w-[10rem] flex-1 items-center rounded-md border border-[color:var(--ui-border)] bg-[var(--ui-card-band)] px-3 py-1.5 text-xs text-[color:var(--ui-text-faint)]">
              No locations attached
            </span>
          ) : (
            <LocationEntityDropdown
              className="min-w-[10rem] flex-1"
              value={masterId}
              onChange={id => patchMeta(setDayMaster(day.meta, id))}
              items={locationItems}
              readOnly={readOnly}
              placeholder="Choose a location…"
            />
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-[color:var(--ui-border)] pt-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            {noPinHint ? (
              <span className="text-[color:var(--ui-text-faint)]">No location pin — attach or choose a master location.</span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 text-[color:var(--ui-text)]">
                  <WeatherIcon className="w-3.5 h-3.5 text-[color:var(--ui-text-faint)]" />
                  <span className="tabular-nums">{weatherText}</span>
                </span>
                {hasSun && (
                  <span className="inline-flex items-center gap-3 text-[color:var(--ui-text-muted)]">
                    <span className="inline-flex items-center gap-1">
                      <Sunrise className="w-3.5 h-3.5 text-[color:var(--ui-text-faint)]" />
                      <span className="tabular-nums">{entry?.sunrise || '—'}</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Sunset className="w-3.5 h-3.5 text-[color:var(--ui-text-faint)]" />
                      <span className="tabular-nums">{entry?.sunset || '—'}</span>
                    </span>
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!manual && !!weatherView && refreshWeather && (
              <button
                type="button"
                onClick={() => { void refreshWeather(day.date); }}
                disabled={weatherRefreshing || weatherView.miss === 'too-far'}
                title={weatherView.miss === 'too-far' ? 'No forecast yet' : 'Refresh weather'}
                aria-label="Refresh weather"
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[color:var(--ui-text-faint)] transition-colors hover:bg-[var(--ui-card-hover)] hover:text-[color:var(--ui-text)] disabled:opacity-40"
              >
                {weatherRefreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              </button>
            )}
            <Checkbox
              variant="plain"
              theme="light"
              checked={manual}
              disabled={readOnly}
              onChange={toggleOverride}
              label="Manual weather"
              labelClassName="text-[10px] text-[color:var(--ui-text-muted)]"
            />
          </div>
        </div>

        {manual && (
          <div className="mt-2 space-y-2 border-t border-[color:var(--ui-border)] pt-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <input
                value={weatherDraft.weather}
                readOnly={readOnly}
                onChange={e => setDraft('weather', e.target.value)}
                onBlur={() => commitWeatherField('weather')}
                onKeyDown={blurOnEnter}
                placeholder="Partly cloudy"
                aria-label="Weather condition"
                className={`${DAY_INPUT} px-1.5 py-1 w-40 min-w-0`}
              />
              <span className="inline-flex items-center gap-1 text-[11px] text-[color:var(--ui-text-muted)]">
                H
                <LiveNumberInput
                  value={override?.tempMax ?? undefined}
                  min={-60}
                  max={60}
                  fallback={entry?.tempMax ?? 0}
                  step={1}
                  readOnly={readOnly}
                  ariaLabel="High temperature (°C)"
                  className={`${DAY_INPUT} px-1.5 py-1 w-16 text-right`}
                  onCommit={v => commitWeatherTemp('tempMax', v)}
                />
                °C
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-[color:var(--ui-text-muted)]">
                L
                <LiveNumberInput
                  value={override?.tempMin ?? undefined}
                  min={-60}
                  max={60}
                  fallback={entry?.tempMin ?? 0}
                  step={1}
                  readOnly={readOnly}
                  ariaLabel="Low temperature (°C)"
                  className={`${DAY_INPUT} px-1.5 py-1 w-16 text-right`}
                  onCommit={v => commitWeatherTemp('tempMin', v)}
                />
                °C
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {renderTimeInput('sunrise', Sunrise)}
              {renderTimeInput('sunset', Sunset)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const DayDetailsIcon = Info;

export default DayDetailsSection;
