import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Project, ScheduleRow } from '../../types';
import { ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon } from '../../lib/categories';
import { CustomOrderSortModal, useCustomOrderSort } from '../CustomOrderSortModal';
import { compareByCustomOrder, getLockedTiebreakerResult } from '../SortDropdown';

export interface BoneyardSortState {
  sortBy: string | null;
  sortDir: 'asc' | 'desc';
  lockedCriteria: string[];
  sortCategories: { key: string; label: string; icon?: React.ReactNode }[];
  intExtSortLabel?: string;
  dayNightSortLabel?: string;
  handleToggleLock: (criterion: string) => void;
  handleSort: (criterion: string, direction: 'asc' | 'desc') => void;
  handleCustomSort: (criterion: string) => void;
  handleCustomOrderSort: (criterion: string, order: string[]) => void;
  customOrderModal: ReturnType<typeof useCustomOrderSort>['customOrderModal'];
  closeCustomOrderModal: () => void;
}

export function useBoneyardSort(project: Project, dispatch: React.Dispatch<any>): BoneyardSortState {
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [customSortOrders, setCustomSortOrders] = useState<Record<string, string[]>>({});
  const customSortOrdersRef = useRef(customSortOrders);
  customSortOrdersRef.current = customSortOrders;
  const [lockedCriteria, setLockedCriteria] = useState<string[]>([]);
  const lockedCriteriaRef = useRef(lockedCriteria);
  lockedCriteriaRef.current = lockedCriteria;
  const { customOrderModal, openCustomOrderModal, closeCustomOrderModal } = useCustomOrderSort();

  const handleToggleLock = useCallback((criterion: string) => {
    setLockedCriteria(prev => {
      const next = prev.includes(criterion)
        ? prev.filter(c => c !== criterion)
        : [...prev, criterion];
      lockedCriteriaRef.current = next;
      return next;
    });
  }, []);

  const sortCategories = useMemo(() => {
    const cats = ELEMENT_CATEGORIES.map(c => ({ key: c.key, label: c.label, icon: CAT_ICONS[c.key] ? React.createElement(CAT_ICONS[c.key], { className: 'w-3.5 h-3.5' }) : undefined }));
    for (const cc of project.customCategories) {
      const Icon = getCustomIcon(cc.icon || 'Tag');
      cats.push({ key: cc.key, label: cc.label, icon: React.createElement(Icon, { className: 'w-3.5 h-3.5' }) });
    }
    return cats;
  }, [project.customCategories]);

  const intExtSortLabel = useMemo(() => {
    const opts = project.colorPalette?.intExtOptions;
    return opts?.length ? opts.slice(0, 2).join(' / ') : undefined;
  }, [project.colorPalette?.intExtOptions]);

  const dayNightSortLabel = useMemo(() => {
    const opts = project.colorPalette?.dayNightOptions;
    return opts?.length ? opts.slice(0, 2).join(' / ') : undefined;
  }, [project.colorPalette?.dayNightOptions]);

  const handleCustomSort = useCallback((criterion: string) => {
    const isIntExt = criterion === 'int_ext';
    const options = isIntExt
      ? (project.colorPalette?.intExtOptions || ['INT', 'EXT', 'INT/EXT'])
      : (project.colorPalette?.dayNightOptions || ['DAY', 'NIGHT', 'MORNING', 'EVENING']);
    const title = options.slice(0, 2).join(' / ');
    openCustomOrderModal(criterion, title, options);
  }, [project.colorPalette?.intExtOptions, project.colorPalette?.dayNightOptions]);

  const handleSort = useCallback((criterion: string, direction: 'asc' | 'desc') => {
    setSortBy(criterion);
    setSortDir(direction);
    const activeVersion = project.versions.find(v => v.id === project.activeVersionId);
    if (!activeVersion) return;

    const scheduled = activeVersion.rows.filter(r => r.containerId !== null);
    const boneyard: ScheduleRow[] = activeVersion.rows.filter(r => r.containerId === null);
    const sign = direction === 'desc' ? -1 : 1;

    boneyard.sort((a, b) => {
      if (a.type !== 'SCENE' && b.type === 'SCENE') return 1;
      if (a.type === 'SCENE' && b.type !== 'SCENE') return -1;
      if (a.type !== 'SCENE' && b.type !== 'SCENE') return 0;

      const sceneA = project.scenes.find(s => s.id === a.sceneId);
      const sceneB = project.scenes.find(s => s.id === b.sceneId);
      if (!sceneA || !sceneB) return 0;

      const locks = lockedCriteriaRef.current.filter(l => l !== criterion);
      if (locks.length > 0) {
        const tie = getLockedTiebreakerResult(locks, '', sceneA, sceneB, customSortOrdersRef.current, a.estimatedDuration, b.estimatedDuration);
        if (tie !== 0) return tie;
      }

      let cmp = 0;

      if (criterion === 'scene_number') {
        cmp = sceneA.sceneNumber.localeCompare(sceneB.sceneNumber, undefined, { numeric: true, sensitivity: 'base' }) * sign;
      } else if (criterion === 'script_day') {
        cmp = sceneA.scriptDay.localeCompare(sceneB.scriptDay, undefined, { numeric: true, sensitivity: 'base' }) * sign;
      } else if (criterion === 'page_count') {
        cmp = ((sceneA.pageCountDecimal || 0) - (sceneB.pageCountDecimal || 0)) * sign;
      } else if (criterion === 'duration') {
        cmp = ((a.estimatedDuration || 0) - (b.estimatedDuration || 0)) * sign;
      } else if (criterion === 'int_ext') {
        const customCmp = customSortOrdersRef.current['int_ext'] ? compareByCustomOrder(customSortOrdersRef.current['int_ext'], s => s.intExt) : null;
        if (customCmp) cmp = customCmp(sceneA, sceneB);
        else cmp = ((sceneA.intExt || '') as string).localeCompare((sceneB.intExt || '') as string) * sign;
      } else if (criterion === 'day_night') {
        const customCmp = customSortOrdersRef.current['day_night'] ? compareByCustomOrder(customSortOrdersRef.current['day_night'], s => s.dayNight) : null;
        if (customCmp) cmp = customCmp(sceneA, sceneB);
        else cmp = ((sceneA.dayNight || '') as string).localeCompare((sceneB.dayNight || '') as string) * sign;
      } else if (criterion === 'set_name' || criterion === 'set') {
        cmp = sceneA.set.localeCompare(sceneB.set) * sign;
      } else {
        const valA = String((sceneA as any)?.[criterion] ?? '');
        const valB = String((sceneB as any)?.[criterion] ?? '');
        cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' }) * sign;
      }

      return cmp;
    });

    const combined = [...scheduled, ...boneyard];
    const finalRows = combined.map((r, i) => ({ ...r, order: i }));

    dispatch({ type: 'UPDATE_VERSION', payload: { id: activeVersion.id, rows: finalRows } });
  }, [project, dispatch]);

  const handleCustomOrderSort = useCallback((criterion: string, order: string[]) => {
    setSortBy(criterion);
    setSortDir('asc');
    const next = { ...customSortOrdersRef.current, [criterion]: order };
    setCustomSortOrders(next);
    customSortOrdersRef.current = next;
    handleSort(criterion, 'asc');
  }, [handleSort]);

  return {
    sortBy, sortDir, lockedCriteria, sortCategories, intExtSortLabel, dayNightSortLabel,
    handleToggleLock, handleSort, handleCustomSort, handleCustomOrderSort,
    customOrderModal, closeCustomOrderModal,
  };
}
