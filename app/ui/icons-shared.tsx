/**
 * Shared bits for the icon set: the 24px stroke wrapper and the props type.
 * Split out so each domain file stays small; nothing here is public API.
 */

import type { ReactElement, SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

export function IconSvg({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}
