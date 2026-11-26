import React from 'react';
import { Seg as KitSeg } from '@gabriel/ui-kit';
import { useAmbientKitMode } from '../lib/useAmbientKitMode';

type Props = React.ComponentProps<typeof KitSeg>;

/** App Seg: an omitted `theme` follows the ambient kit mode, so a segmented
 *  control inside a light modal is light and a dark toolbar stays dark. An
 *  explicit theme still wins (the studio's own dark chrome passes one). */
export default function Seg({ theme, ...props }: Props) {
  const ambient = useAmbientKitMode();
  return <KitSeg {...props} theme={theme ?? ambient} />;
}
