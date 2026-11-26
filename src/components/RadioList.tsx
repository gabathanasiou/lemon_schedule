import React from 'react';
import { RadioList as KitRadioList } from '@gabriel/ui-kit';
import { useAmbientKitMode } from '../lib/useAmbientKitMode';

type Props = React.ComponentProps<typeof KitRadioList>;

/** Ambient-theme RadioList — an omitted theme follows the modal/page mode. */
export default function RadioList({ theme, ...props }: Props) {
  const ambient = useAmbientKitMode();
  return <KitRadioList {...props} theme={theme ?? ambient} />;
}
