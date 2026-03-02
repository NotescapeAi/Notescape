
export const CLICK_EFFECTS_KEY = "notescape.ui.clickEffects";

export function getClickEffectsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const val = window.localStorage.getItem(CLICK_EFFECTS_KEY);
  return val !== "false"; // Default to true
}

export function setClickEffectsEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CLICK_EFFECTS_KEY, String(enabled));
  window.dispatchEvent(new Event("click-effects-changed"));
}
