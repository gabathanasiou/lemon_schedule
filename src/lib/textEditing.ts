/**
 * Is this element a text-typing target (contentEditable / text input /
 * textarea)? The commit-on-blur surfaces (roadmap 250/251) use it to tell
 * "the user is typing" from "the value changed programmatically" — a dropdown
 * pick, an address modal, a checkbox — which commits immediately instead of
 * waiting for a blur that will never come.
 *
 * Checkboxes/radios/colour/range/number inputs are NOT typing targets: they
 * fire their own commit handlers (`LiveNumberInput` commits on blur/Enter).
 */
export function isTextEditingElement(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  const type = (el as HTMLInputElement).type;
  return type === '' || type === 'text' || type === 'search' || type === 'url' || type === 'email' || type === 'tel' || type === 'password';
}
