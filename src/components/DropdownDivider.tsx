import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import { useDropdownTheme, getDropdownClasses } from './DropdownMenu';

export default function DropdownDivider() {
  const d = getDropdownClasses(useDropdownTheme());
  return <RadixDropdownMenu.Separator className={d.separator} />;
}
