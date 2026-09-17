import { Platform } from 'react-native';

/**
 * GrainGuard design system.
 *
 * Direction: instrument panel, not consumer card stack.
 *  - Engineered dark ground; no photographic backgrounds behind data.
 *  - Hairline-ruled panels at small radii. No fully-rounded "pill" shapes.
 *  - Brand gold is used ONLY for interactive affordances and the wordmark.
 *    State is carried by the semantic ramp below, never by the brand colour.
 *  - Field labels are uppercase mono; all figures use tabular numerals so
 *    columns of readings align and digits don't jitter as values change.
 */

// ─── Colour ──────────────────────────────────────────────────────────
// Neutrals carry a slight green bias (hue ~150) so the ground relates to
// the crop subject instead of reading as generic charcoal.
export const colors = {
  // Grounds and surfaces, darkest to lightest
  ground: '#0B0F0D',
  surface: '#121614',
  surfaceRaised: '#181D1A',
  surfaceSunken: '#070A08', // chart wells, viewfinder, code-ish areas
  overlay: 'rgba(7, 10, 8, 0.72)',

  // Rules and edges
  hairline: '#232A26',
  hairlineStrong: '#2F3833',

  // Text — all verified at or above WCAG AA on `surface`
  text: '#E8EDE9',
  textSecondary: '#9BA8A1',
  textTertiary: '#7A8880',
  textInverse: '#0B0F0D',

  // Brand / interactive. Used sparingly: active tab, primary action,
  // selected segment, wordmark. Never to decorate an icon.
  accent: '#C9AE71',
  accentPressed: '#B79C5F',
  accentWash: 'rgba(201, 174, 113, 0.12)',
  accentEdge: 'rgba(201, 174, 113, 0.34)',

  // Semantic state. Separate from brand — these mean something.
  ok: '#4E9E6A',
  okWash: 'rgba(78, 158, 106, 0.14)',
  caution: '#D08A21',
  cautionWash: 'rgba(208, 138, 33, 0.14)',
  critical: '#C74436',
  criticalWash: 'rgba(199, 68, 54, 0.14)',
  idle: '#6E7B74',
  idleWash: 'rgba(110, 123, 116, 0.14)',

  // Data visualisation
  plot: '#7FB8A4',
  plotMuted: 'rgba(127, 184, 164, 0.22)',
  gridline: '#1C2320',
} as const;

// ─── Type ────────────────────────────────────────────────────────────
const mono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

/** Applied to every numeric readout so digits are fixed-width. */
export const tabular = { fontVariant: ['tabular-nums' as const] };

export const type = {
  /** Hero readouts — the health index only. */
  display: {
    fontSize: 44,
    lineHeight: 46,
    fontWeight: '700' as const,
    letterSpacing: -1.4,
  },
  /** Primary readings inside panels. */
  readingLg: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '700' as const,
    letterSpacing: -0.8,
  },
  reading: {
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '600' as const,
    letterSpacing: -0.3,
  },
  /** Screen title in the app bar. */
  titleLg: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  },
  title: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600' as const,
    letterSpacing: -0.1,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400' as const,
  },
  bodySm: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400' as const,
  },
  /** Uppercase mono field label — the workhorse of this system. */
  label: {
    fontFamily: mono,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600' as const,
    letterSpacing: 1.1,
    textTransform: 'uppercase' as const,
  },
  /** Inline mono for codes, timestamps, model versions. */
  mono: {
    fontFamily: mono,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500' as const,
  },
  monoSm: {
    fontFamily: mono,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '500' as const,
    letterSpacing: 0.3,
  },
  /** Unit suffix trailing a reading. */
  unit: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500' as const,
  },
  button: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600' as const,
    letterSpacing: 0.2,
  },
} as const;

// ─── Space ───────────────────────────────────────────────────────────
export const space = {
  hair: 1,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  x3l: 32,
  x4l: 40,
} as const;

/** Consistent horizontal page inset for every screen. */
export const gutter = space.xl;

// ─── Radii ───────────────────────────────────────────────────────────
// Deliberately small and deliberately without a `pill` token, so fully
// rounded shapes cannot creep back into the UI.
export const radius = {
  xs: 3,
  sm: 5,
  md: 8,
  lg: 10,
  xl: 12,
} as const;

// ─── Elevation ───────────────────────────────────────────────────────
// Panels are separated by rules and surface value, not drop shadows.
// Shadow is reserved for genuinely floating chrome (tab bar, sheets).
export const elevation = {
  none: {},
  chrome: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.4,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: -2 },
    },
    android: { elevation: 12 },
    default: {},
  }),
} as const;

/** Minimum tappable edge, per platform HIG guidance. */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };
export const MIN_TAP = 44;
