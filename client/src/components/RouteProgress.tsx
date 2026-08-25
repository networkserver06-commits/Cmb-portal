import { Loader2 } from "lucide-react";

export default function RouteProgress({
  visible,
  label,
}: {
  visible: boolean;
  label: string;
}) {
  if (!visible) return null;
  return (
    <div
      className="route-progress"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="route-progress-track" aria-hidden="true">
        <span className="route-progress-indicator" />
      </span>
      <Loader2
        className="route-progress-spinner"
        size={15}
        aria-hidden="true"
      />
      <span>{label}</span>
    </div>
  );
}
