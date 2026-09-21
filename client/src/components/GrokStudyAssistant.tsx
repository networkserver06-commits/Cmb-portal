import { useMemo, useState } from "react";
import { AlertCircle, BookOpen, Loader2, Send, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function GrokStudyAssistant({
  isAuthenticated = true,
}: {
  isAuthenticated?: boolean;
}) {
  const [mode, setMode] = useState<"ask" | "summarize">("ask");
  const [paperId, setPaperId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
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
      setError("");
      void usage.refetch();
    },
    onError: mutationError => {
      setAnswer("");
      setError(mutationError.message);
      void usage.refetch();
    },
  });
  const documents = useMemo(
    () =>
      (library.data ?? []).filter(item => item.paper).map(item => item.paper!),
    [library.data]
  );

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
    <section className="rounded-3xl border border-[#c8ddd3] bg-[#f5fbf7] p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6b8f83]">
            <Sparkles size={14} /> Grok study assistant
          </div>
          <h2 className="mt-2 font-serif text-2xl font-semibold text-[#173e35]">
            Ask, learn, and revise with help from Grok.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#648078]">
            Get explanations, ask questions about an unlocked document, or create a structured revision summary. This is free for students with 100 requests each day.
          </p>
        </div>
        <div className="rounded-2xl border border-[#c8ddd3] bg-white px-4 py-3 text-right text-xs text-[#5f786f]">
          <div className="font-semibold text-[#1d5146]">
            {usage.data?.remainingCredits ?? "—"} / {usage.data?.dailyLimit ?? 100} requests left
          </div>
          <div className="mt-1">
            {usage.data?.provider === "groq" ? "Groq" : "xAI Grok"} · resets daily at 00:00 UTC
          </div>
        </div>
      </div>

      {!isAuthenticated ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-[#d8e8df] bg-white/80 p-4 text-sm text-[#5f786f]">
          <span>Sign in to use Grok for questions, explanations, and document summaries.</span>
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-full bg-[#1d5146] px-4 font-semibold text-white transition hover:bg-[#153c34]"
          >
            Sign in to use Grok
          </Link>
        </div>
      ) : (
      <form className="mt-6 grid gap-4" onSubmit={submit}>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={mode === "ask" ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setMode("ask")}
          >
            <Send size={15} /> Ask Grok
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
        </label>

        <label className="grid gap-2 text-sm font-semibold text-[#274d43]">
          {mode === "summarize" ? "Summary instructions (optional)" : "Your question"}
          <textarea
            value={prompt}
            onChange={event => setPrompt(event.target.value)}
            required={mode === "ask"}
            maxLength={6000}
            rows={4}
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
            {ask.isPending ? "Grok is thinking…" : mode === "summarize" ? "Create summary" : "Ask Grok"}
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
            <Sparkles size={14} /> Grok answer
          </div>
          {answer}
        </article>
      )}
    </section>
  );
}
