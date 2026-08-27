import {
  ArrowLeft,
  BookOpen,
  Download,
  Eye,
  FileText,
  Loader2,
} from "lucide-react";
import DOMPurify from "dompurify";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { trpc } from "@/lib/trpc";
import { educationLevelLabel } from "@shared/educationLevels";

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
          <Loader2 className="animate-spin" size={18} /> Opening the full paper…
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
      aria-label={`Full paper text: ${title}`}
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
    setStatus("loading");
    setError("");

    const renderPage = async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        await new Promise<void>(resolve =>
          requestAnimationFrame(() => resolve())
        );
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
        await page.render({
          canvas,
          canvasContext: context,
          viewport: displayViewport,
          transform:
            pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : undefined,
        }).promise;
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
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;
    let documentProxy: any = null;
    setStatus("loading");
    setPageCount(null);
    setPdf(null);
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

  if (status === "loading")
    return (
      <div
        className="grid min-h-[420px] place-items-center bg-[#fbfcfb] text-sm text-[#58766b]"
        role="status"
      >
        <span className="flex items-center gap-3">
          <Loader2 className="animate-spin" size={18} /> Opening every page…
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

  return (
    <div
      className="space-y-4 bg-[#edf2ef] p-3 md:p-5"
      aria-label={`Full paper: ${title}`}
    >
      {Array.from({ length: pageCount ?? 0 }, (_, index) => (
        <article
          key={index + 1}
          className="overflow-hidden rounded-xl bg-white shadow-[0_8px_28px_rgba(29,81,70,0.12)]"
          aria-label={`Page ${index + 1} of ${pageCount ?? 0}`}
        >
          <div className="border-b border-[#edf1ee] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#78938a]">
            Page {index + 1}
          </div>
          <div className="flex justify-center overflow-x-auto p-2 md:p-4">
            {pdf ? <PdfPageCanvas pdf={pdf} pageNumber={index + 1} /> : null}
          </div>
        </article>
      ))}
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
  const officePreviewHref = publicPaper
    ? `/api/papers/${publicPaper.legacyId}/office-preview`
    : "";
  const mimeType = String(publicPaper?.fileMimeType ?? "").toLowerCase();

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
                <span>{publicPaper.course}</span>
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
                <Download size={15} /> Open separately
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
