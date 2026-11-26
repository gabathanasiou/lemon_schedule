import React from 'react';
import { Checklist as KitChecklist } from '@gabriel/ui-kit';
import { useAmbientKitMode } from '../lib/useAmbientKitMode';

type Props = React.ComponentProps<typeof KitChecklist>;

/** Ambient-theme Checklist — an omitted theme follows the modal/page mode. */
export default function Checklist({ theme, ...props }: Props) {
  const ambient = useAmbientKitMode();
  return <KitChecklist {...props} theme={theme ?? ambient} />;
}
