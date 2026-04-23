export const colors = {
  light: {
    bg: "#FAFAF7",
    surface: "#FFFFFF",
    surfaceAlt: "#F3F1EB",
    ink: "#1A1915",
    inkSoft: "#3A3830",
    muted: "#6B6862",
    subtle: "#9A968D",
    divider: "#E6E2D9",
    accent: "#2F6B52",
    accentMuted: "#2F6B521F",
    accentInk: "#1E4D3A",
    danger: "#9B3B3B",
    dangerMuted: "#9B3B3B1F",
  },
  dark: {
    bg: "#14131B",
    surface: "#1C1A25",
    surfaceAlt: "#25222E",
    ink: "#EDE8DC",
    inkSoft: "#C8C3B5",
    muted: "#8F897B",
    subtle: "#6D685D",
    divider: "#2A2732",
    accent: "#4A9A7B",
    accentMuted: "#4A9A7B2A",
    accentInk: "#83C5A7",
    danger: "#D46A6A",
    dangerMuted: "#D46A6A2A",
  },
};

export type ThemeMode = "light" | "dark";

export function getColors(mode: ThemeMode) {
  return colors[mode];
}

export const fonts = {
  serif: "serif",
  sans: "sans-serif",
};

// mobile-first type scale (dp)
export const sizes = {
  xxs: 11,
  xs: 13,
  sm: 15,
  base: 17,
  md: 19,
  lg: 22,
  xl: 28,
  display: 34,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};
