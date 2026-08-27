import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { uploadPortalDocument, validatePortalDocument } from "@/lib/fileUpload";
import EducationLevelSelect from "@/components/EducationLevelSelect";
import type { EducationLevel } from "@shared/educationLevels";
import {
  CheckCircle2,
  FileText,
  Megaphone,
  Plus,
  Power,
  Save,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";

const emptyPaper = {
  course: "",
  level: "" as EducationLevel | "",
  cycle: "",
  unit: "",
  paperType: "",
  title: "",
  priceKes: "",
  description: "",
};
const acceptedDocuments =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.odp,.ods,.rtf,.epub,.md,.html,.txt,.csv";
const resourceFieldLabels = {
  title: "Title",
  course: "Course",
  cycle: "Cycle",
  unit: "Unit",
  paperType: "Paper type",
} as const;

export default function AdminControls() {
  const papers = trpc.admin.listPapers.useQuery();
  const announcements = trpc.admin.listAnnouncements.useQuery();
  const utils = trpc.useUtils();
  const toggle = trpc.admin.setAvailability.useMutation({
    onSuccess: () => utils.admin.listPapers.invalidate(),
  });
  const createPaper = trpc.admin.createPaper.useMutation({
    onSuccess: async () => {
      await utils.admin.listPapers.invalidate();
      setPaper(emptyPaper);
      setPaperFile(null);
      setPaperProgress(0);
      setPaperFeedback({
        tone: "success",
        text: "Paper saved to the catalogue.",
      });
      toast.success("Paper saved", {
        description: "The catalogue has been refreshed.",
      });
    },
    onError: error =>
      toast.error("Paper could not be saved", { description: error.message }),
  });
  const publishPost = trpc.admin.publishPost.useMutation({
    onSuccess: async () => {
      await utils.admin.listPapers.invalidate();
      setPaper(emptyPaper);
      setPaperFile(null);
      setPaperProgress(0);
      setPaperFeedback({
        tone: "success",
        text: "Post published to the catalogue.",
      });
      toast.success("Post published", {
        description: "The catalogue has been refreshed.",
      });
    },
    onError: error =>
      toast.error("Post could not be published", {
        description: error.message,
      }),
  });
  const createAnnouncement = trpc.admin.createAnnouncement.useMutation({
    onSuccess: async () => {
      await utils.admin.listAnnouncements.invalidate();
      setNotice({ title: "", message: "", severity: "info" });
      toast.success("Announcement published", {
        description: "Students will see the refreshed notice.",
      });
    },
    onError: error =>
      toast.error("Announcement could not be published", {
        description: error.message,
      }),
  });
  const [paper, setPaper] = useState(emptyPaper);
  const [resourceType, setResourceType] = useState<"paper" | "post">("paper");
  const [resourceMode, setResourceMode] = useState<"free" | "paid">("paid");
  const [paperFile, setPaperFile] = useState<File | null>(null);
  const [notice, setNotice] = useState({
    title: "",
    message: "",
    severity: "info" as "info" | "warning" | "emergency",
  });
  const [paperFeedback, setPaperFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [preparingPaper, setPreparingPaper] = useState(false);
  const [paperProgress, setPaperProgress] = useState(0);
  const setPaperField = (key: keyof typeof emptyPaper, value: string) =>
    setPaper(current => ({ ...current, [key]: value }));
  const saveResource = async () => {
    if (preparingPaper || createPaper.isPending || publishPost.isPending)
      return;
    if (!paperFile)
      return setPaperFeedback({
        tone: "error",
        text: "Choose a document before saving this resource.",
      });
    if (!paper.level)
      return setPaperFeedback({
        tone: "error",
        text: "Choose an education level before saving this resource.",
      });
    const level = paper.level as EducationLevel;
    const priceKes = resourceMode === "free" ? 0 : Number(paper.priceKes);
    if (
      resourceMode === "paid" &&
      (!Number.isFinite(priceKes) || priceKes <= 0)
    )
      return setPaperFeedback({
        tone: "error",
        text: "Enter a positive price in KES.",
      });
    setPaperFeedback(null);
    setPreparingPaper(true);
    try {
      const uploaded = await uploadPortalDocument({
        file: paperFile,
        purpose: "paper",
        onProgress: setPaperProgress,
      });
      if (resourceType === "post") {
        await publishPost.mutateAsync({
          ...paper,
          level,
          priceKes,
          mode: resourceMode,
          fileId: uploaded.fileId,
        });
      } else {
        await createPaper.mutateAsync({
          ...paper,
          level,
          priceKes,
          mode: resourceMode,
          fileId: uploaded.fileId,
        });
      }
    } catch (error) {
      setPaperFeedback({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "The document could not be uploaded.",
      });
      setPaperProgress(0);
    } finally {
      setPreparingPaper(false);
    }
  };

  return (
    <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-[#dfe9e3] bg-white p-4 shadow-sm sm:p-6">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#1d5146] via-[#76a894] to-[#e9c878]" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#e8f1ed] text-[#1d5146]">
              <ShieldCheck size={19} />
            </div>
            <div>
              <h2 className="font-serif text-xl font-semibold text-[#173e35]">
                Catalogue upload station
              </h2>
              <p className="mt-1 max-w-xl text-xs leading-5 text-[#82958e]">
                Publish administrator-managed papers and posts through one
                secure GridFS uploader. Student contributions are reviewed in
                Operations.
              </p>
            </div>
          </div>
          <Badge className="w-fit border-0 bg-[#f5f8f6] text-[#58766b]">
            <Plus size={13} className="mr-1" /> New resource
          </Badge>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#789087]">
              Resource type
            </label>
            <Select
              value={resourceType}
              onValueChange={value => {
                const nextType = value as "paper" | "post";
                setResourceType(nextType);
                if (nextType === "post" && resourceMode === "paid") {
                  setResourceMode("free");
                  setPaper(current => ({ ...current, priceKes: "0" }));
                }
              }}
            >
              <SelectTrigger className="h-10 rounded-xl border-[#d9e6df]">
                <SelectValue placeholder="Choose resource type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="paper">Examination paper</SelectItem>
                <SelectItem value="post">
                  Catalogue post with document
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#789087]">
              Education level
            </label>
            <EducationLevelSelect
              value={paper.level}
              onChange={value => setPaperField("level", value)}
              className="h-10 w-full rounded-xl border-[#d9e6df]"
            />
            <p className="mt-1 text-xs text-[#82958e]">
              Shown on the catalogue so learners can filter by pathway.
            </p>
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-[#789087]">
              Access
            </label>
            <Select
              value={resourceMode}
              onValueChange={value => {
                const mode = value as "free" | "paid";
                setResourceMode(mode);
                if (mode === "free")
                  setPaper(current => ({ ...current, priceKes: "0" }));
              }}
            >
              <SelectTrigger className="h-10 rounded-xl border-[#d9e6df]">
                <SelectValue placeholder="Choose access" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free access</SelectItem>
                <SelectItem value="paid">Paystack checkout</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] leading-4 text-[#82958e]">
              {resourceMode === "free"
                ? "Learners can open this resource without payment."
                : "Learners pay securely through the Paystack checkout flow."}
            </p>
          </div>
          {(
            Object.keys(resourceFieldLabels) as Array<
              keyof typeof resourceFieldLabels
            >
          ).map(key => (
            <div key={key}>
              <label className="mb-2 block text-xs font-semibold text-[#58766b]">
                {resourceFieldLabels[key]}
              </label>
              <Input
                required
                value={paper[key]}
                onChange={e => setPaperField(key, e.target.value)}
                placeholder={`Enter ${resourceFieldLabels[key].toLowerCase()}`}
                className="h-10 rounded-xl border-[#d9e6df]"
              />
            </div>
          ))}
          {resourceMode === "paid" && (
            <div>
              <label className="mb-2 block text-xs font-semibold text-[#58766b]">
                Price (KES)
              </label>
              <Input
                type="number"
                min="1"
                value={paper.priceKes}
                onChange={e => setPaperField("priceKes", e.target.value)}
                placeholder="Enter price"
                className="h-10 rounded-xl border-[#d9e6df]"
              />
            </div>
          )}
        </div>
        <div className="mt-4 sm:col-span-2">
          <label className="mb-2 block text-xs font-semibold text-[#58766b]">
            Description{" "}
            <span className="font-normal text-[#9aaca5]">(optional)</span>
          </label>
          <Textarea
            value={paper.description}
            onChange={e => setPaperField("description", e.target.value)}
            placeholder="One short note for learners"
            className="rounded-xl border-[#d9e6df]"
          />
        </div>
        <div className="mt-4 text-xs font-semibold text-[#58766b]">
          Document upload
        </div>
        <label className="mt-2 flex min-h-20 cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-[#b9d2c5] bg-[#f6faf7] p-3 text-sm text-[#58766b] transition hover:border-[#76a894] hover:bg-[#f1f8f4] sm:p-4">
          {paperFile ? (
            <CheckCircle2 size={20} className="shrink-0 text-[#34745f]" />
          ) : (
            <UploadCloud size={20} className="shrink-0 text-[#4b8876]" />
          )}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="block min-w-0 truncate font-semibold">
                {paperFile
                  ? `${paperFile.name} · ${(paperFile.size / 1024 / 1024).toFixed(2)} MiB`
                  : "Choose a paper document"}
              </span>
              {paperFile && (
                <span className="shrink-0 rounded-full bg-[#dcefe5] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#34745f]">
                  Ready
                </span>
              )}
            </span>
            <span className="mt-1 block text-xs leading-4 text-[#82958e]">
              PDF, Word, Excel, PowerPoint, OpenDocument, RTF, EPUB, TXT, CSV,
              or HTML · maximum 4 MiB
            </span>
          </span>
          {paperFile && (
            <button
              type="button"
              aria-label="Remove selected document"
              className="rounded-full p-1.5 text-[#82958e] transition hover:bg-white hover:text-[#a44e49]"
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                setPaperFile(null);
                setPaperProgress(0);
              }}
            >
              <X size={16} />
            </button>
          )}
          <input
            type="file"
            accept={acceptedDocuments}
            className="sr-only"
            disabled={
              preparingPaper || createPaper.isPending || publishPost.isPending
            }
            onChange={event => {
              const next = event.target.files?.[0] ?? null;
              const error = next ? validatePortalDocument(next, "paper") : null;
              setPaperFile(error ? null : next);
              setPaperFeedback(error ? { tone: "error", text: error } : null);
              setPaperProgress(0);
            }}
          />
        </label>
        {preparingPaper && (
          <div className="mt-3 rounded-xl bg-[#f7faf8] p-3" aria-live="polite">
            <div className="flex justify-between text-xs font-semibold text-[#4b8876]">
              <span>Secure upload progress</span>
              <span>{paperProgress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e8f1ed]">
              <div
                className="h-full rounded-full bg-[#1d5146] transition-[width] duration-200"
                style={{ width: `${paperProgress}%` }}
              />
            </div>
          </div>
        )}
        <Button
          className="mt-4 w-full rounded-full bg-[#1d5146] shadow-sm shadow-[#1d5146]/15 sm:w-auto"
          disabled={
            createPaper.isPending || publishPost.isPending || preparingPaper
          }
          onClick={saveResource}
        >
          <Save size={15} />{" "}
          {preparingPaper
            ? "Uploading…"
            : createPaper.isPending || publishPost.isPending
              ? "Saving…"
              : resourceType === "post"
                ? "Publish catalogue post"
                : "Upload catalogue paper"}
        </Button>
        {paperFeedback && (
          <p
            className={`mt-3 rounded-xl px-3 py-2.5 text-xs leading-5 ${paperFeedback.tone === "error" ? "bg-[#fff4f2] text-[#a44e49]" : "bg-[#edf8f1] text-[#34745f]"}`}
            role="status"
          >
            {paperFeedback.text}
          </p>
        )}
        <div className="mt-7 border-t border-[#edf2ef] pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[#274d43]">
                Recent catalogue files
              </h3>
              <p className="mt-1 text-xs leading-4 text-[#82958e]">
                View a document or pause its public availability at any time.
              </p>
            </div>
            <Badge className="border-0 bg-[#f5f8f6] text-[#58766b]">
              {papers.data?.length ?? 0}
            </Badge>
          </div>
          <div className="mt-3 space-y-2">
            {papers.data?.slice(0, 5).map(item => (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-xl bg-[#f5f9f6] px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <FileText
                    size={17}
                    className="mt-0.5 shrink-0 text-[#4b8876]"
                  />
                  <div className="min-w-0">
                    <div className="truncate font-medium text-[#274d43]">
                      {item.title}
                    </div>
                    <div className="mt-0.5 text-xs text-[#82958e]">
                      {item.accessMode === "free"
                        ? "Free access"
                        : "Paystack checkout"}{" "}
                      · KES {Number(item.priceKes).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1 pl-7 sm:shrink-0 sm:pl-0">
                  {item.fileId && (
                    <a
                      href={`/api/files/${encodeURIComponent(item.fileId)}/view`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`View document for ${item.title}`}
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-[#1d5146] transition hover:bg-white"
                    >
                      <FileText size={13} /> View document
                    </a>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full text-[#3f806d]"
                    onClick={() =>
                      toggle.mutate({
                        paperId: item.id,
                        isAvailable: !item.isAvailable,
                      })
                    }
                  >
                    <Power size={14} className="mr-1" />{" "}
                    {item.isAvailable ? "Live" : "Paused"}
                  </Button>
                </div>
              </div>
            ))}
            {!papers.isLoading && !papers.data?.length && (
              <div className="rounded-xl border border-dashed border-[#dfe9e3] px-3 py-5 text-center text-xs text-[#82958e]">
                No catalogue resources yet. Upload the first one above.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[1.75rem] border border-[#dfe9e3] bg-white p-4 shadow-sm sm:p-6 lg:col-span-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-xl font-semibold text-[#173e35]">
              Announcements
            </h2>
            <p className="mt-1 text-xs text-[#82958e]">
              Publish an immediate notice to students.
            </p>
          </div>
          <Megaphone size={19} className="text-[#b88327]" />
        </div>
        <Input
          value={notice.title}
          onChange={e => setNotice({ ...notice, title: e.target.value })}
          placeholder="Notice title"
          className="mt-5 h-10 rounded-xl border-[#d9e6df]"
        />
        <Textarea
          value={notice.message}
          onChange={e => setNotice({ ...notice, message: e.target.value })}
          placeholder="Write the message students should see"
          className="mt-3 rounded-xl border-[#d9e6df]"
        />
        <div className="mt-3 flex gap-2">
          {(["info", "warning", "emergency"] as const).map(level => (
            <Button
              key={level}
              variant="outline"
              size="sm"
              className={`rounded-full ${notice.severity === level ? "border-[#1d5146] bg-[#e8f1ed] text-[#1d5146]" : "border-[#d9e6df]"}`}
              onClick={() => setNotice({ ...notice, severity: level })}
            >
              {level}
            </Button>
          ))}
        </div>
        <Button
          className="mt-4 rounded-full bg-[#1d5146]"
          disabled={
            createAnnouncement.isPending ||
            !notice.title.trim() ||
            !notice.message.trim()
          }
          onClick={() => createAnnouncement.mutate(notice)}
        >
          <Megaphone size={15} />{" "}
          {createAnnouncement.isPending ? "Publishing…" : "Publish notice"}
        </Button>
        <div className="mt-7 grid gap-2 md:grid-cols-2">
          {announcements.data?.slice(0, 4).map(item => (
            <div
              key={item.id}
              className="rounded-xl border border-[#edf2ef] p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#274d43]">
                  {item.title}
                </span>
                <Badge className="border-0 bg-[#e8f1ed] text-[#34745f]">
                  {item.severity}
                </Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-[#82958e]">
                {item.message}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
