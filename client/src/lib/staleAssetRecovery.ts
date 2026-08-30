const STALE_ASSET_PATTERNS = [
  "failed to fetch dynamically imported module",
  "importing a module script failed",
  "loading chunk",
  "chunkloaderror",
];

const RECOVERY_KEY = "scholarshelf-asset-recovery-attempted";

export function isStaleAssetError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const normalized = message.toLowerCase();
  return STALE_ASSET_PATTERNS.some(pattern => normalized.includes(pattern));
}

export function markAssetRecoveryAttempt(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const existing = sessionStorage.getItem(RECOVERY_KEY);
    const lastAttempt = existing ? Number(existing) : 0;
    if (Number.isFinite(lastAttempt) && Date.now() - lastAttempt < 30_000) {
      return false;
    }
    sessionStorage.setItem(RECOVERY_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

export function clearAssetRecoveryAttempt(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    // Storage can be unavailable in private browsing or embedded previews.
  }
}

export function installStaleAssetRecovery(): void {
  if (typeof window === "undefined") return;

  const recover = (error: unknown) => {
    if (!isStaleAssetError(error) || !markAssetRecoveryAttempt()) return false;
    window.location.reload();
    return true;
  };

  window.addEventListener("error", event => {
    if (recover(event.error ?? event.message)) event.preventDefault();
  });
  window.addEventListener("unhandledrejection", event => {
    if (recover(event.reason)) event.preventDefault();
  });
}
