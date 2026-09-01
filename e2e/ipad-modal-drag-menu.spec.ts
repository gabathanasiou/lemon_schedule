import { test, expect, type Page } from '@playwright/test';
import { openSeededProject, seedDayDates } from './helpers';

// Roadmap 78: dragging a modal must close an open KIT menu on iPad.
// The app's DropdownPanel closes on any outside pointerdown (useDropdown); the
// kit DropdownMenu relies on Radix's DismissableLayer, and the APP's Radix
// (react-dismissable-layer 1.1.12) DEFERS touch outside-dismissal to the
// `click` event — a modal drag is pointerdown + move + up with NO click, so an
// open menu survived the drag on iPad (mouse/pen dismiss immediately, which is
// why Mac works). Fixed in the kit (v0.1.65): a document-capture touch
// pointerdown listener dismisses the menu. Run under `playwright.ipad.config.ts`
// (webkit, `devices['iPad Pro 11']`, hasTouch) — the app's real Radix.
test.skip(({ browserName, isMobile }) => !(browserName === 'webkit' && isMobile), 'iPad WebKit only');

/** Simulate a REAL touch drag on the modal header (the drag handle): touch
 *  pointerdown on the title, pointermoves, then pointerup — NO click (a drag
 *  suppresses the click, exactly the iPad scenario that exposed the bug). */
async function touchDragDayModalHeader(page: Page) {
  const title = page.locator('[data-modal-stack]').last().locator('h2').first();
  await expect(title).toBeVisible();
  const box = (await title.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.evaluate(
    ([x, y]) => {
      const stacks = document.querySelectorAll('[data-modal-stack]');
      const target = (stacks[stacks.length - 1].querySelector('h2') || stacks[stacks.length - 1]) as HTMLElement;
      const fire = (type: string, px: number, py: number) => {
        const evt = new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: 'touch',
          isPrimary: true,
          pointerId: 1,
          clientX: px,
          clientY: py,
        });
        target.dispatchEvent(evt);
      };
      fire('pointerdown', x, y);
      fire('pointermove', x + 12, y + 6);
      fire('pointermove', x + 30, y + 14);
      fire('pointerup', x + 30, y + 14);
    },
    [cx, cy] as unknown as [number, number],
  );
}

async function openDayModal(page: Page) {
  await page.getByRole('button', { name: 'Calendar' }).click();
  const days = await seedDayDates(page);
  expect(days.length).toBeGreaterThan(0);
  const dayCell = page.locator(`[data-date-key="${days[0]}"]`);
  await expect(dayCell).toBeVisible();
  const header = dayCell.locator('[class*="flex items-center justify-between"]').first();
  await header.dblclick();
  await expect(page.getByText('Day Events —', { exact: false })).toBeVisible();
  return page.locator('[data-modal-stack]').last();
}

test('touch-dragging the day modal closes an open kit Day Status menu (iPad)', async ({ page }) => {
  await openSeededProject(page);
  const dayModal = await openDayModal(page);

  // Open the Day Status kit DropdownMenu (its trigger is the chip button
  // directly under the "Day Status" label inside the modal).
  const statusTrigger = dayModal.locator('button[type="button"]').filter({ hasText: /None|Work|Hold|Travel|Day Off/ }).first();
  await statusTrigger.click();
  const menu = page.locator('[role="menu"][data-state="open"]');
  await expect(menu).toBeVisible();

  // A touch drag on the modal header must close the menu.
  await touchDragDayModalHeader(page);
  await expect(menu).toHaveCount(0, { timeout: 5000 });

  // The day modal stays open + interactive.
  await expect(dayModal).toBeVisible();
  await expect(dayModal.getByRole('button', { name: 'Done' })).toBeVisible();
});

test('touch-dragging the day modal closes an open kit menu opened via the Add Events adder', async ({ page }) => {
  await openSeededProject(page);
  const dayModal = await openDayModal(page);

  await dayModal.getByRole('button', { name: 'Add Event' }).click();
  const adder = page.getByRole('dialog').last();
  await expect(adder.getByRole('heading', { name: 'Add Events' })).toBeVisible();

  // Open the adder's event-type kit menu (chip trigger in the modal body).
  const typeTrigger = adder.locator('button[type="button"]').filter({ hasText: /Travel|Hold|Rehearsal|Day Off/ }).first();
  await typeTrigger.click();
  const menu = page.locator('[role="menu"][data-state="open"]');
  await expect(menu).toBeVisible();

  await touchDragDayModalHeader(page);
  await expect(menu).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator('[data-modal-stack]').last()).toBeVisible();
});
