import { Link } from "wouter";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  FileText,
  Lightbulb,
  ListChecks,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import GrokStudyAssistant from "@/components/GrokStudyAssistant";
import { Button } from "@/components/ui/button";

const capabilities = [
  {
    icon: MessageCircle,
    title: "Ask anything",
    description:
      "Get clear explanations, examples, and step-by-step help for difficult topics.",
  },
  {
    icon: FileText,
    title: "Study your documents",
    description:
      "Ask questions about resources you have unlocked in your ScholarShelf library.",
  },
  {
    icon: Target,
    title: "Revise with focus",
    description:
      "Create structured summaries with key concepts, definitions, exam points, and revision questions.",
  },
];

const weeklySessions = [
  {
    day: "Monday",
    short: "Mon",
    focus: "Build the foundation",
    task: "Review one core topic and write five key ideas.",
  },
  {
    day: "Tuesday",
    short: "Tue",
    focus: "Ask better questions",
    task: "Ask the Assistant to explain one difficult concept simply.",
  },
  {
    day: "Wednesday",
    short: "Wed",
    focus: "Work with your notes",
    task: "Attach a reference passage and turn it into a clear summary.",
  },
  {
    day: "Thursday",
    short: "Thu",
    focus: "Active recall",
    task: "Create flashcards or five exam questions from your document.",
  },
  {
    day: "Friday",
    short: "Fri",
    focus: "Find the gaps",
    task: "List what you still do not understand and resolve one gap.",
  },
  {
    day: "Saturday",
    short: "Sat",
    focus: "Practice",
    task: "Complete a focused practice session and check your answers.",
  },
  {
    day: "Sunday",
    short: "Sun",
    focus: "Reflect and plan",
    task: "Review your week and choose next week's priority.",
  },
];

function getWeekKey() {
  const monday = new Date();
  const day = monday.getDay() || 7;
  monday.setDate(monday.getDate() - day + 1);
  return monday.toISOString().slice(0, 10);
}

function WeeklyStudyPlan() {
  const weekKey = getWeekKey();
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const today = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
    new Date()
  );

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(
        `scholarshelf-study-week-${weekKey}`
      );
      if (saved) setCompleted(JSON.parse(saved) as Record<string, boolean>);
    } catch {
      // The planner still works for the current session if storage is blocked.
    }
  }, [weekKey]);

  const completedCount = weeklySessions.filter(
    session => completed[session.day]
  ).length;
  const progress = Math.round((completedCount / weeklySessions.length) * 100);
  const toggleSession = (day: string) => {
    const next = { ...completed, [day]: !completed[day] };
    setCompleted(next);
    try {
      window.localStorage.setItem(
        `scholarshelf-study-week-${weekKey}`,
        JSON.stringify(next)
      );
    } catch {
      // Ignore storage restrictions.
    }
  };
  const resetPlan = () => {
    setCompleted({});
    try {
      window.localStorage.removeItem(`scholarshelf-study-week-${weekKey}`);
    } catch {
      // Ignore storage restrictions.
    }
  };

  return (
    <section
      className="container py-12 md:py-16"
      aria-labelledby="weekly-plan-heading"
    >
      <div className="rounded-[2rem] border border-[#c8ddd3] bg-[#f5fbf7] p-5 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#2d7965]">
              <CalendarDays size={15} /> Your weekly study rhythm
            </div>
            <h2
              id="weekly-plan-heading"
              className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[#173e35] md:text-4xl"
            >
              A calmer plan for making progress.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#648078]">
              Small, focused sessions beat last-minute cramming. Tick off one
              guided session each day and use the Assistant when you get stuck.
            </p>
          </div>
          <div className="min-w-[170px] rounded-2xl border border-[#c8ddd3] bg-white p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-[#5f786f]">
              <span>This week</span>
              <span className="text-[#1d604f]">{progress}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e1eee7]">
              <div
                className="h-full rounded-full bg-[#2d8069] transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[#718780]">
              {completedCount} of {weeklySessions.length} sessions complete
            </p>
          </div>
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {weeklySessions.map(session => {
            const isComplete = Boolean(completed[session.day]);
            const isToday = session.day === today;
            return (
              <button
                key={session.day}
                type="button"
                onClick={() => toggleSession(session.day)}
                aria-pressed={isComplete}
                className={`group min-h-[174px] rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2d8069] ${isComplete ? "border-[#79b99d] bg-[#e5f3eb]" : isToday ? "border-[#b88327] bg-white shadow-sm" : "border-[#d6e5de] bg-white"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-xs font-bold uppercase tracking-[0.16em] ${isToday ? "text-[#9a721c]" : "text-[#78938a]"}`}
                  >
                    {session.short}
                  </span>
                  <span
                    className={`grid h-6 w-6 place-items-center rounded-full ${isComplete ? "bg-[#2d8069] text-white" : "border border-[#c8d9d2] text-transparent group-hover:text-[#2d8069]"}`}
                  >
                    <CheckCircle2 size={15} />
                  </span>
                </div>
                <h3 className="mt-5 font-serif text-lg font-semibold text-[#173e35]">
                  {session.focus}
                </h3>
                <p className="mt-2 text-xs leading-5 text-[#718780]">
                  {session.task}
                </p>
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#dbe9e1] pt-4 text-sm">
          <span className="inline-flex items-center gap-2 text-[#5f786f]">
            <ListChecks size={16} className="text-[#2d8069]" /> Your plan is
            saved on this device.
          </span>
          <button
            type="button"
            onClick={resetPlan}
            className="rounded-full border border-[#c8d9d2] px-3 py-1.5 text-xs font-semibold text-[#34745f] transition hover:bg-[#eaf5ef]"
          >
            Reset week
          </button>
        </div>
      </div>
    </section>
  );
}

export default function AI() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="min-h-screen bg-[#f7f8f6] text-[#19312c]">
      <header className="sticky top-0 z-30 border-b border-[#dce6e1] bg-white/95 shadow-[0_1px_0_rgba(29,81,70,0.03)] backdrop-blur-xl">
        <div className="container flex h-[76px] items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-3">
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
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium md:flex">
            <Link
              href="/"
              className="text-[#547068] transition hover:text-[#153c34]"
            >
              Catalogue
            </Link>
            <Link href="/ai" className="font-semibold text-[#153c34]">
              AI study desk
            </Link>
            <Link
              href="/#how-it-works"
              className="text-[#547068] transition hover:text-[#153c34]"
            >
              How it works
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Link
                href={user?.role === "admin" ? "/admin" : "/account"}
                className="inline-flex h-10 items-center rounded-full border border-[#c8d9d2] px-4 text-sm font-medium text-[#1d5146] transition hover:bg-[#e8f1ed]"
              >
                My dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden rounded-full px-3 py-2 text-sm font-medium text-[#1d5146] hover:bg-[#e8f1ed] sm:inline-flex"
                >
                  Sign in
                </Link>
                <Link
                  href="/create-account"
                  className="inline-flex h-10 items-center rounded-full bg-[#1d5146] px-4 text-sm font-medium text-white hover:bg-[#153c34]"
                >
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-[#dce6e1] bg-[#edf4f0]">
          <div className="absolute -left-28 -top-28 h-80 w-80 rounded-full bg-[#dbece3] blur-3xl" />
          <div className="absolute -bottom-40 right-0 h-96 w-96 rounded-full bg-[#f3e7c6] blur-3xl" />
          <div className="container relative grid gap-10 py-14 md:grid-cols-[1.1fr_.9fr] md:items-center md:py-20">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#c8ddd3] bg-white/75 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#2d7965]">
                <Sparkles size={14} /> Your AI study desk
              </div>
              <h1 className="mt-6 max-w-3xl font-serif text-5xl font-semibold leading-[1.04] tracking-[-0.045em] text-[#153c34] md:text-7xl">
                Turn questions into
                <br />
                <span className="text-[#b88327]">confidence.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[#5c766e]">
                A focused space for explanations, document-aware questions, and
                revision summaries—built to help you understand the work, not
                just find an answer.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#assistant">
                  <Button
                    size="lg"
                    className="rounded-full bg-[#1d5146] px-6 hover:bg-[#153c34]"
                  >
                    Start studying <ArrowRight size={17} />
                  </Button>
                </a>
                <Link
                  href="/account"
                  className="inline-flex h-11 items-center rounded-full border border-[#bcd2c8] px-6 text-sm font-semibold text-[#1d5146] transition hover:bg-white"
                >
                  Open my library
                </Link>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#668078]">
                <span className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-[#2f806a]" /> Private
                  account access
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-[#2f806a]" /> 100
                  requests each day
                </span>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-[440px]">
              <div className="absolute -inset-3 rounded-[2rem] border border-[#c7ded4]" />
              <div className="relative overflow-hidden rounded-[1.7rem] bg-[#183f37] p-7 text-[#f1f7f3] shadow-2xl shadow-[#1b5145]/20">
                <div className="flex items-center justify-between text-xs text-[#aac8bd]">
                  <span>STUDY SESSION</span>
                  <span className="rounded-full bg-white/10 px-2.5 py-1">
                    AI powered
                  </span>
                </div>
                <div className="mt-10 flex items-center gap-4">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#e1c16d] text-[#193b34]">
                    <BrainCircuit size={27} />
                  </div>
                  <div>
                    <div className="font-serif text-2xl">
                      Ready when you are.
                    </div>
                    <div className="mt-1 text-sm text-[#b2cec2]">
                      Ask a question. Build understanding.
                    </div>
                  </div>
                </div>
                <div className="mt-10 space-y-3">
                  <div className="rounded-2xl bg-white/10 p-4 text-sm text-[#dcece5]">
                    Explain this topic in simple terms…
                  </div>
                  <div className="ml-10 rounded-2xl bg-[#e1c16d] p-4 text-sm font-medium text-[#193b34]">
                    Let’s break it down step by step.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          className="container py-12 md:py-16"
          aria-labelledby="capabilities-heading"
        >
          <div className="max-w-2xl">
            <p className="section-eyebrow">One desk, three ways to learn</p>
            <h2
              id="capabilities-heading"
              className="mt-2 font-serif text-4xl font-semibold tracking-tight text-[#173e35]"
            >
              Make every study session count.
            </h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {capabilities.map(({ icon: Icon, title, description }) => (
              <article
                key={title}
                className="rounded-3xl border border-[#d6e5de] bg-white p-6 shadow-sm"
              >
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e5f1eb] text-[#1d6a57]">
                  <Icon size={21} />
                </div>
                <h3 className="mt-5 font-serif text-2xl font-semibold text-[#173e35]">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#6a8179]">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <WeeklyStudyPlan />

        <section
          id="assistant"
          className="border-y border-[#dce6e1] bg-white py-12 md:py-16"
          aria-labelledby="assistant-heading"
        >
          <div className="container">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="section-eyebrow">The workspace</p>
                <h2
                  id="assistant-heading"
                  className="mt-2 font-serif text-4xl font-semibold tracking-tight text-[#173e35]"
                >
                  What would you like to understand?
                </h2>
              </div>
              <div className="flex items-center gap-2 text-sm text-[#6a8179]">
                <Lightbulb size={17} className="text-[#bb8a2e]" /> Clear
                questions make strong starts.
              </div>
            </div>
            <GrokStudyAssistant isAuthenticated={isAuthenticated} />
          </div>
        </section>
      </main>

      <footer className="container flex flex-wrap items-center justify-between gap-4 py-8 text-sm text-[#78938a]">
        <span>ScholarShelf · Learn with clarity.</span>
        <Link
          href="/"
          className="font-semibold text-[#1d5146] hover:text-[#153c34]"
        >
          Back to catalogue
        </Link>
      </footer>
    </div>
  );
}
