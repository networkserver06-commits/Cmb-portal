import { ArrowRight, Download, Smartphone } from "lucide-react";

const androidDownloadUrl =
  (import.meta.env.VITE_ANDROID_APP_DOWNLOAD_URL as string | undefined)?.trim() ||
  "/app";

export default function AndroidAppPrompt({ compact = false }: { compact?: boolean }) {
  return (
    <section
      id={compact ? undefined : "android-app"}
      aria-label="ScholarShelf Android app"
      className={
        compact
          ? "rounded-3xl border border-[#c8ddd3] bg-[#eef7f2] p-5 shadow-sm"
          : "overflow-hidden rounded-[2rem] border border-[#c8ddd3] bg-[#eef7f2] shadow-sm"
      }
    >
      <div className={compact ? "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" : "flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between md:p-8"}>
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#1d5146] text-[#e8c979]">
            <Smartphone size={22} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2d7965]">
              ScholarShelf on Android
            </p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-[#173e35]">
              Take your study desk with you.
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#648078]">
              Access your library and ScholarShelf Assistant from a focused mobile experience.
            </p>
          </div>
        </div>
        <a
          href={androidDownloadUrl}
          target="_blank"
          rel="noreferrer"
          download
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#1d5146] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#153c34] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d5146] focus-visible:ring-offset-2"
        >
          <Download size={17} /> Install ScholarShelf app <ArrowRight size={15} />
        </a>
      </div>
    </section>
  );
}
