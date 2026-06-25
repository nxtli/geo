import * as React from "react";

type IconProps = React.SVGProps<SVGSVGElement>;

const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const SparkIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    <path d="M12 8a4 4 0 0 0 4 4 4 4 0 0 0-4 4 4 4 0 0 0-4-4 4 4 0 0 0 4-4Z" />
  </svg>
);

export const SearchIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export const CheckIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const ArrowRightIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const TargetIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.5" />
  </svg>
);

export const DocIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M14 3v5h5" />
    <path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7Z" />
    <path d="M9 13h6M9 17h4" />
  </svg>
);

export const ShieldIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M12 3 5 6v5c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const BoltIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M13 3 4 14h7l-1 7 9-11h-7l1-7Z" />
  </svg>
);

export const ChatIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 16 0Z" />
    <path d="M8 11h8M8 14h5" />
  </svg>
);

export const QuoteIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M7 7h4v4a4 4 0 0 1-4 4M13 7h4v4a4 4 0 0 1-4 4" />
  </svg>
);

export const CloseIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const SendIcon = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4 12 20 4l-6 16-3-7-7-1Z" />
  </svg>
);
