import { StyleSheet } from "react-native";

/** Slopify Cyberpunk / Sunset / Synthwave theme */
export const colors = {
  bg: "#0B0813",             // Deep midnight violet
  surface: "#171226",        // Dark violet surface
  card: "#251C3D",           // Slightly brighter purple-tinted card
  cardHover: "#322652",
  accent: "#FF2E93",         // Hot neon pink
  secondaryAccent: "#9D4EDD", // Electric purple
  cyan: "#00F0FF",           // Cyberpunk neon cyan
  sunsetOrange: "#FF7B00",   // Sunset orange/gold
  text: "#F8F6FF",           // Bright crisp white-violet
  textSecondary: "#A89EB8",  // Muted neon lavender
  border: "#3B2D5C",         // Subtle purple glowing border
};

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Shared stylesheet pieces */
export const shared = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  searchInput: {
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    marginHorizontal: 16,
    marginBottom: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
