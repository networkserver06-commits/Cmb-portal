import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BookOpen, Loader2, Send, Sparkles } from "lucide-react";
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
    ask.mutate({
      mode,
      paperId: paperId ? Number(paperId) : undefined,
      prompt,
    });
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
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-[#2d7965]">
            <Sparkles size={14} /> ScholarShelf Assistant · {answerProvider === "groq" ? "Groq" : "xAI"}
          </div>
          {answer}
        </article>
      )}
    </section>
  );
}
