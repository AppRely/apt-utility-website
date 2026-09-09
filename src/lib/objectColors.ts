export type VideoColorTheme = "light" | "dark";

export const LIGHT_VIDEO_COLORS = [
  "#B91C1C", "#166534", "#1D4ED8", "#7E22CE", "#BE185D", "#0F766E",
  "#9A3412", "#4338CA", "#3F6212", "#A21CAF", "#0369A1", "#92400E",
  "#6B21A8", "#047857", "#C2410C", "#1E40AF", "#9F1239", "#115E59",
  "#713F12", "#4C1D95", "#065F46", "#991B1B", "#0E7490", "#6D28D9",
];

export const DARK_VIDEO_COLORS = [
  "#FF5252", "#69F0AE", "#40C4FF", "#FFD740", "#E040FB", "#18FFFF",
  "#FFAB40", "#B388FF", "#CCFF90", "#FF80AB", "#80D8FF", "#FFFF8D",
  "#EA80FC", "#64FFDA", "#FF9E80", "#8C9EFF", "#FF8A80", "#A7FFEB",
  "#FFE57F", "#B39DDB", "#00E676", "#FF6E6E", "#84FFFF", "#B2FF59",
];

export const getObjectColor = (objectId: number, theme: VideoColorTheme = "light") => {
  const colors = theme === "light" ? LIGHT_VIDEO_COLORS : DARK_VIDEO_COLORS;
  return colors[Math.abs(objectId) % colors.length];
};