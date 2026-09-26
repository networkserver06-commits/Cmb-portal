import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Check,
  Clipboard,
  FileUp,
  Loader2,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function GrokStudyAssistant({
  isAuthenticated = true,
  compact = false,
  documentContext,
  onClose,
}: {
  isAuthenticated?: boolean;
  compact?: boolean;
  documentContext?: { id: number; title: string; course?: string };
  onClose?: () => void;
}) {
  const [mode, setMode] = useState<"ask" | "summarize">("ask");
  const [paperId, setPaperId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [focus, setFocus] = useState("");
  const [copied, setCopied] = useState(false);
  const [referenceText, setReferenceText] = useState("");
  const [referenceFile, setReferenceFile] = useState("");
  const [lastRequest, setLastRequest] = useState<{
    mode: "ask" | "summarize";
    paperId?: number;
    prompt: string;
    referenceText?: string;
  }>();
  const [answer, setAnswer] = useState("");
  const [answerProvider, setAnswerProvider] = useState<"xai" | "groq" | "">("");
  const [error, setError] = useState("");
  const usage = trpc.student.grokUsage.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const library = trpc.student.library.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const ask = trpc.student.grokAsk.useMutation({
    onSuccess: result => {
      setAnswer(result.answer);
      setAnswerProvider(result.provider);
      setError("");
      void usage.refetch();
    },
    onError: mutationError => {
      setAnswer("");
      setAnswerProvider("");
      setError(mutationError.message);
      void usage.refetch();
    },
  });
  const documents = useMemo(() => {
    const unlocked = (library.data ?? [])
      .filter(item => item.paper)
      .map(item => item.paper!);
    if (
      !documentContext ||
      unlocked.some(paper => paper.legacyId === documentContext.id)
    )
      return unlocked;
    return [
      {
        legacyId: documentContext.id,
        title: documentContext.title,
        course: documentContext.course ?? "Current document",
      } as (typeof unlocked)[number],
      ...unlocked,
    ];
  }, [documentContext, library.data]);

  useEffect(() => {
    if (documentContext) setPaperId(String(documentContext.id));
  }, [documentContext]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAuthenticated) return;
    setError("");
    setAnswer("");
    const focusedPrompt = focus.trim()
      ? `Focus on page or section ${focus.trim()} of the document. ${prompt.trim()}`
      : prompt.trim();
    const request = {
      mode,
      paperId: paperId ? Number(paperId) : undefined,
      prompt: focusedPrompt,
      referenceText: referenceText.trim() || undefined,
    };
    setLastRequest(request);
    ask.mutate(request);
  };

  const askQuickly = (question: string) => {
    setMode("ask");
    setPrompt(question);
  };

  const readReferenceFile = async (file?: File) => {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isDocx =
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      /\.docx$/i.test(file.name);
    const textLike =
      file.type.startsWith("text/") ||
      /\.(txt|md|csv|json|html?)$/i.test(file.name);
    if (!textLike && !isPdf && !isDocx) {
      setError("Upload a PDF, DOCX, TXT, MD, CSV, JSON, or HTML document.");
      return;
    }
    if (file.size > 12_000_000) {
      setError(
        "Keep an uploaded document under 12 MB so it can be prepared safely in your browser."
      );
      return;
    }
    try {
      let extracted = "";
      if (isPdf) {
        const pdfjsLib = await import("pdfjs-dist");
        const pdfjsWorker = await import(
          "pdfjs-dist/build/pdf.worker.min.mjs?url"
        );
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;
        const pdf = await pdfjsLib.getDocument({
          data: await file.arrayBuffer(),
        }).promise;
        const pages = Math.min(pdf.numPages, 30);
        for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const content = await page.getTextContent();
          extracted += `\n\nPage ${pageNumber}\n${content.items.map(item => ("str" in item ? item.str : "")).join(" ")}`;
          if (extracted.length >= 16_000) break;
        }
      } else if (isDocx) {
        const mammoth = await import("mammoth");
        const result = await mammoth.default.extractRawText({
          arrayBuffer: await file.arrayBuffer(),
        });
        extracted = result.value;
      } else {
        extracted = await file.text();
      }
      const trimmed = extracted.trim().slice(0, 16_000);
      if (!trimmed)
        throw new Error("No readable text was found in this document.");
      setReferenceText(trimmed);
      setReferenceFile(file.name);
      setError("");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "This document could not be read in the browser."
      );
    }
  };

  const copyAnswer = async () => {
    if (!answer) return;
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError(
        "Copy is unavailable in this browser. Select the answer text manually."
      );
    }
  };

  return (
    <section
      className={`study-assistant rounded-3xl border border-[#c8ddd3] bg-[#f5fbf7] shadow-sm ${compact ? "p-4" : "p-5 sm:p-7"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6b8f83]">
            <Sparkles size={14} /> ScholarShelf Assistant
          </div>
          <h2
            className={`${compact ? "text-xl" : "text-2xl"} mt-2 font-serif font-semibold text-[#173e35]`}
          >
            {documentContext
              ? "Study this document with ScholarShelf Assistant."
              : "Ask, learn, and revise with ScholarShelf Assistant."}
          </h2>
          {documentContext && (
            <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-[#c8ddd3] bg-white px-3 py-1.5 text-xs font-semibold text-[#1d5146]">
              <BookOpen size={13} />{" "}
              <span className="truncate">{documentContext.title}</span>
            </div>
          )}
          <p
            className={`${compact ? "hidden" : ""} mt-2 max-w-2xl text-sm leading-6 text-[#648078]`}
          >
            Get explanations, ask questions about an unlocked document, or
            create a structured revision summary. This is free for students with
            100 requests each day.
          </p>
        </div>
        <div className="flex items-start gap-2">
          <div
            className={`${compact ? "hidden" : ""} rounded-2xl border border-[#c8ddd3] bg-white px-4 py-3 text-right text-xs text-[#5f786f]`}
          >
            <div className="font-semibold text-[#1d5146]">
              {usage.data?.remainingCredits ?? "—"} /{" "}
              {usage.data?.dailyLimit ?? 100} requests left
            </div>
            <div className="mt-1">
              {usage.data?.provider === "groq" ? "Groq" : "xAI"} · resets daily
              at 00:00 UTC
            </div>
          </div>
          {compact && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#c8d9d2] bg-white text-[#5f786f] transition hover:border-[#4b8876] hover:bg-[#eaf5ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4b8876]"
              aria-label="Close quick AI assistant"
              title="Close quick AI assistant"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {!isAuthenticated ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-[#d8e8df] bg-white/80 p-4 text-sm text-[#5f786f]">
          <span>
            Sign in to use ScholarShelf Assistant for questions, explanations,
            and document summaries.
          </span>
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-full bg-[#1d5146] px-4 font-semibold text-white transition hover:bg-[#153c34]"
          >
            Sign in to use ScholarShelf Assistant
          </Link>
        </div>
      ) : (
        <form className="mt-5 grid gap-3" onSubmit={submit}>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={mode === "ask" ? "default" : "outline"}
              className="rounded-full"
              onClick={() => setMode("ask")}
            >
              <Send size={15} /> Ask Assistant
            </Button>
            <Button
              type="button"
              variant={mode === "summarize" ? "default" : "outline"}
              className="rounded-full"
              onClick={() => setMode("summarize")}
            >
              <BookOpen size={15} /> Summarise a document
            </Button>
          </div>

          <div className="grid gap-2" aria-label="Study starter prompts">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#789087]">
              Start with a study move
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                [
                  "Explain simply",
                  "Explain this topic in simple terms and include one practical example.",
                ],
                [
                  "Make a study plan",
                  "Create a focused seven-day study plan for this topic with daily goals.",
                ],
                [
                  "Make flashcards",
                  "Create concise revision flashcards with questions and answers.",
                ],
                [
                  "Exam practice",
                  "Create five likely exam questions and give short model answers.",
                ],
              ].map(([label, question]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => askQuickly(question)}
                  className="rounded-full border border-[#c8d9d2] bg-white px-3 py-1.5 text-xs font-semibold text-[#34745f] transition hover:border-[#4b8876] hover:bg-[#eaf5ef]"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <label className="grid gap-2 text-sm font-semibold text-[#274d43]">
            Study document (optional for questions)
            <select
              value={paperId}
              onChange={event => setPaperId(event.target.value)}
              className="h-11 rounded-xl border border-[#c8d9d2] bg-white px-3 font-normal outline-none focus:border-[#4b8876] focus:ring-2 focus:ring-[#4b8876]/25"
            >
              <option value="">General study help</option>
              {documents.map(paper => (
                <option key={paper.legacyId} value={paper.legacyId}>
                  {paper.title} · {paper.course}
                </option>
              ))}
            </select>
            {mode === "summarize" && documents.length === 0 && (
              <span className="font-normal text-[#8a6b2c]">
                Unlock a document first to create its summary.
              </span>
            )}
            {documentContext && paperId === String(documentContext.id) && (
              <span className="font-normal text-[#2d7965]">
                This page is attached to the document above. Ask questions or
                create a focused revision summary.
              </span>
            )}
          </label>

          {documentContext && (
            <div className="grid gap-2 text-sm font-semibold text-[#274d43]">
              <label htmlFor="assistant-focus">
                Page or section (optional)
              </label>
              <input
                id="assistant-focus"
                value={focus}
                onChange={event => setFocus(event.target.value)}
                placeholder="e.g. Page 4, Kiswahili ni nini, or Introduction"
                className="h-11 rounded-xl border border-[#c8d9d2] bg-white px-3 font-normal outline-none focus:border-[#4b8876] focus:ring-2 focus:ring-[#4b8876]/25"
              />
            </div>
          )}

          {mode === "ask" && documentContext && (
            <div
              className="flex flex-wrap gap-2"
              aria-label="Quick document questions"
            >
              {[
                [
                  "Explain simply",
                  "Explain the selected document in simple student-friendly terms.",
                ],
                [
                  "Key points",
                  "List the most important points from the selected document for revision.",
                ],
                [
                  "Definitions",
                  "Extract and explain the important definitions and terms from the selected document.",
                ],
                [
                  "Exam questions",
                  "Create five likely exam questions with short answers from the selected document.",
                ],
              ].map(([label, question]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => askQuickly(question)}
                  className="rounded-full border border-[#c8d9d2] bg-white px-3 py-1.5 text-xs font-semibold text-[#34745f] transition hover:border-[#4b8876] hover:bg-[#eaf5ef]"
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <label className="grid gap-2 text-sm font-semibold text-[#274d43]">
            {mode === "summarize"
              ? "Summary instructions (optional)"
              : "Your prompt"}
            <textarea
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              required={mode === "ask"}
              maxLength={6000}
              rows={compact ? 3 : 4}
              placeholder={
                mode === "summarize"
                  ? "Focus on exam points, definitions, or revision questions…"
                  : "Ask anything, paste notes, or tell me what you want to learn…"
              }
              className="min-h-28 rounded-2xl border border-[#c8d9d2] bg-white px-3 py-3 font-normal outline-none focus:border-[#4b8876] focus:ring-2 focus:ring-[#4b8876]/25"
            />
            <span className="text-xs font-normal text-[#718780]">
              Paste a passage here or attach a document below. The Assistant
              will use both as context.
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#c8d9d2] px-3 py-1.5 text-xs font-semibold text-[#34745f] hover:bg-[#eaf5ef]">
                <FileUp size={14} /> Attach document
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md,.csv,.json,.html,.htm,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*"
                  className="sr-only"
                  onChange={event =>
                    void readReferenceFile(event.target.files?.[0])
                  }
                />
              </label>
              {referenceFile && (
                <span className="rounded-full bg-[#e5f2eb] px-3 py-1.5 text-xs font-semibold text-[#34745f]">
                  Attached: {referenceFile}
                </span>
              )}
              <span className="text-xs font-normal text-[#718780]">
                PDF, Word, TXT, MD, CSV, JSON, HTML · up to 12 MB
              </span>
            </div>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              disabled={
                ask.isPending ||
                usage.data?.remainingCredits === 0 ||
                (mode === "summarize" && !paperId)
              }
              className="rounded-full bg-[#1d5146] hover:bg-[#153c34]"
            >
              {ask.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Sparkles size={16} />
              )}
              {ask.isPending
                ? "ScholarShelf Assistant is thinking…"
                : mode === "summarize"
                  ? "Create summary"
                  : "Ask Assistant"}
            </Button>
            <span className="text-xs text-[#718780]">
              One request uses one daily credit.
            </span>
          </div>
        </form>
      )}

      {error && (
        <div
          className="mt-5 flex gap-2 rounded-2xl border border-[#efc8c5] bg-[#fff4f3] p-4 text-sm text-[#a44e49]"
          role="alert"
        >
          <AlertCircle className="mt-0.5 shrink-0" size={17} />
          <span>{error}</span>
        </div>
      )}
      {answer && (
        <article className="mt-5 whitespace-pre-wrap rounded-2xl border border-[#c8ddd3] bg-white p-5 text-sm leading-7 text-[#294d42]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold uppercase tracking-[0.15em] text-[#2d7965]">
            <span className="inline-flex items-center gap-2">
              <Sparkles size={14} /> ScholarShelf Assistant ·{" "}
              {answerProvider === "groq" ? "Groq" : "xAI"}
            </span>
            <button
              type="button"
              onClick={copyAnswer}
              className="inline-flex items-center gap-1 rounded-full border border-[#c8d9d2] px-2.5 py-1 text-[10px] tracking-normal normal-case text-[#34745f] hover:bg-[#eaf5ef]"
            >
              {copied ? <Check size={13} /> : <Clipboard size={13} />}{" "}
              {copied ? "Copied" : "Copy answer"}
            </button>
          </div>
          {answer}
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#e5eee9] pt-4">
            <button
              type="button"
              disabled={ask.isPending || !lastRequest}
              onClick={() => lastRequest && ask.mutate(lastRequest)}
              className="rounded-full bg-[#1d5146] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#153c34] disabled:opacity-50"
            >
              {ask.isPending ? "Trying again…" : "Ask again"}
            </button>
            {[
              [
                "Explain a passage",
                "Explain this quoted passage in simple terms: ",
              ],
              [
                "Make flashcards",
                "Create revision flashcards from the document: ",
              ],
              [
                "More exam practice",
                "Create more exam questions and short answers from the document: ",
              ],
            ].map(([label, prefix]) => (
              <button
                key={label}
                type="button"
                onClick={() => askQuickly(prefix)}
                className="rounded-full border border-[#c8d9d2] px-3 py-1.5 text-xs font-semibold text-[#34745f] hover:bg-[#eaf5ef]"
              >
                {label}
              </button>
            ))}
          </div>
        </article>
      )}
    </section>
  );
}
