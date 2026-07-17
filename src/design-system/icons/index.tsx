import type { SVGProps } from 'react';

/** Small stroke icons, sized by font/em context. All decorative (aria-hidden). */

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const PlayIcon = () => (
  <Icon>
    <path d="M4.5 3 12.5 8 4.5 13 Z" fill="currentColor" stroke="none" />
  </Icon>
);

export const PauseIcon = () => (
  <Icon>
    <path d="M5 3.5v9M11 3.5v9" strokeWidth="2.4" />
  </Icon>
);

export const RestartIcon = () => (
  <Icon>
    <path d="M3 8a5 5 0 1 0 1.5-3.6" />
    <path d="M3 2.8v2.4h2.4" />
  </Icon>
);

export const ChevronDownIcon = () => (
  <Icon>
    <path d="m4 6 4 4 4-4" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Icon>
);

export const QuestionIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M6.2 6.2a1.9 1.9 0 1 1 2.6 1.8c-.6.25-.8.6-.8 1.2" />
    <circle cx="8" cy="11.4" r="0.5" fill="currentColor" stroke="none" />
  </Icon>
);

export const MotionIcon = () => (
  <Icon>
    <path d="M2 5.5h6M2 8h9M2 10.5h5" />
    <circle cx="12.5" cy="8" r="1.6" fill="currentColor" stroke="none" />
  </Icon>
);

/** KinetiFlux product mark: a vessel with a level fill and an inbound particle. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="8"
        fill="var(--surface-3)"
        stroke="var(--line-strong)"
      />
      <rect
        x="12"
        y="7"
        width="12"
        height="18"
        rx="3.5"
        fill="none"
        stroke="var(--text-2)"
        strokeWidth="1.5"
      />
      <path
        d="M14 16.5 h8 v5 a1.5 1.5 0 0 1 -1.5 1.5 h-5 a1.5 1.5 0 0 1 -1.5 -1.5 Z"
        fill="var(--species-a)"
      />
      <path
        d="M4 12 q4 0 6 3"
        fill="none"
        stroke="var(--species-b)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="7.4" cy="13.1" r="2" fill="var(--species-b)" />
    </svg>
  );
}
