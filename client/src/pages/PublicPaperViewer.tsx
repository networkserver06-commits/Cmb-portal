import {
  ArrowLeft,
  BookOpen,
  Download,
  Eye,
  FileText,
  Loader2,
} from "lucide-react";
import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { educationLevelLabel } from "@shared/educationLevels";

const catalogueInput = {};

function isFreePaper(paper: any) {
  return paper.accessMode === "free" && Number(paper.priceKes) === 0;
}

function ViewerShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f8f6] text-[#19312c]">
      <header className="border-b border-[#dce6e1] bg-white">
        <div className="container flex min-h-[76px] items-center justify-between gap-4 py-3">
          <a href="/" className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#1d5146] text-[#e8c979] shadow-lg shadow-[#1d5146]/15">
              <BookOpen size={23} strokeWidth={1.8} />
            </div>
            <div>
              <div className="font-serif text-xl font-semibold tracking-tight text-[#163d35]">
                Scholar<span className="text-[#bb8a2e]">Shelf</span>
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#78938a]">
                EXAMINATION PAPER LIBRARY
              </div>
            </div>
          </a>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-[#c8d9d2] px-3 py-2 text-sm font-semibold text-[#1d5146] transition hover:bg-[#e8f1ed]"
          >
            <ArrowLeft size={15} />
            <span className="hidden sm:inline">Back to catalogue</span>
            <span className="sm:hidden">Catalogue</span>
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}

export default function PublicPaperViewer() {
  const [location] = useLocation();
  const paperId = useMemo(() => {
    const path = location.split(/[?#]/)[0];
    const value = Number(path.split("/").filter(Boolean).at(-1));
    return Number.isInteger(value) && value > 0 ? value : null;
  }, [location]);
  const catalogue = trpc.catalogue.useQuery(catalogueInput);
  const paper = useMemo(
    () => catalogue.data?.find(item => item.legacyId === paperId),
    [catalogue.data, paperId]
  );
  const publicPaper =
    paper && isFreePaper(paper) && paper.isAvailable ? paper : null;
  const documentHref = publicPaper
    ? `/api/papers/${publicPaper.legacyId}/free-view`
    : "";

  if (catalogue.isLoading) {
    return (
      <ViewerShell>
        <main className="container grid min-h-[70vh] place-items-center py-16">
          <div
            className="flex items-center gap-3 text-sm text-[#58766b]"
            role="status"
          >
            <Loader2 className="animate-spin" size={18} />
            Loading the free paper…
          </div>
        </main>
      </ViewerShell>
    );
  }

  if (!publicPaper || !paperId) {
    return (
      <ViewerShell>
        <main className="container grid min-h-[70vh] place-items-center py-16">
          <section className="max-w-lg rounded-3xl border border-[#dce7e1] bg-white p-8 text-center shadow-sm">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#fff4f3] text-[#a44e49]">
              <FileText size={25} />
            </div>
            <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#94aaa2]">
              Paper unavailable
            </p>
            <h1 className="mt-2 font-serif text-3xl font-semibold text-[#173e35]">
              This free paper cannot be viewed right now.
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#718780]">
              It may have been paused, removed, or reserved for authenticated
              access. Return to the catalogue to choose another published
              resource.
            </p>
            <Link
              href="/#catalogue"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#1d5146] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#153c34]"
            >
              Browse catalogue <ArrowLeft className="rotate-180" size={15} />
            </Link>
          </section>
        </main>
      </ViewerShell>
    );
  }

  return (
    <ViewerShell>
      <main className="container py-8 md:py-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6b8f83]">
                <span>Public free resource</span>
                <span className="text-[#bdcfc6]">·</span>
                <span> {publicPaper.course}</span>
              </div>
              <h1 className="mt-3 max-w-4xl break-words font-serif text-3xl font-semibold leading-tight tracking-tight text-[#173e35] md:text-5xl">
                {publicPaper.title}
              </h1>
              <p className="mt-3 text-sm text-[#648078]">
                {publicPaper.unit} · {educationLevelLabel(publicPaper.level)} ·{" "}
                {publicPaper.cycle}
              </p>
              {publicPaper.description && (
                <p className="mt-4 max-w-3xl text-sm leading-6 text-[#718780]">
                  {publicPaper.description}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#e5f2eb] px-3 py-2 text-xs font-semibold text-[#34745f]">
                <Eye size={14} /> Free access
              </span>
              <a
                href={documentHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-[#b8d1c5] bg-white px-4 py-2.5 text-sm font-semibold text-[#1d5146] transition hover:bg-[#e8f1ed]"
              >
                <Download size={15} /> Open document
              </a>
            </div>
          </div>

          <section className="mt-8 overflow-hidden rounded-[1.7rem] border border-[#c9ddd4] bg-white shadow-[0_18px_55px_rgba(29,81,70,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4eee9] bg-[#edf6f1] px-4 py-3 text-xs text-[#648078] md:px-6">
              <div className="flex items-center gap-2 font-semibold text-[#1d5146]">
                <FileText size={15} />
                Full paper preview
              </div>
              <span>No account required to read this resource.</span>
            </div>
            <iframe
              src={documentHref}
              title={`Full paper preview: ${publicPaper.title}`}
              className="h-[72vh] min-h-[520px] w-full bg-[#f7f8f6]"
            />
          </section>

          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#dce7e1] bg-white p-4 text-sm text-[#718780] sm:flex-row sm:items-center sm:justify-between">
            <p>
              This document is publicly readable because it is an active
              Free-access resource. Paid papers continue to require secure
              checkout and an account.
            </p>
            <Link
              href="/#catalogue"
              className="inline-flex shrink-0 items-center gap-2 font-semibold text-[#1d5146] underline underline-offset-4"
            >
              View more papers <ArrowLeft className="rotate-180" size={14} />
            </Link>
          </div>
        </div>
      </main>
    </ViewerShell>
  );
}
