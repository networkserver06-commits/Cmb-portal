import { Share2 } from "lucide-react";
import { toast } from "sonner";

export default function ShareDocumentButton({
  title,
  url,
  compact = false,
}: {
  title: string;
  url?: string;
  compact?: boolean;
}) {
  const share = async () => {
    const target = url ?? window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title,
          text: `Open ${title} on ScholarShelf`,
          url: target,
        });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(target);
      } else {
        const input = document.createElement("textarea");
        input.value = target;
        input.setAttribute("readonly", "true");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
      }
      toast.success("Share link copied", {
        description: "Anyone with access can open this ScholarShelf document link.",
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not share this document", {
        description: "Copy the page URL from your browser and try again.",
      });
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      aria-label={`Share ${title}`}
      title={`Share ${title}`}
      className={
        compact
          ? "inline-flex h-9 items-center gap-1.5 rounded-full border border-[#c8d9d2] bg-white px-3 text-xs font-semibold text-[#1d5146] transition hover:bg-[#e8f1ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d5146] focus-visible:ring-offset-2"
          : "inline-flex h-10 items-center gap-2 rounded-full border border-[#b8d1c5] bg-white px-4 text-sm font-semibold text-[#1d5146] transition hover:bg-[#e8f1ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d5146] focus-visible:ring-offset-2"
      }
    >
      <Share2 size={compact ? 14 : 16} />
      {compact ? "Share" : "Share document"}
    </button>
  );
}
