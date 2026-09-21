import { Link } from "wouter";
import { ArrowLeft, CheckCircle2, Download, ExternalLink, HelpCircle, Smartphone } from "lucide-react";

const androidDownloadUrl =
  (import.meta.env.VITE_ANDROID_APP_DOWNLOAD_URL as string | undefined)?.trim() ||
  "https://portal.leetec.online/app";

const steps = [
  {
    title: "Download the Android app",
    description: "Tap the download button below and wait for the APK file to finish downloading.",
  },
  {
    title: "Open the downloaded file",
    description: "Open the APK from your browser downloads or your phone's Downloads folder.",
  },
  {
    title: "Allow this installation",
    description: "If Android asks, enable Allow from this source for the browser or file manager you used.",
  },
  {
    title: "Install and sign in",
    description: "Tap Install, open ScholarShelf, and sign in with your existing student account.",
  },
];

export default function AppDownload() {
  return (
    <main className="min-h-screen bg-[#f7f8f6] text-[#19312c]">
      <header className="border-b border-[#dce6e1] bg-white">
        <div className="container flex min-h-20 items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#1d5146]">
            <ArrowLeft size={16} /> Back to ScholarShelf
          </Link>
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#6b8f83]">Android app</span>
        </div>
      </header>

      <div className="container grid max-w-6xl gap-8 py-10 md:grid-cols-[1.05fr_.95fr] md:py-16">
        <section className="rounded-[2rem] bg-[#1d5146] p-7 text-white shadow-xl shadow-[#1d5146]/10 sm:p-10">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#e8c979] text-[#19312c]">
            <Smartphone size={27} />
          </div>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-[#b9d6ca]">ScholarShelf mobile</p>
          <h1 className="mt-3 max-w-xl font-serif text-4xl font-semibold leading-tight sm:text-5xl">
            Your study desk, ready when you are.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#d4e6df]">
            Download the ScholarShelf Android app for quick access to your library, student dashboard, and ScholarShelf Assistant.
          </p>
          <a
            href={androidDownloadUrl}
            target="_blank"
            rel="noreferrer"
            download
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#e8c979] px-5 py-3 text-sm font-bold text-[#19312c] transition hover:bg-[#f1d995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8c979] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1d5146]"
          >
            <Download size={17} /> Download Android app <ExternalLink size={15} />
          </a>
          <p className="mt-4 text-xs text-[#b9d6ca]">Android 7.0 and newer · Secure ScholarShelf sign-in</p>
        </section>

        <section className="rounded-[2rem] border border-[#dfe9e3] bg-white p-7 shadow-sm sm:p-10">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e8f1ed] text-[#2d7965]">
              <HelpCircle size={21} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#94aaa2]">Installation help</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-[#173e35]">Install in four steps</h2>
            </div>
          </div>
          <div className="mt-7 space-y-5">
            {steps.map((step, index) => (
              <div key={step.title} className="flex gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#1d5146] text-sm font-bold text-white">
                  {index + 1}
                </div>
                <div>
                  <h3 className="font-semibold text-[#274d43]">{step.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-[#718780]">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-2xl border border-[#e6d49c] bg-[#fff9e8] p-4 text-sm leading-6 text-[#7a5b16]">
            <p className="flex items-start gap-2 font-semibold"><CheckCircle2 size={17} className="mt-0.5 shrink-0" /> Installation blocked?</p>
            <p className="mt-1">Open Android Settings, search for “Install unknown apps”, select the browser used for the download, enable permission, then open the APK again.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
