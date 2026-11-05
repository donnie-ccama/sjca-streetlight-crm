import type { CSSProperties } from 'react';

// The --sl-* variables switch with the workspace light and dark scopes.
// index.css has no status colors, so these pairs come from the style guide.
export const SUCCESS = 'light-dark(#11805f, #3bc79a)';
export const WARNING = 'light-dark(#b35c00, #ff9d3d)';
export const DANGER = 'light-dark(#c62a25, #ff6a65)';

export const CARD_GAP = 16;
export const CARD_PADDING = 24;
export const EMPTY = '—';

export const tint = (color: string): string =>
  `color-mix(in srgb, ${color} 12%, transparent)`;

const pillButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  minHeight: 36,
  padding: '0 18px',
  borderRadius: 'var(--sl-radius-pill)',
  border: '1px solid transparent',
  font: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  flexShrink: 0,
};

export const STYLE = {
  root: {
    fontFamily: 'var(--sl-font-ui)',
    color: 'var(--sl-text)',
    background: 'var(--sl-surface)',
    padding: CARD_PADDING,
    fontSize: 13,
    lineHeight: 1.4,
    minHeight: '100%',
    boxSizing: 'border-box',
  },
  card: {
    background: 'var(--sl-bg)',
    borderRadius: 'var(--sl-radius)',
    boxShadow: '0 1px 3px rgba(0,0,0,.12)',
    padding: CARD_PADDING,
    minWidth: 0,
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  cardTitle: {
    fontFamily: 'var(--sl-font-display)',
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
    margin: 0,
  },
  hint: {
    color: 'var(--sl-text-secondary)',
    fontSize: 12,
    marginTop: 2,
  },
  note: {
    color: 'var(--sl-text-secondary)',
    fontSize: 13,
  },
  fieldLabel: {
    display: 'block',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.075em',
    color: 'var(--sl-text-secondary)',
    marginBottom: 6,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  input: {
    width: '100%',
    minWidth: 0,
    height: 40,
    padding: '0 14px',
    borderRadius: 'var(--sl-radius-pill)',
    border: '1px solid var(--sl-hairline-strong)',
    background: 'var(--sl-bg)',
    color: 'var(--sl-text)',
    font: 'inherit',
    fontSize: 13,
    boxSizing: 'border-box',
  },
  primaryButton: {
    ...pillButton,
    background: 'var(--sl-red)',
    color: 'var(--sl-on-red)',
  },
  secondaryButton: {
    ...pillButton,
    background: 'var(--sl-navy)',
    color: 'var(--sl-on-navy)',
  },
  ghostButton: {
    ...pillButton,
    background: 'transparent',
    color: 'var(--sl-text)',
    borderColor: 'var(--sl-hairline-strong)',
  },
  iconButton: {
    border: 'none',
    background: 'none',
    color: 'var(--sl-text-secondary)',
    cursor: 'pointer',
    padding: 4,
    font: 'inherit',
    lineHeight: 1,
  },
  pill: {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 'var(--sl-radius-pill)',
    fontSize: 11,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  th: {
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.075em',
    textTransform: 'uppercase',
    color: 'var(--sl-text-secondary)',
    padding: '0 8px 10px 0',
    borderBottom: '1px solid var(--sl-hairline)',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '10px 8px 10px 0',
    borderBottom: '1px solid var(--sl-hairline)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    verticalAlign: 'middle',
  },
  avatar: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: 'var(--sl-navy)',
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
    marginRight: 8,
    flexShrink: 0,
  },
  muted: {
    color: 'var(--sl-text-secondary)',
    padding: '12px 0',
  },
  alert: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: CARD_GAP,
    padding: '10px 14px',
    borderRadius: 'var(--sl-radius-sm)',
    border: '1px solid var(--sl-hairline-strong)',
    background: 'var(--sl-bg)',
  },
} satisfies Record<string, CSSProperties>;

export const statusPillColor = (status?: string | null): string => {
  if (status === 'PENDING') return WARNING;
  if (status === 'SENT') return SUCCESS;
  return 'var(--sl-text-secondary)';
};

export const initialOf = (name: string): string =>
  (name.trim()[0] ?? '?').toUpperCase();

export const INTERACTION_CSS = (scope: string): string => `
.${scope} input:focus-visible, .${scope} select:focus-visible, .${scope} button:focus-visible { outline: 2px solid var(--sl-info); outline-offset: 2px; }
.${scope} button:disabled { opacity: .55; cursor: default; }
.${scope} .primary:hover:not(:disabled) { background: var(--sl-red-hover); }
.${scope} .secondary:hover:not(:disabled) { background: var(--sl-navy-hover); }
.${scope} .ghost:hover:not(:disabled) { background: var(--sl-surface); }
.${scope} tr.row:hover td { background: var(--sl-surface); }`;
