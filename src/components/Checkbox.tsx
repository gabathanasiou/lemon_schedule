import React from 'react';
import { Checkbox as KitCheckbox } from '@gabriel/ui-kit';
import { useAmbientKitMode } from '../lib/useAmbientKitMode';

type Props = React.ComponentProps<typeof KitCheckbox>;

/** Ambient-theme Checkbox — an omitted theme follows the modal/page mode. */
export default function Checkbox({ theme, ...props }: Props) {
  const ambient = useAmbientKitMode();
  return <KitCheckbox {...props} theme={theme ?? ambient} />;
}
