import React from "react";

/**
 * Icon set for the UI kit. Re-exports the shell's icons and adds the ones the kit needs.
 * Inline stroke SVG, 1.8px stroke, 24px viewBox, aria-hidden, currentColor.
 * The spark is the one AI glyph (Discover UI decision, 2026-11-14): never use another for AI.
 */
export {
  ChevronDownIcon, ChevronRightIcon, CheckIcon, PlusIcon, SearchIcon, SupportIcon,
} from "../icons/shellIcons.jsx";

function Icon({ children, size = 16, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

/** The Discover spark: four-point star, the single AI glyph. Fill is --spark (never use for text). */
export function SparkIcon({ size, className = "", ...rest }) {
  const cls = `spark ${className}`.trim();
  return (
    <svg viewBox="0 0 100 100" className={cls} width={size} height={size} aria-hidden="true" {...rest}>
      <path d="M50 6 C55 36 64 45 94 50 C64 55 55 64 50 94 C45 64 36 55 6 50 C36 45 45 36 50 6Z" fill="var(--spark)" />
    </svg>
  );
}

export function SpinnerIcon({ className = "btn-spinner", ...rest }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true" {...rest}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function DotsIcon(props) {
  return (
    <Icon size={20} {...props}>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" />
    </Icon>
  );
}
export function MenuIcon(props) { return <Icon size={20} {...props}><path d="M4 7h16M4 12h16M4 17h16" /></Icon>; }
export function XIcon(props) { return <Icon {...props}><path d="M6 6l12 12M18 6L6 18" /></Icon>; }
export function InfoIcon(props) { return <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Icon>; }
export function AlertIcon(props) { return <Icon {...props}><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v4M12 17.5h.01" /></Icon>; }
export function CheckCircleIcon(props) { return <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></Icon>; }
export function ArrowRightIcon(props) { return <Icon {...props}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>; }
export function ChevronLeftIcon(props) { return <Icon {...props}><path d="M15 6l-6 6 6 6" /></Icon>; }
export function ArrowUpIcon(props) { return <Icon size={14} {...props}><path d="M12 19V5M6 11l6-6 6 6" /></Icon>; }
export function ArrowDownIcon(props) { return <Icon size={14} {...props}><path d="M12 5v14M6 13l6 6 6-6" /></Icon>; }
