import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { useDropdownTheme } from './DropdownMenu';

export default function DropdownDivider() {
  const theme = useDropdownTheme();
  const borderColor = theme === 'light' ? 'border-zinc-200' : 'border-zinc-800';
  return <RadixDropdownMenu.Separator className={`border-t ${borderColor} my-1`} />;
}
