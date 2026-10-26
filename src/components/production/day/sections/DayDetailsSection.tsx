import React, { useEffect, useState } from 'react';
import { Info, Sunrise, Sunset } from 'lucide-react';
import type { DaySectionProps } from '../daySectionTypes';
import { formatDateLong } from '../../../../lib/utils';
import { getDayType } from '../../../../lib/dayTypes';
import { resolvedLocationName } from '../../../../lib/locations';
import { formatWeatherValue } from '../../../../lib/reportWeather';
import type { DayWeatherOverride } from '../../../../types';
import TimeField from '../../../TimeField';
import Checkbox from '../../../Checkbox';
import BreaksNotesSection from './BreaksNotesSection';
import { wmoIcon } from '../weatherIcon';
import { DAY_ALIGN, DAY_GROUP_ROW, DAY_INPUT, DAY_TABLE, DAY_TABLE_WRAP, DAY_TD, DAY_TH } from '../tableStyles';

const FIELD = `${DAY_INPUT} w-full px-2.5 py-2`;

const ValueRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <tr className="even:bg-zinc-50/60">
    <td className={`${DAY_TD} ${DAY_ALIGN.left} text-[11px] font-medium text-zinc-500 w-40`}>{label}</td>
    <td className={`${DAY_TD} ${DAY_ALIGN.left} text-xs text-zinc-800`}>{children}</td>
  </tr>
);

interface WeatherDraft {
  weather: string;
  sunrise: string;
  sunset: string;
  tempMin: string;
  tempMax: string;
}

function weatherDraftFrom(ov?: DayWeatherOverride): WeatherDraft {
  return {
    weather: ov?.weather ?? '',
    sunrise: ov?.sunrise ?? '',
    sunset: ov?.sunset ?? '',
    tempMin: ov?.tempMin == null ? '' : String(ov.tempMin),
    tempMax: ov?.tempMax == null ? '' : String(ov.tempMax),
  };
}

function parseTemp(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

const DayDetailsSection: React.FC<DaySectionProps> = ({ day, patchMeta, patchRow, readOnly, project, dispatch, actions, weatherView }) => {
  const [note, setNote] = useState(day.meta.note || '');
  useEffect(() => { setNote(day.meta.note || ''); }, [day.meta.note, day.sectionIndex]);

  const commitNote = () => {
    if ((day.meta.note || '') !== note) patchMeta({ note: note.trim() || undefined });
  };

  const dayType = day.status ? getDayType(project, day.status) : null;
  const master = day.masterLocation;

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
    const next: DayWeatherOverride = { ...(current || {}), enabled: true };
    if (field === 'tempMin' || field === 'tempMax') {
      const value = parseTemp(weatherDraft[field]);
      const stored = current?.[field] ?? undefined;
      if (value === stored) return; // blur without an edit — no empty undo entry
      if (value == null) delete next[field];
      else next[field] = value;
    } else {
      const value = weatherDraft[field].trim();
      if (value === (current?.[field] || '')) return;
      if (value) next[field] = value;
      else delete next[field];
    }
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
  const noPinHint = !!weatherView && !weatherView.hasPin && !manual;
  const hasSun = !!entry && (!!entry.sunrise || !!entry.sunset);

  return (
    <div className="space-y-4">
      <div className={DAY_TABLE_WRAP}>
        <table className={DAY_TABLE}>
          <thead>
            <tr className="border-b border-zinc-200">
              <th className={`${DAY_TH} ${DAY_ALIGN.left}`}>Field</th>
              <th className={`${DAY_TH} ${DAY_ALIGN.left}`}>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr className={DAY_GROUP_ROW}><td colSpan={2} className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Day</td></tr>
            <ValueRow label="Date">{day.date ? formatDateLong(day.date) : '—'}</ValueRow>
            <ValueRow label="Day">{day.chronoDay ? `Day ${day.chronoDay}` : '—'}</ValueRow>
            <ValueRow label="Day type">{dayType ? dayType.label : 'Work'}</ValueRow>
            <ValueRow label="Scenes">{day.scenes.length}</ValueRow>
            <ValueRow label="Cast">{day.cast.length}</ValueRow>
            <ValueRow label="Elements">{Object.values(day.elements).reduce((n, l) => n + l.length, 0)}</ValueRow>
            <ValueRow label="Master location">
              {master ? resolvedLocationName(master.name, master.address, master.place, master.lat, master.lng) : '—'}
            </ValueRow>

            <tr className={DAY_GROUP_ROW}>
              <td colSpan={2} className="px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Weather</span>
                  <Checkbox
                    variant="plain"
                    theme="light"
                    checked={manual}
                    disabled={readOnly}
                    onChange={toggleOverride}
                    label="Override the API"
                    labelClassName="text-zinc-500"
                  />
                </div>
              </td>
            </tr>
            <ValueRow label="Weather">
              {manual ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    value={weatherDraft.weather}
                    readOnly={readOnly}
                    onChange={e => setDraft('weather', e.target.value)}
                    onBlur={() => commitWeatherField('weather')}
                    onKeyDown={blurOnEnter}
                    placeholder="Partly cloudy"
                    aria-label="Weather condition"
                    className={`${DAY_INPUT} px-1.5 py-1 w-36 min-w-0`}
                  />
                  <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
                    H
                    <input
                      value={weatherDraft.tempMax}
                      readOnly={readOnly}
                      inputMode="numeric"
                      onChange={e => setDraft('tempMax', e.target.value)}
                      onBlur={() => commitWeatherField('tempMax')}
                      onKeyDown={blurOnEnter}
                      aria-label="High temperature (°C)"
                      className={`${DAY_INPUT} px-1.5 py-1 w-12 text-right`}
                    />
                    °C
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
                    L
                    <input
                      value={weatherDraft.tempMin}
                      readOnly={readOnly}
                      inputMode="numeric"
                      onChange={e => setDraft('tempMin', e.target.value)}
                      onBlur={() => commitWeatherField('tempMin')}
                      onKeyDown={blurOnEnter}
                      aria-label="Low temperature (°C)"
                      className={`${DAY_INPUT} px-1.5 py-1 w-12 text-right`}
                    />
                    °C
                  </span>
                </div>
              ) : noPinHint ? (
                <span className="text-[11px] text-zinc-400">No location pin — set a master location, or override to type it.</span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <WeatherIcon className="w-3.5 h-3.5 text-zinc-400" />
                  <span>{weatherText}</span>
                </span>
              )}
            </ValueRow>
            <ValueRow label="Sun">
              {manual ? (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
                    <Sunrise className="w-3.5 h-3.5 text-zinc-400" />
                    <input
                      type="time"
                      value={weatherDraft.sunrise}
                      readOnly={readOnly}
                      onChange={e => setDraft('sunrise', e.target.value)}
                      onBlur={() => commitWeatherField('sunrise')}
                      onKeyDown={blurOnEnter}
                      aria-label="Sunrise"
                      className={`${DAY_INPUT} px-1.5 py-1 w-24`}
                    />
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
                    <Sunset className="w-3.5 h-3.5 text-zinc-400" />
                    <input
                      type="time"
                      value={weatherDraft.sunset}
                      readOnly={readOnly}
                      onChange={e => setDraft('sunset', e.target.value)}
                      onBlur={() => commitWeatherField('sunset')}
                      onKeyDown={blurOnEnter}
                      aria-label="Sunset"
                      className={`${DAY_INPUT} px-1.5 py-1 w-24`}
                    />
                  </label>
                </div>
              ) : hasSun ? (
                <span className="inline-flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <Sunrise className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="tabular-nums">{entry?.sunrise || '—'}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Sunset className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="tabular-nums">{entry?.sunset || '—'}</span>
                  </span>
                </span>
              ) : (
                <span className="text-zinc-400">—</span>
              )}
            </ValueRow>

            <tr className={DAY_GROUP_ROW}><td colSpan={2} className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Timing</td></tr>
            <ValueRow label="General call">
              <TimeField
                value={day.daybreakRow?.daybreakCallTime || '08:00'}
                onChange={v => patchRow({ daybreakCallTime: v })}
                readOnly={readOnly}
                className="w-28"
              />
            </ValueRow>
            <ValueRow label="First turnover">{day.firstCall || '—'}</ValueRow>
            <ValueRow label="Est. wrap">{day.wrap || '—'}</ValueRow>
          </tbody>
        </table>
      </div>

      <div>
        <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Breaks & notes (call sheet)</div>
        <BreaksNotesSection day={day} patchMeta={patchMeta} patchRow={patchRow} readOnly={readOnly} project={project} dispatch={dispatch} actions={actions} />
      </div>

      <label className="block">
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Day notes / announcements</span>
        <textarea
          value={note}
          readOnly={readOnly}
          onChange={e => setNote(e.target.value)}
          onBlur={commitNote}
          rows={3}
          placeholder="Notes for the call sheet — parking, catering, announcements…"
          className={`${FIELD} mt-1.5 resize-y`}
        />
      </label>
    </div>
  );
};

export const DayDetailsIcon = Info;

export default DayDetailsSection;
