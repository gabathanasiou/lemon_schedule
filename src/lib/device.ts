import { IS_COARSE } from '@gabriel/ui-kit';
export { IS_COARSE, IS_TOUCH_CAPABLE, isTouchLike, getLastPointerType, useLastPointerType, getHardwareKeyboard, useHardwareKeyboard } from '@gabriel/ui-kit';

/** On coarse-pointer devices (iPad/iOS) the native Files picker greys out
 *  files whose extension isn't a registered UTType (`.lemon`, `.msd`, `.fdx`,
 *  `.fountain`…). Broaden the picker to accept any file there — the import
 *  handlers already validate by file extension and surface an Import Error
 *  dialog, so the effective set matches desktop. Desktop keeps the narrow
 *  filter. */
export function pickerAccept(desktopAccepts: string): string {
  return IS_COARSE ? '*/*' : desktopAccepts;
}
