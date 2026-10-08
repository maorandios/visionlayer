/** First-run setup persistence — do not re-show after complete or skip. */

const KEY = "vl_setup_complete";

export function isSetupComplete(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

export function markSetupComplete(): void {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    /* ignore quota */
  }
}

/** Test helper. */
export function clearSetupComplete(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
