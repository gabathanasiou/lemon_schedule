import React from 'react';
import { ChevronDown, ExternalLink, Receipt, Trash2 } from 'lucide-react';
import type { Expense, ExpenseMethod, ExpenseStatus, Project } from '../../types';
import type { Action } from '../../store/reducer';
import { activeBudgetVersion, EXPENSE_METHODS, EXPENSE_METHOD_LABELS, EXPENSE_STATUSES, EXPENSE_STATUS_LABELS } from '../../lib/budget/model';
import { formatMoney } from '../../lib/budget/format';
import Modal, { ModalFooter } from '../Modal';
import ModalFooterButton from '../ModalFooterButton';
import Button from '../Button';
import DropdownMenu from '../DropdownMenu';
import DropdownItem from '../DropdownItem';
import DateField from '../DateField';
import { useDialog } from '../Dialog';
import { DD_TOKEN_TRIGGER_CLASS } from '../../lib/dropdown';
import { BudgetInput, MoneyField } from './fields';

/**
 * The ONE expense editor (roadmap 334 phase 2) — used by Budget → Expenses and
 * the Day Manager Expenses card. Every field commits on blur/pick through a
 * single `UPDATE_EXPENSE`; there is no Save button. Deleting confirms with a
 * persistent suppress key. Receipts are URLs only — never blobs in state.
 */
export interface ExpenseModalProps {
  expenseId: string;
  project: Project;
  dispatch: React.Dispatch<Action>;
  readOnly?: boolean;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[color:var(--ui-border)] px-5 py-3 first:border-t-0">
      <div className="text-[10px] uppercase tracking-wide text-[color:var(--ui-text-faint)] mb-2">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-20 shrink-0 text-xs text-[color:var(--ui-text-muted)]">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

const LabelButton = React.forwardRef<HTMLButtonElement, { label: string; disabled?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ label, disabled, className, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      className={`${DD_TOKEN_TRIGGER_CLASS} text-xs w-full justify-between disabled:opacity-50 ${className || ''}`}
      {...rest}
    >
      <span className="truncate">{label}</span>
      <ChevronDown className="w-3 h-3 shrink-0" />
    </button>
  ),
);
LabelButton.displayName = 'LabelButton';

export function ExpenseModal({ expenseId, project, dispatch, readOnly, onClose }: ExpenseModalProps) {
  const dialog = useDialog();
  const expense = (project.expenses || []).find(e => e.id === expenseId);
  const budget = project.budget;
  const version = budget ? activeBudgetVersion(budget) : undefined;
  const lines = version?.lines || [];
  const accounts = budget?.accounts || [];
  const categories = budget?.categories || [];
  const currencies = budget?.currencies || [];
  const purchaseOrders = project.purchaseOrders || [];

  const [accountOpen, setAccountOpen] = React.useState(false);
  const [lineOpen, setLineOpen] = React.useState(false);
  const [methodOpen, setMethodOpen] = React.useState(false);
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [currencyOpen, setCurrencyOpen] = React.useState(false);
  const [poOpen, setPoOpen] = React.useState(false);
  const [receiptError, setReceiptError] = React.useState(false);

  if (!expense) return null;

  const patch = (updates: Partial<Expense>) => dispatch({ type: 'UPDATE_EXPENSE', payload: { id: expense.id, updates } });
  const account = accounts.find(a => a.id === expense.accountId);
  const line = lines.find(l => l.id === expense.lineId);
  const category = account ? categories.find(c => c.id === account.categoryId) : undefined;
  const po = expense.poId ? purchaseOrders.find(p => p.id === expense.poId) : undefined;
  const accountLines = account ? lines.filter(l => l.accountId === account.id) : [];
  const settings = { currency: budget?.settings.currency || 'USD', currencySymbol: budget?.settings.currencySymbol || '$', decimals: budget?.settings.decimals ?? 0, negativeStyle: budget?.settings.negativeStyle };

  const accountLabel = account
    ? `${account.number} ${account.name}`.trim()
    : (line ? `Line — ${line.description}` : 'Unallocated');
  const lineLabel = line ? line.description : 'Account level (Unallocated)';
  const currencyLabel = expense.currency
    ? `${expense.currency}${currencies.find(c => c.code === expense.currency)?.symbol ? ` (${currencies.find(c => c.code === expense.currency)!.symbol})` : ''}`
    : `Base (${settings.currency})`;

  const chooseAccount = (accountId: string | undefined) => {
    const nextLine = accountId && expense.lineId && lines.find(l => l.id === expense.lineId)?.accountId === accountId
      ? expense.lineId
      : undefined;
    patch({ accountId, lineId: nextLine });
  };

  const chooseLine = (lineId: string | undefined) => {
    const target = lineId ? lines.find(l => l.id === lineId) : undefined;
    patch(target ? { lineId, accountId: target.accountId } : { lineId: undefined });
  };

  const commitReceipt = (value: string) => {
    const text = value.trim();
    if (!text) {
      setReceiptError(false);
      patch({ receiptUrl: undefined });
      return;
    }
    if (!/^https?:\/\//i.test(text)) {
      setReceiptError(true);
      return;
    }
    setReceiptError(false);
    patch({ receiptUrl: text });
  };

  const removeExpense = async () => {
    const ok = await dialog.confirm({
      title: 'Delete this expense?',
      message: `“${expense.description}” will be removed from the cost report. Undo is available.`,
      danger: true,
      suppressKey: 'lemon_schedule_expense_delete',
    });
    if (ok) {
      dispatch({ type: 'DELETE_EXPENSE', payload: expense.id });
      onClose();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Expense — ${expense.description || 'Untitled'}`}
      width="max-w-2xl"
      footer={
        <ModalFooter>
          <Button variant="subtle" onClick={() => { void removeExpense(); }} className="text-red-600" disabled={readOnly}>
            <Trash2 className="w-3.5 h-3.5" /> Delete expense
          </Button>
          <div className="ml-auto text-xs font-semibold text-[color:var(--ui-text-strong)]">
            {formatMoney(expense.amountCents, settings)}
          </div>
          <ModalFooterButton onClick={onClose}>Done</ModalFooterButton>
        </ModalFooter>
      }
    >
      <div className="max-h-[65vh] overflow-y-auto scrollbar-custom">
        <Section title="Spend">
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Date">
                <DateField
                  value={expense.date ? [expense.date] : []}
                  onChange={dates => { if (dates.length) patch({ date: dates[dates.length - 1] }); }}
                  placeholder="Pick a date"
                  initialView={expense.date}
                />
              </Field>
              <Field label="Amount">
                <MoneyField
                  cents={expense.amountCents}
                  onCommit={cents => patch({ amountCents: cents })}
                  readOnly={readOnly}
                  symbol={currencies.find(c => c.code === expense.currency)?.symbol || settings.currencySymbol}
                  ariaLabel="Expense amount"
                />
              </Field>
            </div>
            <Field label="Description">
              <BudgetInput value={expense.description} onCommit={v => patch({ description: v || 'Expense' })} readOnly={readOnly} placeholder="What was bought" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Vendor">
                <BudgetInput value={expense.vendor || ''} onCommit={v => patch({ vendor: v || undefined })} readOnly={readOnly} placeholder="Vendor / payee" />
              </Field>
              <Field label="Method">
                <DropdownMenu
                  open={methodOpen}
                  onOpenChange={setMethodOpen}
                  width="w-44"
                  theme="dark"
                  trigger={<LabelButton label={EXPENSE_METHOD_LABELS[expense.method]} disabled={!!readOnly} />}
                >
                  {EXPENSE_METHODS.map(method => (
                    <DropdownItem
                      key={method}
                      onClick={() => { setMethodOpen(false); patch({ method: method as ExpenseMethod }); }}
                      icon={method === expense.method ? <span className="text-[10px]">✓</span> : undefined}
                    >
                      {EXPENSE_METHOD_LABELS[method]}
                    </DropdownItem>
                  ))}
                </DropdownMenu>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Status">
                <DropdownMenu
                  open={statusOpen}
                  onOpenChange={setStatusOpen}
                  width="w-48"
                  theme="dark"
                  trigger={<LabelButton label={EXPENSE_STATUS_LABELS[expense.status]} disabled={!!readOnly} />}
                >
                  {EXPENSE_STATUSES.map(status => (
                    <DropdownItem
                      key={status}
                      onClick={() => { setStatusOpen(false); patch({ status: status as ExpenseStatus }); }}
                      icon={status === expense.status ? <span className="text-[10px]">✓</span> : undefined}
                    >
                      {EXPENSE_STATUS_LABELS[status]}
                    </DropdownItem>
                  ))}
                </DropdownMenu>
              </Field>
              <Field label="Currency">
                <DropdownMenu
                  open={currencyOpen}
                  onOpenChange={setCurrencyOpen}
                  width="w-44"
                  theme="dark"
                  trigger={<LabelButton label={currencyLabel} disabled={!!readOnly || currencies.length === 0} />}
                >
                  <DropdownItem
                    onClick={() => { setCurrencyOpen(false); patch({ currency: undefined }); }}
                    icon={!expense.currency ? <span className="text-[10px]">✓</span> : undefined}
                  >
                    Base ({settings.currency})
                  </DropdownItem>
                  {currencies.map(currency => (
                    <DropdownItem
                      key={currency.code}
                      onClick={() => { setCurrencyOpen(false); patch({ currency: currency.code }); }}
                      icon={currency.code === expense.currency ? <span className="text-[10px]">✓</span> : undefined}
                    >
                      {currency.symbol ? `${currency.symbol} ${currency.code}` : currency.code}
                    </DropdownItem>
                  ))}
                </DropdownMenu>
              </Field>
            </div>
          </div>
        </Section>

        <Section title="Budget allocation">
          <div className="space-y-2">
            <Field label="Account">
              <DropdownMenu
                open={accountOpen}
                onOpenChange={setAccountOpen}
                width="w-72"
                theme="dark"
                searchable
                searchPlaceholder="Search accounts…"
                trigger={<LabelButton label={accountLabel} disabled={!!readOnly || accounts.length === 0} />}
              >
                <DropdownItem
                  onClick={() => { setAccountOpen(false); chooseAccount(undefined); }}
                  icon={!expense.accountId ? <span className="text-[10px]">✓</span> : undefined}
                  group="Unallocated"
                >
                  Unallocated (no account)
                </DropdownItem>
                {accounts.map(item => {
                  const cat = categories.find(c => c.id === item.categoryId);
                  return (
                    <DropdownItem
                      key={item.id}
                      group={cat ? `${cat.number} ${cat.name}`.trim() : 'Accounts'}
                      onClick={() => { setAccountOpen(false); chooseAccount(item.id); }}
                      icon={item.id === expense.accountId ? <span className="text-[10px]">✓</span> : undefined}
                    >
                      {item.number} {item.name}
                    </DropdownItem>
                  );
                })}
              </DropdownMenu>
            </Field>
            <Field label="Line">
              <DropdownMenu
                open={lineOpen}
                onOpenChange={setLineOpen}
                width="w-72"
                theme="dark"
                searchable={accountLines.length > 8}
                searchPlaceholder="Search lines…"
                trigger={<LabelButton label={lineLabel} disabled={!!readOnly || !account} />}
              >
                <DropdownItem
                  onClick={() => { setLineOpen(false); chooseLine(undefined); }}
                  icon={!expense.lineId ? <span className="text-[10px]">✓</span> : undefined}
                >
                  Account level (Unallocated)
                </DropdownItem>
                {accountLines.map(item => (
                  <DropdownItem
                    key={item.id}
                    onClick={() => { setLineOpen(false); chooseLine(item.id); }}
                    icon={item.id === expense.lineId ? <span className="text-[10px]">✓</span> : undefined}
                  >
                    {item.description}
                  </DropdownItem>
                ))}
              </DropdownMenu>
              {!account && (
                <p className="text-[10px] text-[color:var(--ui-text-faint)] mt-1">
                  Pick an account to charge a specific budget line; without one it rolls into Unallocated.
                </p>
              )}
            </Field>
            <Field label="PO">
              <DropdownMenu
                open={poOpen}
                onOpenChange={setPoOpen}
                width="w-72"
                theme="dark"
                trigger={<LabelButton label={po ? `${po.number}${po.vendor ? ` · ${po.vendor}` : ''}` : 'No purchase order'} disabled={!!readOnly || purchaseOrders.length === 0} />}
              >
                <DropdownItem
                  onClick={() => { setPoOpen(false); patch({ poId: undefined }); }}
                  icon={!expense.poId ? <span className="text-[10px]">✓</span> : undefined}
                >
                  No purchase order
                </DropdownItem>
                {purchaseOrders.map(item => (
                  <DropdownItem
                    key={item.id}
                    onClick={() => { setPoOpen(false); patch({ poId: item.id }); }}
                    icon={item.id === expense.poId ? <span className="text-[10px]">✓</span> : undefined}
                  >
                    {item.number}{item.vendor ? ` · ${item.vendor}` : ''}
                  </DropdownItem>
                ))}
              </DropdownMenu>
            </Field>
          </div>
        </Section>

        <Section title="Notes & receipt">
          <div className="space-y-2">
            <Field label="Receipt">
              <BudgetInput
                value={expense.receiptUrl || ''}
                onCommit={commitReceipt}
                readOnly={readOnly}
                placeholder="https://… (link only)"
              />
              {receiptError && (
                <p className="text-[10px] text-red-600 mt-1">Enter a full http(s) link — receipts are never uploaded into the project.</p>
              )}
              {expense.receiptUrl && !receiptError && (
                <a
                  href={expense.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-[color:var(--ui-accent-header-fill)] hover:underline mt-1"
                >
                  <ExternalLink className="w-3 h-3" /> Open receipt
                </a>
              )}
            </Field>
            <Field label="Notes">
              <BudgetInput value={expense.notes || ''} onCommit={v => patch({ notes: v || undefined })} readOnly={readOnly} placeholder="Notes" />
            </Field>
            {!budget && (
              <p className="flex items-center gap-1.5 text-[11px] text-amber-700">
                <Receipt className="w-3.5 h-3.5" /> No budget yet — this expense stays Unallocated until you create one.
              </p>
            )}
          </div>
        </Section>
      </div>
    </Modal>
  );
}

export default ExpenseModal;
