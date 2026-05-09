export const Colors = {
  // Brand
  primary: '#1E0A4E',      // deep purple — live class banner, headers
  primaryLight: '#2D1B69',
  accent: '#F97316',        // orange — active tab, timer, CTAs
  accentLight: '#FED7AA',

  // Backgrounds
  background: '#F5F0FF',    // light lavender app bg
  surface: '#FFFFFF',       // cards
  surfaceAlt: '#F8F5FF',    // subtle tinted surface

  // Text
  text: '#1A1A2E',
  textSecondary: '#6B6B8A',
  textLight: '#9B9BB5',
  textInverse: '#FFFFFF',

  // Status
  success: '#16A34A',
  successLight: '#DCFCE7',
  warning: '#D97706',
  warningLight: '#FEF3C7',
  danger: '#DC2626',
  dangerLight: '#FEE2E2',
  info: '#0EA5E9',
  infoLight: '#E0F2FE',

  // Border & Divider
  border: '#E8E0F0',
  divider: '#F0EBF8',

  // Module icon backgrounds (from design)
  modules: {
    classes:    { bg: '#CCFBF1', icon: '#0D9488' },
    attendance: { bg: '#DCFCE7', icon: '#16A34A' },
    timetable:  { bg: '#FEF3C7', icon: '#D97706' },
    results:    { bg: '#FEE2E2', icon: '#DC2626' },
    library:    { bg: '#D1FAE5', icon: '#059669' },
    documents:  { bg: '#FFEDD5', icon: '#EA580C' },
    holidays:   { bg: '#FEF9C3', icon: '#CA8A04' },
    aptitude:   { bg: '#EDE9FE', icon: '#7C3AED' },
    fees:       { bg: '#FCE7F3', icon: '#DB2777' },
    chat:       { bg: '#DBEAFE', icon: '#2563EB' },
    alerts:     { bg: '#FDF4FF', icon: '#A855F7' },
    profile:    { bg: '#CCFBF1', icon: '#0F766E' },
    leave:      { bg: '#FFF7ED', icon: '#C2410C' },
    section:    { bg: '#EEF2FF', icon: '#4338CA' },
    payroll:    { bg: '#F0FDF4', icon: '#15803D' },
    exams:      { bg: '#FDF2F8', icon: '#BE185D' },
  },

  // Tab bar
  tabActive: '#F97316',
  tabInactive: '#9B9BB5',
  tabBar: '#FFFFFF',

  // Shadow
  shadow: 'rgba(30, 10, 78, 0.08)',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

export const Typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '600' as const },
  h4: { fontSize: 16, fontWeight: '600' as const },
  body: { fontSize: 14, fontWeight: '400' as const },
  bodySmall: { fontSize: 12, fontWeight: '400' as const },
  caption: { fontSize: 11, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '500' as const },
};
