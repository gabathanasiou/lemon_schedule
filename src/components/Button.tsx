import React from 'react';
import { Button as KitButton } from '@gabriel/ui-kit';
import type { ButtonProps } from '@gabriel/ui-kit';
import { useAmbientKitMode } from '../lib/useAmbientKitMode';

export type { ButtonProps };

/** App Button: an omitted `theme` follows the ambient kit mode (modal/page)
 *  instead of the kit's historical light default — a light modal gets light
 *  buttons, a dark modal/toolbar stays dark. An explicit theme still wins. */
export default function Button({ theme, ...props }: ButtonProps) {
  const ambient = useAmbientKitMode();
  return <KitButton {...props} theme={theme ?? ambient} />;
}
