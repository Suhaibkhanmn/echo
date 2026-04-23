export const lightTheme = {
  background: "#FAFAF7",
  surface: "#FFFFFF",
  ink: "#1A1915",
  muted: "#6B6862",
  divider: "#EAE7E0",
  accent: "#2F6B52",
  accentMuted: "#2F6B5233",
  danger: "#9B3B3B",
  dangerMuted: "#9B3B3B22",

  fontSerif: "'Source Serif 4', 'Georgia', serif",
  fontSans: "'Inter', 'system-ui', sans-serif",

  fontSize: {
    xs: "0.75rem",
    sm: "0.8125rem",
    base: "0.9375rem",
    lg: "1.0625rem",
    xl: "1.25rem",
  },

  lineHeight: "1.55",
  radius: "6px",
  radiusLg: "8px",

  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    xxl: "48px",
  },
} as const;

export const darkTheme = {
  ...lightTheme,
  background: "#17151F",
  surface: "#1E1C28",
  ink: "#EDE8DC",
  muted: "#888276",
  divider: "#2A2730",
  accentMuted: "#2F6B5244",
  dangerMuted: "#9B3B3B33",
} as const;

export type Theme = typeof lightTheme;

export function getCssVariables(theme: Theme): Record<string, string> {
  return {
    "--bg": theme.background,
    "--surface": theme.surface,
    "--ink": theme.ink,
    "--muted": theme.muted,
    "--divider": theme.divider,
    "--accent": theme.accent,
    "--accent-muted": theme.accentMuted,
    "--danger": theme.danger,
    "--danger-muted": theme.dangerMuted,
    "--font-serif": theme.fontSerif,
    "--font-sans": theme.fontSans,
    "--font-xs": theme.fontSize.xs,
    "--font-sm": theme.fontSize.sm,
    "--font-base": theme.fontSize.base,
    "--font-lg": theme.fontSize.lg,
    "--font-xl": theme.fontSize.xl,
    "--line-height": theme.lineHeight,
    "--radius": theme.radius,
    "--radius-lg": theme.radiusLg,
    "--sp-xs": theme.spacing.xs,
    "--sp-sm": theme.spacing.sm,
    "--sp-md": theme.spacing.md,
    "--sp-lg": theme.spacing.lg,
    "--sp-xl": theme.spacing.xl,
    "--sp-xxl": theme.spacing.xxl,
  };
}
