/**
 * Inline monochrome icon set (24px grid, stroke=currentColor).
 * One consistent stroke weight and optical alignment everywhere; sized by the
 * caller with `size`, never mixed fonts or unicode glyphs.
 *
 * The glyphs live in domain files (icons-status/nav/compute/media/actions);
 * this module is the public surface: the IconName union, the name->component
 * registry, and the generic <Icon>. Shared Svg/props live in icons-shared.
 */

import type { ReactElement } from 'react';
import type { IconProps as P } from './icons-shared';
import {
  BellIcon, InboxIcon, CheckIcon, XIcon, InfoIcon, WarnIcon, ActivityIcon,
} from './icons-status';
import {
  ArrowRightIcon, ArrowLeftIcon, ChevronUpIcon, ChevronDownIcon,
  ChevronRightIcon, MenuIcon, ExternalIcon,
} from './icons-nav';
import {
  ServerIcon, NetworkIcon, DatabaseIcon, CpuIcon, PackageIcon,
} from './icons-compute';
import {
  FileTextIcon, HardDriveIcon, DiscIcon, LayersIcon, CameraIcon, RadioIcon,
  ClockIcon, DownloadIcon,
} from './icons-media';
import {
  KeyIcon, PlusIcon, CopyIcon, TrashIcon, SearchIcon, RefreshIcon,
  PauseIcon, PlayIcon, StopIcon, PowerIcon,
} from './icons-actions';

// Named component exports stay on this module so existing imports keep working.
export {
  BellIcon, InboxIcon, CheckIcon, XIcon, InfoIcon, WarnIcon, ActivityIcon,
  ArrowRightIcon, ArrowLeftIcon, ChevronUpIcon, ChevronDownIcon,
  ChevronRightIcon, MenuIcon, ExternalIcon,
  ServerIcon, NetworkIcon, DatabaseIcon, CpuIcon, PackageIcon,
  FileTextIcon, HardDriveIcon, DiscIcon, LayersIcon, CameraIcon, RadioIcon,
  ClockIcon, DownloadIcon,
  KeyIcon, PlusIcon, CopyIcon, TrashIcon, SearchIcon, RefreshIcon,
  PauseIcon, PlayIcon, StopIcon, PowerIcon,
};

export type IconName =
  // status & feedback
  | 'bell' | 'inbox' | 'check' | 'x' | 'info' | 'warn' | 'activity'
  // navigation & direction
  | 'arrow-right' | 'arrow-left' | 'chevron-up' | 'chevron-down' | 'chevron-right' | 'menu' | 'external'
  // infrastructure & compute
  | 'server' | 'network' | 'database' | 'cpu' | 'package'
  // storage, media & documents
  | 'file-text' | 'hard-drive' | 'disc' | 'layers' | 'camera' | 'radio' | 'clock' | 'download'
  // actions & controls
  | 'key' | 'plus' | 'copy' | 'trash' | 'search' | 'refresh' | 'pause' | 'play'
  | 'stop' | 'power';

const ICONS: Record<IconName, (p: P) => ReactElement> = {
  // status & feedback
  bell: BellIcon, inbox: InboxIcon, check: CheckIcon, x: XIcon, info: InfoIcon,
  warn: WarnIcon, activity: ActivityIcon,
  // navigation & direction
  'arrow-right': ArrowRightIcon, 'arrow-left': ArrowLeftIcon,
  'chevron-up': ChevronUpIcon, 'chevron-down': ChevronDownIcon,
  'chevron-right': ChevronRightIcon, menu: MenuIcon, external: ExternalIcon,
  // infrastructure & compute
  server: ServerIcon, network: NetworkIcon, database: DatabaseIcon, cpu: CpuIcon,
  package: PackageIcon,
  // storage, media & documents
  'file-text': FileTextIcon, 'hard-drive': HardDriveIcon, disc: DiscIcon,
  layers: LayersIcon, camera: CameraIcon, radio: RadioIcon, clock: ClockIcon,
  download: DownloadIcon,
  // actions & controls
  key: KeyIcon, plus: PlusIcon, copy: CopyIcon, trash: TrashIcon, search: SearchIcon,
  refresh: RefreshIcon, pause: PauseIcon, play: PlayIcon, stop: StopIcon,
  power: PowerIcon,
};

/** Generic icon by name — used by Empty states and anywhere a glyph would go. */
export function Icon({ name, size = 16, ...rest }: P & { name: IconName }) {
  const Cmp = ICONS[name];
  return <Cmp size={size} {...rest} />;
}
