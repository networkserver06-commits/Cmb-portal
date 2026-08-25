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
import { Megaphone, Plus, Power, Save, UploadCloud } from "lucide-react";
import { toast } from "sonner";

const emptyPaper = {
  course: "",
  level: "",
  cycle: "",
  unit: "",
  paperType: "",
  title: "",
  priceKes: "",
  description: "",
};
const acceptedDocuments = ".pdf,.doc,.docx,.ppt,.pptx,.txt,.csv";
const resourceFieldLabels = {
  title: "Title",
  course: "Course",
  level: "Level",
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
          priceKes,
          mode: resourceMode,
          fileId: uploaded.fileId,
        });
      } else {
        await createPaper.mutateAsync({
          ...paper,
          priceKes,
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
    <section className="mt-8 grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-[#dfe9e3] bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-xl font-semibold text-[#173e35]">
              Catalogue upload station
            </h2>
            <p className="mt-1 text-xs text-[#82958e]">
              One secure uploader for administrator-managed papers and catalogue
              posts. Student submissions are handled in Operations.
            </p>
          </div>
          <Plus size={19} className="text-[#4b8876]" />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
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
        <div className="mt-3">
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
        <div className="mt-3 text-xs font-semibold text-[#58766b]">
          Document upload
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-[#b9d2c5] bg-[#f6faf7] p-4 text-sm text-[#58766b]">
          <UploadCloud size={19} className="text-[#4b8876]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">
              {paperFile
                ? `${paperFile.name} · ${(paperFile.size / 1024 / 1024).toFixed(2)} MiB`
                : "Choose a paper document"}
            </span>
            <span className="mt-1 block text-xs">
              PDF, Word, PowerPoint, TXT, or CSV · maximum 4 MiB
            </span>
          </span>
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
          <div className="mt-3" aria-live="polite">
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
          className="mt-4 rounded-full bg-[#1d5146]"
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
            className={`mt-3 text-xs ${paperFeedback.tone === "error" ? "text-[#a44e49]" : "text-[#34745f]"}`}
            role="status"
          >
            {paperFeedback.text}
          </p>
        )}
        <div className="mt-6 space-y-2">
          {papers.data?.slice(0, 5).map(item => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-xl bg-[#f5f9f6] px-3 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-[#274d43]">
                  {item.title}
                </div>
                <div className="text-xs text-[#82958e]">
                  KES {Number(item.priceKes).toLocaleString()}
                </div>
              </div>
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
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[#dfe9e3] bg-white p-6 shadow-sm lg:col-span-2">
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
