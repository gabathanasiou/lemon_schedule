import type { ExpenseStatus, PurchaseOrderStatus } from '../../types';

/**
 * ONE status → tone map for Glide status cells (roadmap 345). Colours are
 * tokens for the LIGHT grid (readable text on a tinted cell), shared by every
 * status column so no grid invents its own palette. The label is always
 * painted — colour is never the only signal.
 *
 * Editable status cells are the deliberate exception to the white-editable
 * cell rule: they stay tinted at rest (see `InlineGlideTable.getCell`).
 */
export interface StatusTone {
  bgCell: string;
  textDark: string;
  textMedium: string;
  textLight: string;
}

const tone = (bgCell: string, textDark: string): StatusTone => ({
  bgCell,
  textDark,
  textMedium: textDark,
  textLight: textDark,
});

/** Expense lifecycle: planned → committed → actual → paid, plus void. */
export const EXPENSE_STATUS_TONES: Record<ExpenseStatus, StatusTone> = {
  planned: tone('#fef3c7', '#92400e'),    // amber
  committed: tone('#dbeafe', '#1e40af'),  // blue
  actual: tone('#dcfce7', '#166534'),     // emerald
  paid: tone('#ccfbf1', '#115e59'),       // teal — settled money
  void: tone('#f4f4f5', '#71717a'),       // neutral/cancelled
};

/** Purchase-order lifecycles (painted wherever a PO status becomes a cell). */
export const PO_STATUS_TONES: Record<PurchaseOrderStatus, StatusTone> = {
  open: tone('#fef3c7', '#92400e'),
  partial: tone('#dbeafe', '#1e40af'),
  received: tone('#dcfce7', '#166534'),
  cancelled: tone('#f4f4f5', '#71717a'),
};

export function expenseStatusTone(status: ExpenseStatus): StatusTone {
  return EXPENSE_STATUS_TONES[status] ?? EXPENSE_STATUS_TONES.planned;
}

export function purchaseOrderStatusTone(status: PurchaseOrderStatus): StatusTone {
  return PO_STATUS_TONES[status] ?? PO_STATUS_TONES.open;
}
