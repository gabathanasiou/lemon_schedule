import React from 'react';
import { ELEMENT_CATEGORIES, CAT_ICONS, getCustomIcon } from '../lib/categories';
import { getCategoryElements } from '../lib/elements';
import { Project } from '../types';

export function getElementName(project: Project, cat: string, elementId: string): string {
  const elements = getCategoryElements(project, cat);
  const el = elements.find(e => (e.id || e.name) === elementId);
  return el?.name || elementId;
}

export function getCategoryLabel(project: Project, cat: string): string {
  const builtin = ELEMENT_CATEGORIES.find(c => c.key === cat);
  const custom = (project.customCategories || []).find(c => c.key === cat);
  return project.categoryLabels[cat] || builtin?.label || custom?.label || cat;
}

export function getCatIcon(project: Project, cat: string) {
  const custom = (project.customCategories || []).find(c => c.key === cat);
  if (custom) return getCustomIcon(custom.icon || 'Tag');
  const Icon = CAT_ICONS[cat] || null;
  return Icon ? <Icon className="w-3 h-3 shrink-0 text-zinc-500" /> : null;
}
