import React, { useEffect } from 'react';
import type { FixtureContext, SurfaceRender } from '../types';
import { meta } from '../surfaces/production';
import { useDayViews } from '../../../lib/dayView';
import ProductionDetailsModal from '../../../components/production/day/ProductionDetailsModal';
import CopyDayModal from '../../../components/production/day/CopyDayModal';
import CallTimesSettingsModal from '../../../components/production/day/CallTimesSettingsModal';
import AddCrewMemberModal from '../../../components/crew/AddCrewMemberModal';

/**
 * Production group (the Day Manager header modals + the shared Add Crew
 * Member modal). Every fixture renders the REAL component open; edits go
 * through the store, so the dock's Undo reverts them.
 *
 * Copy-from-day needs a `target: DayView`. The days come from the canonical
 * `useDayViews` (the hook around `buildDayViews`) — the fixture never
 * re-derives day math. A project with no production days has no target to
 * hand the modal — and the app cannot open it either, because the Day Manager
 * shows its own "No production days yet" page first — so the fixture states
 * that fact in a short notice instead of fabricating a day.
 */

type Id = (typeof meta)[number]['id'];

const NoProductionDays: React.FC = () => (
  <div className="flex min-h-[260px] items-center justify-center p-6">
    <div className="max-w-sm rounded-lg border border-[color:var(--ui-border)] bg-[var(--ui-panel-bg)] px-4 py-4 text-center">
      <p className="text-xs font-semibold text-[color:var(--ui-text-strong)]">No production days yet</p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-[color:var(--ui-text-muted)]">
        Copy-from-day needs a shooting day to copy into. Split the stripboard with a Day Break to create one, then
        preview this modal again.
      </p>
    </div>
  </div>
);

const CopyDayFixture: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const { days } = useDayViews();
  // The Day Manager opens this from the selected day; the studio mirrors the
  // project-derived pick, then falls back to the first production day.
  const target = days.find(d => d.date === ctx.picks.dayDate) ?? days[0];

  // Publish the day the preview targets for `get_lab_state`.
  useEffect(() => {
    if (!target) return;
    ctx.select({ kind: 'day', id: target.date, label: `DAY ${target.chronoDay}` });
    return () => ctx.select(undefined);
  }, [ctx.select, target?.date, target?.chronoDay]);

  if (!target) return <NoProductionDays />;
  return <CopyDayModal target={target} days={days} onClose={ctx.close} />;
};

const CrewAddFixture: React.FC<{ ctx: FixtureContext }> = ({ ctx }) => {
  const project = ctx.project!;
  const roles = project.crewRoles || [];
  const picked = ctx.picks.crew;
  // Prefer the role holding the picked crew person (the studio's first pick),
  // else the first role — the same fallback Add Crew Member uses.
  const pickedRole = picked
    ? roles.find(r => (project.crew?.[r.key] || []).some(p => p.id === picked.id))
    : undefined;

  return (
    <AddCrewMemberModal
      defaultRole={pickedRole?.key || roles[0]?.key}
      onCreated={() => {}}
      onClose={ctx.close}
    />
  );
};

export const render: Record<Id, SurfaceRender> = {
  'production-details': ctx => <ProductionDetailsModal onClose={ctx.close} />,
  'copy-day': ctx => <CopyDayFixture ctx={ctx} />,
  'call-times': ctx => <CallTimesSettingsModal onClose={ctx.close} />,
  'crew-add': ctx => <CrewAddFixture ctx={ctx} />,
};
