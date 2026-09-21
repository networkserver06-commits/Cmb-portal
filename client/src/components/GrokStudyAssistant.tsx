import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BookOpen, Check, Clipboard, FileUp, Loader2, Send, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function GrokStudyAssistant({
  isAuthenticated = true,
  compact = false,
  documentContext,
}: {
  isAuthenticated?: boolean;
  compact?: boolean;
  documentContext?: { id: number; title: string; course?: string };
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
  const documents = useMemo(
    () => {
      const unlocked = (library.data ?? [])
        .filter(item => item.paper)
        .map(item => item.paper!);
      if (!documentContext || unlocked.some(paper => paper.legacyId === documentContext.id))
        return unlocked;
      return [
        {
          legacyId: documentContext.id,
          title: documentContext.title,
          course: documentContext.course ?? "Current document",
        } as (typeof unlocked)[number],
        ...unlocked,
      ];
    },
    [documentContext, library.data]
  );

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
    const textLike = file.type.startsWith("text/") || /\.(txt|md|csv|json|html?)$/i.test(file.name);
    if (!textLike) {
      setError("For an uploaded reference, choose a TXT, MD, CSV, JSON, or HTML file. For PDF/DOCX, select the document above instead.");
      return;
    }
    if (file.size > 120_000) {
      setError("Keep the reference file under 120 KB, or paste only the passage you want to study.");
      return;
    }
    setReferenceText((await file.text()).slice(0, 16000));
    setReferenceFile(file.name);
    setError("");
  };

  const copyAnswer = async () => {
    if (!answer) return;
    try {
      await navigator.clipboard.writeText(answer);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Copy is unavailable in this browser. Select the answer text manually.");
    }
  };

  return (
    <section className={`study-assistant rounded-3xl border border-[#c8ddd3] bg-[#f5fbf7] shadow-sm ${compact ? "p-4" : "p-5 sm:p-7"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6b8f83]">
            <Sparkles size={14} /> ScholarShelf Assistant
          </div>
          <h2 className={`${compact ? "text-xl" : "text-2xl"} mt-2 font-serif font-semibold text-[#173e35]`}>
            {documentContext ? "Study this document with ScholarShelf Assistant." : "Ask, learn, and revise with ScholarShelf Assistant."}
          </h2>
          {documentContext && (
            <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-[#c8ddd3] bg-white px-3 py-1.5 text-xs font-semibold text-[#1d5146]">
              <BookOpen size={13} /> <span className="truncate">{documentContext.title}</span>
            </div>
          )}
          <p className={`${compact ? "hidden" : ""} mt-2 max-w-2xl text-sm leading-6 text-[#648078]`}>
            Get explanations, ask questions about an unlocked document, or create a structured revision summary. This is free for students with 100 requests each day.
          </p>
        </div>
        <div className={`${compact ? "hidden" : ""} rounded-2xl border border-[#c8ddd3] bg-white px-4 py-3 text-right text-xs text-[#5f786f]`}>
          <div className="font-semibold text-[#1d5146]">
            {usage.data?.remainingCredits ?? "—"} / {usage.data?.dailyLimit ?? 100} requests left
          </div>
          <div className="mt-1">
            {usage.data?.provider === "groq" ? "Groq" : "xAI"} · resets daily at 00:00 UTC
          </div>
        </div>
      </div>

      {!isAuthenticated ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-[#d8e8df] bg-white/80 p-4 text-sm text-[#5f786f]">
          <span>Sign in to use ScholarShelf Assistant for questions, explanations, and document summaries.</span>
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
              This page is attached to the document above. Ask questions or create a focused revision summary.
            </span>
          )}
        </label>

        {documentContext && (
          <div className="grid gap-2 text-sm font-semibold text-[#274d43]">
            <label htmlFor="assistant-focus">Page or section (optional)</label>
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
          <div className="flex flex-wrap gap-2" aria-label="Quick document questions">
            {[
              ["Explain simply", "Explain the selected document in simple student-friendly terms."],
              ["Key points", "List the most important points from the selected document for revision."],
              ["Definitions", "Extract and explain the important definitions and terms from the selected document."],
              ["Exam questions", "Create five likely exam questions with short answers from the selected document."],
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

        <div className="grid gap-2 rounded-2xl border border-[#c8d9d2] bg-white/70 p-3">
          <label htmlFor="assistant-reference" className="text-sm font-semibold text-[#274d43]">
            Add text or upload a reference (optional)
          </label>
          <textarea
            id="assistant-reference"
            value={referenceText}
            onChange={event => setReferenceText(event.target.value.slice(0, 16000))}
            rows={3}
            placeholder="Paste a paragraph, page, or your lecturer's notes here…"
            className="rounded-xl border border-[#c8d9d2] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#4b8876] focus:ring-2 focus:ring-[#4b8876]/25"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#c8d9d2] px-3 py-1.5 text-xs font-semibold text-[#34745f] hover:bg-[#eaf5ef]">
              <FileUp size={14} /> Upload text file
              <input
                type="file"
                accept=".txt,.md,.csv,.json,.html,.htm,text/*"
                className="sr-only"
                onChange={event => void readReferenceFile(event.target.files?.[0])}
              />
            </label>
            {referenceFile && <span className="text-xs text-[#648078]">Loaded: {referenceFile}</span>}
            <span className="text-xs text-[#718780]">TXT, MD, CSV, JSON, or HTML · up to 120 KB</span>
          </div>
        </div>

        <label className="grid gap-2 text-sm font-semibold text-[#274d43]">
          {mode === "summarize" ? "Summary instructions (optional)" : "Your question"}
          <textarea
            value={prompt}
            onChange={event => setPrompt(event.target.value)}
            required={mode === "ask"}
            maxLength={6000}
            rows={compact ? 3 : 4}
            placeholder={
              mode === "summarize"
                ? "Focus on exam points, definitions, or revision questions…"
                : "Explain this topic in simple terms, or ask a question about your document…"
            }
            className="rounded-2xl border border-[#c8d9d2] bg-white px-3 py-3 font-normal outline-none focus:border-[#4b8876] focus:ring-2 focus:ring-[#4b8876]/25"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={ask.isPending || usage.data?.remainingCredits === 0 || (mode === "summarize" && !paperId)}
            className="rounded-full bg-[#1d5146] hover:bg-[#153c34]"
          >
            {ask.isPending ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {ask.isPending ? "ScholarShelf Assistant is thinking…" : mode === "summarize" ? "Create summary" : "Ask Assistant"}
          </Button>
          <span className="text-xs text-[#718780]">One request uses one daily credit.</span>
        </div>
      </form>
      )}

      {error && (
        <div className="mt-5 flex gap-2 rounded-2xl border border-[#efc8c5] bg-[#fff4f3] p-4 text-sm text-[#a44e49]" role="alert">
          <AlertCircle className="mt-0.5 shrink-0" size={17} />
          <span>{error}</span>
        </div>
      )}
      {answer && (
        <article className="mt-5 whitespace-pre-wrap rounded-2xl border border-[#c8ddd3] bg-white p-5 text-sm leading-7 text-[#294d42]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold uppercase tracking-[0.15em] text-[#2d7965]">
            <span className="inline-flex items-center gap-2"><Sparkles size={14} /> ScholarShelf Assistant · {answerProvider === "groq" ? "Groq" : "xAI"}</span>
            <button type="button" onClick={copyAnswer} className="inline-flex items-center gap-1 rounded-full border border-[#c8d9d2] px-2.5 py-1 text-[10px] tracking-normal normal-case text-[#34745f] hover:bg-[#eaf5ef]">
              {copied ? <Check size={13} /> : <Clipboard size={13} />} {copied ? "Copied" : "Copy answer"}
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
              ["Explain a passage", "Explain this quoted passage in simple terms: "],
              ["Make flashcards", "Create revision flashcards from the document: "],
              ["More exam practice", "Create more exam questions and short answers from the document: "],
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
