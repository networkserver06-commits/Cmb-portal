import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Loader2,
  LockKeyhole,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import DOMPurify from "dompurify";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { trpc } from "@/lib/trpc";
import { educationLevelLabel } from "@shared/educationLevels";
import { resourceTypeLabel } from "@shared/resourceTypes";
import ShareDocumentButton from "@/components/ShareDocumentButton";
import GrokStudyAssistant from "@/components/GrokStudyAssistant";
import { useAuth } from "@/_core/hooks/useAuth";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const catalogueInput = {};

type DocumentStatus = "loading" | "ready" | "error";

function isFreePaper(paper: any) {
  return paper.accessMode === "free" && Number(paper.priceKes) === 0;
}

const officeMimeLabels: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "DOCX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "PPTX",
  "application/vnd.oasis.opendocument.text": "ODT",
  "application/vnd.oasis.opendocument.presentation": "ODP",
  "application/vnd.oasis.opendocument.spreadsheet": "ODS",
  "application/rtf": "RTF",
  "text/rtf": "RTF",
  "application/epub+zip": "EPUB",
};

const officeExtensions = new Set([
  "docx",
  "xlsx",
  "pptx",
  "odt",
  "odp",
  "ods",
  "rtf",
  "epub",
]);

function officeFormatLabel(mimeType: string, fileName: string) {
  const normalizedMimeType = mimeType.split(";", 1)[0].trim().toLowerCase();
  if (officeMimeLabels[normalizedMimeType])
    return officeMimeLabels[normalizedMimeType];
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  return officeExtensions.has(extension) ? extension.toUpperCase() : null;
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
                LEARNING RESOURCE LIBRARY
              </div>
            </div>
          </a>
          <nav className="flex items-center gap-2" aria-label="Document navigation">
            <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-[#c8d9d2] px-3 py-2 text-sm font-semibold text-[#1d5146] transition hover:bg-[#e8f1ed]">
              <ArrowLeft size={15} /> <span className="hidden sm:inline">Catalogue</span>
            </Link>
            <Link href="/ai" className="inline-flex items-center gap-2 rounded-full border border-[#c8d9d2] px-3 py-2 text-sm font-semibold text-[#1d5146] transition hover:bg-[#e8f1ed]">
              <Sparkles size={15} /> <span className="hidden sm:inline">AI help</span>
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}

function DocumentFallback({
  href,
  message,
}: {
  href: string;
  message: string;
}) {
  return (
    <div className="grid min-h-[420px] place-items-center bg-[#fbfcfb] p-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#fff5df] text-[#9a721c]">
          <FileText size={25} />
        </div>
        <h2 className="mt-5 font-serif text-2xl font-semibold text-[#173e35]">
          This format needs a separate viewer.
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#718780]">{message}</p>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#1d5146] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#153c34]"
        >
          <Download size={15} /> Open document separately
        </a>
      </div>
    </div>
  );
}

function TextDocumentPreview({ href, title }: { href: string; title: string }) {
  const [status, setStatus] = useState<DocumentStatus>("loading");
  const [content, setContent] = useState("");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setContent("");
    fetch(href)
      .then(response => {
        if (!response.ok) throw new Error("The document could not be loaded.");
        return response.text();
      })
      .then(text => {
        if (cancelled) return;
        setContent(text);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [href]);

  if (status === "loading")
    return (
      <div
        className="grid min-h-[420px] place-items-center bg-white text-sm text-[#58766b]"
        role="status"
      >
        <span className="flex items-center gap-3">
          <Loader2 className="animate-spin" size={18} /> Opening the full resource…
        </span>
      </div>
    );
  if (status === "error")
    return (
      <DocumentFallback
        href={href}
        message={`The ${title} text could not be displayed inside the portal right now.`}
      />
    );

  return (
    <pre
      aria-label={`Full resource text: ${title}`}
      className="min-h-[420px] overflow-x-auto whitespace-pre-wrap break-words bg-white p-5 text-left font-mono text-[13px] leading-6 text-[#243f37] md:p-8"
    >
      {content}
    </pre>
  );
}

function OfficeDocumentPreview({
  href,
  fallbackHref,
  format,
  title,
}: {
  href: string;
  fallbackHref: string;
  format: string;
  title: string;
}) {
  const [status, setStatus] = useState<DocumentStatus>("loading");
  const [markup, setMarkup] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 45_000);
    setStatus("loading");
    setMarkup("");
    setError("");

    const parseOfficeFile = async () => {
      try {
        const response = await fetch(href, { signal: controller.signal });
        if (!response.ok) throw new Error("The document could not be loaded.");
        const html = await response.text();
        if (cancelled) return;
        setMarkup(
          DOMPurify.sanitize(html, {
            USE_PROFILES: { html: true },
          })
        );
        setStatus("ready");
      } catch (parseError) {
        if (cancelled) return;
        setError(
          parseError instanceof Error
            ? parseError.message
            : `The ${format} document could not be converted.`
        );
        setStatus("error");
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    void parseOfficeFile();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [format, href]);

  if (status === "loading")
    return (
      <div
        className="grid min-h-[420px] place-items-center bg-[#fbfcfb] p-6 text-sm text-[#58766b]"
        role="status"
      >
        <span className="flex items-center gap-3 text-center">
          <Loader2 className="animate-spin" size={18} />
          Preparing the full {format} document…
        </span>
      </div>
    );
  if (status === "error")
    return (
      <DocumentFallback
        href={fallbackHref}
        message={
          error ||
          `This ${format} document could not be rendered inside the portal.`
        }
      />
    );

  return (
    <article
      aria-label={`Full ${format} document: ${title}`}
      className="office-preview min-h-[420px] overflow-x-auto bg-white p-5 text-[#243f37] md:p-8"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

function PdfPageCanvas({ pdf, pageNumber }: { pdf: any; pageNumber: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<DocumentStatus>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let renderTask: any = null;
    let pageProxy: any = null;
    setStatus("loading");
    setError("");

    const renderPage = async () => {
      try {
        pageProxy = await pdf.getPage(pageNumber);
        await new Promise<void>(resolve =>
          requestAnimationFrame(() => resolve())
        );
        const page = pageProxy as any;
        const canvas = canvasRef.current;
        if (!canvas) throw new Error("The PDF page surface is unavailable.");
        const holderWidth = canvas.parentElement?.clientWidth ?? 900;
        const baseViewport = page.getViewport({ scale: 1 });
        const displayWidth = Math.max(260, Math.min(holderWidth - 32, 920));
        const displayScale = Math.max(0.8, displayWidth / baseViewport.width);
        const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 2);
        const displayViewport = page.getViewport({ scale: displayScale });
        canvas.width = Math.ceil(displayViewport.width * pixelRatio);
        canvas.height = Math.ceil(displayViewport.height * pixelRatio);
        canvas.style.width = `${Math.ceil(displayViewport.width)}px`;
        canvas.style.height = `${Math.ceil(displayViewport.height)}px`;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas rendering is unavailable.");
        context.save();
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.restore();
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport: displayViewport,
          transform:
            pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : undefined,
        });
        await renderTask.promise;
        if (pageProxy) pageProxy.cleanup?.();
        if (!cancelled) setStatus("ready");
      } catch (renderError) {
        if (cancelled) return;
        setError(
          renderError instanceof Error
            ? renderError.message
            : "This PDF page could not be rendered."
        );
        setStatus("error");
      }
    };

    void renderPage();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      pageProxy?.cleanup?.();
    };
  }, [pageNumber, pdf]);

  return (
    <div className="relative grid min-h-[220px] place-items-center bg-white">
      <canvas ref={canvasRef} className="block max-w-full" />
      {status === "loading" && (
        <div
          className="absolute inset-0 grid min-h-[220px] place-items-center bg-[#fbfcfb] text-sm text-[#78938a]"
          role="status"
        >
          <span className="flex items-center gap-2">
            <Loader2 className="animate-spin" size={16} /> Rendering page…
          </span>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 grid min-h-[220px] place-items-center bg-[#fffaf0] p-5 text-center text-sm text-[#8b6a2b]">
          <span>{error || "This PDF page could not be rendered."}</span>
        </div>
      )}
    </div>
  );
}

function PdfDocumentPreview({ href, title }: { href: string; title: string }) {
  const [status, setStatus] = useState<DocumentStatus>("loading");
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [selectedPage, setSelectedPage] = useState(1);
  const [showAllPages, setShowAllPages] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;
    let documentProxy: any = null;
    setStatus("loading");
    setPageCount(null);
    setPdf(null);
    setSelectedPage(1);
    setShowAllPages(false);
    setError("");

    const loadPdf = async () => {
      try {
        loadingTask = pdfjsLib.getDocument({ url: href });
        documentProxy = await loadingTask.promise;
        if (cancelled) {
          await documentProxy.cleanup();
          return;
        }
        setPageCount(documentProxy.numPages);
        setPdf(documentProxy);
        setStatus("ready");
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "The PDF could not be opened inside the portal."
        );
        setStatus("error");
      }
    };

    void loadPdf();
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
      if (documentProxy) void documentProxy.cleanup();
    };
  }, [href]);

  useEffect(() => {
    if (pageCount === null) return;
    setSelectedPage(current => Math.min(Math.max(current, 1), pageCount));
  }, [pageCount]);

  useEffect(() => {
    if (showAllPages || status !== "ready") return;
    const pageElement = document.getElementById(`pdf-page-${selectedPage}`);
    pageElement?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedPage, showAllPages, status]);

  if (status === "loading")
    return (
      <div
        className="grid min-h-[420px] place-items-center bg-[#fbfcfb] text-sm text-[#58766b]"
        role="status"
      >
        <span className="flex items-center gap-3">
          <Loader2 className="animate-spin" size={18} /> Opening the reader…
        </span>
      </div>
    );
  if (status === "error")
    return (
      <DocumentFallback
        href={href}
        message={
          error || `The ${title} PDF could not be rendered inside the portal.`
        }
      />
    );

  const totalPages = pageCount ?? 0;
  const pagesToRender = showAllPages
    ? Array.from({ length: totalPages }, (_, index) => index + 1)
    : [selectedPage];

  const changePage = (page: number) => {
    setShowAllPages(false);
    setSelectedPage(Math.min(Math.max(page, 1), totalPages));
  };

  return (
    <div
      className="space-y-4 bg-[#edf2ef] p-3 md:p-5"
      aria-label={`Full resource: ${title}`}
    >
      <div className="sticky top-0 z-10 rounded-2xl border border-[#cfe0d9] bg-[#f7fbf8]/95 p-3 shadow-sm backdrop-blur md:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#78938a]">
              Focused reading mode
            </p>
            <p className="mt-1 text-sm font-semibold text-[#244b40]">
              {showAllPages
                ? `All ${totalPages} pages visible`
                : `Page ${selectedPage} of ${totalPages}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => changePage(selectedPage - 1)}
              disabled={selectedPage <= 1 || showAllPages}
              aria-label="Previous page"
              className="grid h-10 w-10 place-items-center rounded-full border border-[#c8d9d2] bg-white text-[#1d5146] transition hover:bg-[#e8f1ed] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={17} />
            </button>
            <label htmlFor="reader-page-select" className="sr-only">
              Select page to read
            </label>
            <select
              id="reader-page-select"
              value={String(selectedPage)}
              onChange={event => changePage(Number(event.target.value))}
              className="h-10 min-w-[112px] rounded-full border border-[#c8d9d2] bg-white px-3 text-sm font-semibold text-[#1d5146] outline-none transition focus:border-[#1d5146] focus:ring-2 focus:ring-[#1d5146]/15"
              aria-label="Select page to read"
            >
              {Array.from({ length: totalPages }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  Page {index + 1}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => changePage(selectedPage + 1)}
              disabled={selectedPage >= totalPages || showAllPages}
              aria-label="Next page"
              className="grid h-10 w-10 place-items-center rounded-full border border-[#c8d9d2] bg-white text-[#1d5146] transition hover:bg-[#e8f1ed] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight size={17} />
            </button>
            <button
              type="button"
              onClick={() => setShowAllPages(current => !current)}
              className="h-10 rounded-full bg-[#1d5146] px-4 text-sm font-semibold text-white transition hover:bg-[#153c34]"
            >
              {showAllPages ? "Focus a page" : "Show all pages"}
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-[#6f887f]">
          Choose a page to render only what you need. Use Show all pages when
          you want to scan the complete resource.
        </p>
      </div>

      <div className="space-y-4">
        {pagesToRender.map(pageNumber => (
          <article
            key={pageNumber}
            id={`pdf-page-${pageNumber}`}
            className="overflow-hidden rounded-xl bg-white shadow-[0_8px_28px_rgba(29,81,70,0.12)]"
            aria-label={`Page ${pageNumber} of ${totalPages}`}
          >
            <div className="border-b border-[#edf1ee] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#78938a]">
              Page {pageNumber} of {totalPages}
            </div>
            <div className="flex justify-center overflow-x-auto p-2 md:p-4">
              {pdf ? <PdfPageCanvas pdf={pdf} pageNumber={pageNumber} /> : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function PublicDocumentPreview({
  href,
  fileName,
  mimeType,
  title,
}: {
  href: string;
  fileName: string;
  mimeType: string;
  title: string;
}) {
  if (mimeType === "application/pdf" || mimeType.endsWith("+pdf"))
    return <PdfDocumentPreview href={href} title={title} />;
  if (mimeType.startsWith("text/") || mimeType === "application/csv")
    return <TextDocumentPreview href={href} title={title} />;
  const format = officeFormatLabel(mimeType, fileName);
  if (format)
    return (
      <OfficeDocumentPreview
        href={href}
        fallbackHref={href.replace("/office-preview", "/free-view")}
        format={format}
        title={title}
      />
    );
  return (
    <DocumentFallback
      href={href}
      message="This file format is not supported for automatic in-page reading yet. DOCX, XLSX, PPTX, ODT, ODS, ODP, RTF, and EPUB files are supported."
    />
  );
}

function LimitedPaidPreview({
  paperId,
  title,
  priceKes,
}: {
  paperId: number;
  title: string;
  priceKes: number;
}) {
  const [state, setState] = useState<DocumentStatus>("loading");
  const [scope, setScope] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [previewKind, setPreviewKind] = useState<"pdf" | "text">("text");
  const [previewFileUrl, setPreviewFileUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`/api/papers/${paperId}/preview`, { credentials: "include" })
      .then(response => {
        if (!response.ok) throw new Error("The limited preview could not be loaded.");
        return response.json() as Promise<{
          scope?: string;
          excerpt?: string;
          kind?: "pdf" | "text";
          previewFileUrl?: string | null;
        }>;
      })
      .then(result => {
        if (cancelled) return;
        setScope(result.scope ?? "Limited preview");
        setExcerpt(result.excerpt ?? "Preview unavailable.");
        setPreviewKind(result.kind ?? "text");
        setPreviewFileUrl(result.previewFileUrl ?? null);
        setState("ready");
      })
      .catch(previewError => {
        if (cancelled) return;
        setError(previewError instanceof Error ? previewError.message : "Preview unavailable.");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [paperId]);

  return (
    <div className="bg-[#f8fbf9] p-5 md:p-8">
      <div className="rounded-2xl border border-[#e6d49c] bg-[#fff9e8] p-4 text-sm leading-6 text-[#7a5b16]">
        <div className="flex items-start gap-3">
          <LockKeyhole size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">Limited preview — full document protected</p>
            <p className="mt-1">You can inspect an opening excerpt before buying. The complete paper remains locked until checkout is confirmed.</p>
          </div>
        </div>
      </div>
      {state === "loading" && (
        <div className="grid min-h-[260px] place-items-center text-sm text-[#58766b]" role="status">
          <span className="flex items-center gap-3"><Loader2 className="animate-spin" size={18} /> Preparing the limited preview…</span>
        </div>
      )}
      {state === "error" && <p className="mt-6 rounded-2xl bg-white p-5 text-sm text-[#a44e49]">{error}</p>}
      {state === "ready" && (
        <div className="mt-6 rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm md:p-7">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#78938a]">{scope}</p>
          <h2 className="mt-2 font-serif text-2xl font-semibold text-[#173e35]">See what you’ll receive</h2>
          {previewKind === "pdf" && previewFileUrl ? (
            <div className="mt-5 overflow-hidden rounded-2xl border border-[#dfe9e3]">
              <PdfDocumentPreview href={previewFileUrl} title={title} />
            </div>
          ) : (
            <pre className="mt-5 max-h-[360px] overflow-hidden whitespace-pre-wrap font-sans text-sm leading-7 text-[#294d42]">{excerpt}</pre>
          )}
          <div className="mt-6 flex flex-col gap-3 border-t border-[#edf1ee] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-[#274d43]">Unlock {title}</p>
              <p className="mt-1 text-sm text-[#718780]">One secure purchase unlocks the complete resource in your library.</p>
            </div>
            <Link href={`/?paper=${encodeURIComponent(paperId)}#catalogue`} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#1d5146] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#153c34]">
              <ShoppingCart size={16} /> Buy for KES {priceKes.toLocaleString()}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PublicPaperViewer() {
  const [location] = useLocation();
  const { isAuthenticated } = useAuth();
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
  const publicPaper = paper && paper.isAvailable ? paper : null;
  const isPaidPaper = Boolean(publicPaper && !isFreePaper(publicPaper));
  const documentHref = publicPaper && !isPaidPaper
    ? `/api/papers/${publicPaper.legacyId}/free-view`
    : "";
  const officePreviewHref = publicPaper && !isPaidPaper
    ? `/api/papers/${publicPaper.legacyId}/office-preview`
    : "";
  const mimeType = String(publicPaper?.fileMimeType ?? "").toLowerCase();
  const recordPaperView = trpc.analytics.recordPaperView.useMutation();

  useEffect(() => {
    if (!publicPaper?.legacyId) return;
    try {
      const key = "scholarshelf-view-session";
      const sessionId =
        sessionStorage.getItem(key) ??
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(key, sessionId);
      void recordPaperView.mutateAsync({
        paperId: publicPaper.legacyId,
        sessionId,
      });
    } catch {
      // View analytics must never block document reading.
    }
  }, [publicPaper?.legacyId]);

  if (catalogue.isLoading) {
    return (
      <ViewerShell>
        <main className="container grid min-h-[70vh] place-items-center py-16">
          <div
            className="flex items-center gap-3 text-sm text-[#58766b]"
            role="status"
          >
            <Loader2 className="animate-spin" size={18} />
            Loading the free resource…
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
              Resource unavailable
            </p>
            <h1 className="mt-2 font-serif text-3xl font-semibold text-[#173e35]">
              This free resource cannot be viewed right now.
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
                <span>{resourceTypeLabel(publicPaper.documentType)}</span>
                <span className="text-[#bdcfc6]">·</span>
                <span>{publicPaper.course}</span>
              </div>
              <h1 className="mt-3 max-w-4xl break-words font-serif text-3xl font-semibold leading-tight tracking-tight text-[#173e35] md:text-5xl">
                {publicPaper.title}
              </h1>
              <p className="mt-3 text-sm text-[#648078]">
                {publicPaper.unit} · {educationLevelLabel(publicPaper.level)} ·{" "}
                {publicPaper.cycle}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-medium text-[#648078]">
                <span className="inline-flex items-center gap-1.5"><Eye size={14} /> {Number(publicPaper.viewCount ?? 0).toLocaleString()} views</span>
                <span aria-hidden="true">·</span>
                <span>Shared by {publicPaper.contributorName ?? "ScholarShelf contributor"}</span>
              </div>
              {publicPaper.description && (
                <p className="mt-4 max-w-3xl text-sm leading-6 text-[#718780]">
                  {publicPaper.description}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ${isPaidPaper ? "bg-[#fff3d4] text-[#8b6518]" : "bg-[#e5f2eb] text-[#34745f]"}`}>
                {isPaidPaper ? <LockKeyhole size={14} /> : <Eye size={14} />} {isPaidPaper ? `Preview · KES ${Number(publicPaper.priceKes).toLocaleString()}` : "Free access"}
              </span>
              <ShareDocumentButton
                title={publicPaper.title}
                url={new URL(`/paper/${publicPaper.legacyId}`, window.location.origin).toString()}
                compact
              />
              {!isPaidPaper && (
                <a
                  href={documentHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-[#b8d1c5] bg-white px-4 py-2.5 text-sm font-semibold text-[#1d5146] transition hover:bg-[#e8f1ed]"
                >
                  <Download size={15} /> Open separately
                </a>
              )}
            </div>
          </div>

          <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
            <section className="order-2 overflow-hidden rounded-[1.7rem] border border-[#c9ddd4] bg-white shadow-[0_18px_55px_rgba(29,81,70,0.08)] lg:order-1">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4eee9] bg-[#edf6f1] px-4 py-3 text-xs text-[#648078] md:px-6">
              <div className="flex items-center gap-2 font-semibold text-[#1d5146]">
                <FileText size={15} />
                {isPaidPaper ? "Secure document preview" : "Full resource preview"}
              </div>
              <span>{isPaidPaper ? "Opening excerpt only · full paper protected" : "No account required to read this resource."}</span>
            </div>
            {isPaidPaper ? (
              <LimitedPaidPreview
                paperId={publicPaper.legacyId}
                title={publicPaper.title}
                priceKes={Number(publicPaper.priceKes)}
              />
            ) : (
              <PublicDocumentPreview
                href={
                  officeFormatLabel(mimeType, String(publicPaper.fileName ?? ""))
                    ? officePreviewHref
                    : documentHref
                }
                fileName={String(publicPaper.fileName ?? "")}
                mimeType={mimeType}
                title={publicPaper.title}
              />
            )}
            </section>
            {!isPaidPaper && (
              <section className="order-1 lg:order-2 lg:sticky lg:top-24" aria-label="AI study help for this document">
                <GrokStudyAssistant
                  isAuthenticated={isAuthenticated}
                  documentContext={{
                    id: publicPaper.legacyId,
                    title: publicPaper.title,
                    course: publicPaper.course,
                  }}
                />
              </section>
            )}
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#dce7e1] bg-white p-4 text-sm text-[#718780] sm:flex-row sm:items-center sm:justify-between">
            <p>
              {isPaidPaper
                ? "You are viewing a limited excerpt. The full paper remains protected until secure checkout is completed."
                : "This document is publicly readable because it is an active Free-access resource."}
            </p>
            <Link
              href="/#catalogue"
              className="inline-flex shrink-0 items-center gap-2 font-semibold text-[#1d5146] underline underline-offset-4"
            >
              View more resources <ArrowLeft className="rotate-180" size={14} />
            </Link>
          </div>
        </div>
      </main>
    </ViewerShell>
  );
}
