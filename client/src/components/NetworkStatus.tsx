import { Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

export default function NetworkStatus() {
  const [offline, setOffline] = useState(() =>
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    let reconnectTimer: number | undefined;

    const handleOffline = () => {
      setOffline(true);
      setShowReconnected(false);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
    };

    const handleOnline = () => {
      setOffline(false);
      setShowReconnected(true);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      reconnectTimer = window.setTimeout(() => setShowReconnected(false), 3500);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
    };
  }, []);

  if (!offline && !showReconnected) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-3 bottom-3 z-[80] mx-auto flex max-w-xl items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur md:inset-x-auto md:right-5 md:mx-0 ${
        offline
          ? "border-[#e8c9a2] bg-[#fff9ed]/95 text-[#775728]"
          : "border-[#b8d8c8] bg-[#edf8f1]/95 text-[#27654f]"
      }`}
    >
      {offline ? <WifiOff size={18} className="mt-0.5 shrink-0" /> : <Wifi size={18} className="mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <p className="font-semibold">
          {offline ? "You’re offline" : "Connection restored"}
        </p>
        <p className="mt-0.5 text-xs leading-5 opacity-85">
          {offline
            ? "Your current page stays available. Reconnect to load documents, save changes, or complete checkout."
            : "ScholarShelf is connected again. You can continue loading and sharing resources."}
        </p>
      </div>
    </div>
  );
}
