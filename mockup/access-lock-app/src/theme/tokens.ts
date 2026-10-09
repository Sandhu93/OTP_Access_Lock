/**
 * Access Lock — design tokens
 * Ported 1:1 from the approved canvas (StyleGuide artboard).
 * Keep this file as the single source of truth — never hardcode a hex
 * or size in a screen/component when a token exists here.
 */

export const colors = {
  bg: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceAlt: '#ECF0F5',
  border: '#DCE2EA',
  borderStrong: '#B9C2D0',

  textPrimary: '#122A4E',
  textSecondary: '#48566E',
  textTertiary: '#7C879B',

  accent: '#2A5CAE',
  accent600: '#1F4886',
  accentSoft: '#E4ECF9',
  accentSoftBorder: '#C7D7F0',

  success: '#1C7A5E',
  successSoft: '#E0F3EC',
  successSoftBorder: '#B9E4D3',

  amber: '#B67B12',
  amberText: '#7A540C',
  amberSoft: '#FBF0DC',
  amberSoftBorder: '#F0D9A6',

  danger: '#B23A2E',
  dangerText: '#8C2C22',
  dangerSoft: '#FBEAE7',
  dangerSoftBorder: '#F0C4BC',

  neutralSoft: '#EEF1F5',
  neutralText: '#5B6779',

  // Bench Test (developer-only) dark palette — intentionally distinct
  // from the production palette above so the screen can never be
  // mistaken for a real part of the app.
  dbgBg: '#12161C',
  dbgSurface: '#1B212B',
  dbgBorder: '#2B3341',
  dbgText: '#D7DEE8',
  dbgTextDim: '#7D8AA0',
  dbgGreen: '#5FD9A4',
  dbgAmber: '#E0B24A',
  dbgRed: '#EB6F63',
  dbgBlue: '#6FA8E0'
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 48
} as const;

export const radii = {
  btn: 12,
  card: 18,
  pill: 999
} as const;

export const shadow = {
  card: {
    shadowColor: '#122A4E',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2
  }
} as const;

/**
 * Font family names as registered with expo-font in App.tsx.
 * IBM Plex Sans for UI copy, IBM Plex Mono for OTP digits, request IDs,
 * timers and audit timestamps — mirrors the canvas exactly.
 */
export const fonts = {
  regular: 'IBMPlexSans_400Regular',
  medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold',
  bold: 'IBMPlexSans_700Bold',
  mono: 'IBMPlexMono_500Medium',
  monoSemibold: 'IBMPlexMono_600SemiBold'
} as const;

export const type = {
  display: { fontSize: 28, lineHeight: 34, fontFamily: fonts.bold },
  title: { fontSize: 22, lineHeight: 28, fontFamily: fonts.bold },
  heading: { fontSize: 17, lineHeight: 22, fontFamily: fonts.semibold },
  body: { fontSize: 15, lineHeight: 22, fontFamily: fonts.regular },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontFamily: fonts.semibold },
  caption: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
  captionStrong: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.semibold },
  micro: { fontSize: 11, lineHeight: 14, fontFamily: fonts.semibold },
  mono: { fontSize: 24, lineHeight: 28, fontFamily: fonts.monoSemibold }
} as const;

/** Minimum touch target, per the accessibility requirements. */
export const MIN_TOUCH_TARGET = 44;

/** Standard mobile artboard size this design was built against. */
export const PHONE_WIDTH = 390;
