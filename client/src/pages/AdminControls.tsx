import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { uploadPortalDocument, validatePortalDocument } from "@/lib/fileUpload";
import {
  FileUp,
  Megaphone,
  Plus,
  Power,
  Save,
  UploadCloud,
} from "lucide-react";
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
const emptyPost = {
  title: "",
  course: "",
  level: "",
  cycle: "",
  unit: "",
  paperType: "",
  description: "",
  mode: "free" as "free" | "paid",
  priceKes: "0",
};
const acceptedDocuments = ".pdf,.doc,.docx,.ppt,.pptx,.txt,.csv";

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
      setPost(emptyPost);
      setPostFile(null);
      setPostFeedback({
        tone: "success",
        text: "Post published successfully and added to the catalogue.",
      });
      toast.success("Post published", {
        description: "The live catalogue has been refreshed.",
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
  const [paperFile, setPaperFile] = useState<File | null>(null);
  const [post, setPost] = useState(emptyPost);
  const [postFile, setPostFile] = useState<File | null>(null);
  const [notice, setNotice] = useState({
    title: "",
    message: "",
    severity: "info" as "info" | "warning" | "emergency",
  });
  const [paperFeedback, setPaperFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [postFeedback, setPostFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [preparingPost, setPreparingPost] = useState(false);
  const [postProgress, setPostProgress] = useState(0);
  const [preparingPaper, setPreparingPaper] = useState(false);
  const [paperProgress, setPaperProgress] = useState(0);
  const setPaperField = (key: keyof typeof emptyPaper, value: string) =>
    setPaper(current => ({ ...current, [key]: value }));
  const setPostField = (key: keyof typeof emptyPost, value: string) =>
    setPost(current => ({ ...current, [key]: value }));
  const paidPrice = Number(post.priceKes);

  const handlePostFile = (file?: File) => {
    if (!file) return;
    const validationError = validatePortalDocument(file, "paper");
    if (validationError) {
      setPostFile(null);
      setPostFeedback({ tone: "error", text: validationError });
      return;
    }
    setPostFile(file);
    setPostProgress(0);
    setPostFeedback(null);
  };

  const savePaper = async () => {
    if (preparingPaper || createPaper.isPending) return;
    if (!paperFile)
      return setPaperFeedback({
        tone: "error",
        text: "Choose a document before saving this paper.",
      });
    if (!Number.isFinite(Number(paper.priceKes)) || Number(paper.priceKes) <= 0)
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
      await createPaper.mutateAsync({
        ...paper,
        priceKes: Number(paper.priceKes),
        fileId: uploaded.fileId,
      });
    } catch (error) {
      setPaperFeedback({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "The paper could not be uploaded.",
      });
      setPaperProgress(0);
    } finally {
      setPreparingPaper(false);
    }
  };

  const submitPost = async () => {
    if (preparingPost || publishPost.isPending) return;
    if (!postFile)
      return setPostFeedback({
        tone: "error",
        text: "Choose a document before publishing.",
      });
    if (post.mode === "paid" && (!Number.isFinite(paidPrice) || paidPrice <= 0))
      return setPostFeedback({
        tone: "error",
        text: "Paid posts need a price greater than zero.",
      });
    setPreparingPost(true);
    toast.loading("Uploading post", {
      id: "post-publish",
      description:
        "Uploading the document directly into secure portal storage…",
    });
    try {
      const uploaded = await uploadPortalDocument({
        file: postFile,
        purpose: "paper",
        onProgress: setPostProgress,
      });
      toast.loading("Publishing post", {
        id: "post-publish",
        description:
          "Linking the GridFS document and refreshing the catalogue…",
      });
      await publishPost.mutateAsync({
        ...post,
        priceKes: post.mode === "free" ? 0 : paidPrice,
        fileId: uploaded.fileId,
      });
      toast.success("Post published", {
        id: "post-publish",
        description: "The document is now available through the catalogue.",
      });
    } catch (error) {
      toast.error("Document could not be published", {
        id: "post-publish",
        description:
          error instanceof Error
            ? error.message
            : "Unable to publish this document.",
      });
      setPostFeedback({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to publish this document.",
      });
      setPostProgress(0);
    } finally {
      setPreparingPost(false);
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
              Administrator-only upload for papers that belong in the public
              catalogue. Student submissions are handled in Operations.
            </p>
          </div>
          <Plus size={19} className="text-[#4b8876]" />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {(
            [
              "title",
              "course",
              "level",
              "cycle",
              "unit",
              "paperType",
              "priceKes",
            ] as const
          ).map(key => (
            <Input
              key={key}
              value={paper[key]}
              onChange={e => setPaperField(key, e.target.value)}
              placeholder={key.replace(/([A-Z])/g, " $1")}
              className="h-10 rounded-xl border-[#d9e6df]"
            />
          ))}
        </div>
        <Textarea
          value={paper.description}
          onChange={e => setPaperField("description", e.target.value)}
          placeholder="Short paper description"
          className="mt-3 rounded-xl border-[#d9e6df]"
        />
        <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-[#b9d2c5] bg-[#f6faf7] p-4 text-sm text-[#58766b]">
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
            disabled={preparingPaper || createPaper.isPending}
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
          disabled={createPaper.isPending || preparingPaper}
          onClick={savePaper}
        >
          <Save size={15} />{" "}
          {preparingPaper
            ? "Uploading…"
            : createPaper.isPending
              ? "Saving…"
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

      <div className="rounded-2xl border border-[#dfe9e3] bg-[#173f36] p-6 text-[#edf7f1] shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#b9dccb]">
              <FileUp size={15} /> Posts studio
            </div>
            <h2 className="mt-2 font-serif text-2xl font-semibold">
              Administrator document publisher
            </h2>
            <p className="mt-2 text-xs leading-5 text-[#b5cec2]">
              Add an administrator-managed catalogue resource. This area does
              not accept student submissions.
            </p>
          </div>
          <Badge className="border-0 bg-white/10 text-[#d8ebe2]">
            Admin only
          </Badge>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Input
            value={post.title}
            onChange={e => setPostField("title", e.target.value)}
            placeholder="Post title"
            className="h-10 rounded-xl border-white/15 bg-white/10 text-white placeholder:text-[#9fbeb1]"
          />
          <Input
            value={post.course}
            onChange={e => setPostField("course", e.target.value)}
            placeholder="Course"
            className="h-10 rounded-xl border-white/15 bg-white/10 text-white placeholder:text-[#9fbeb1]"
          />
          <Input
            value={post.level}
            onChange={e => setPostField("level", e.target.value)}
            placeholder="Level"
            className="h-10 rounded-xl border-white/15 bg-white/10 text-white placeholder:text-[#9fbeb1]"
          />
          <Input
            value={post.cycle}
            onChange={e => setPostField("cycle", e.target.value)}
            placeholder="Cycle"
            className="h-10 rounded-xl border-white/15 bg-white/10 text-white placeholder:text-[#9fbeb1]"
          />
          <Input
            value={post.unit}
            onChange={e => setPostField("unit", e.target.value)}
            placeholder="Unit"
            className="h-10 rounded-xl border-white/15 bg-white/10 text-white placeholder:text-[#9fbeb1]"
          />
          <Input
            value={post.paperType}
            onChange={e => setPostField("paperType", e.target.value)}
            placeholder="Document type"
            className="h-10 rounded-xl border-white/15 bg-white/10 text-white placeholder:text-[#9fbeb1]"
          />
        </div>
        <Textarea
          value={post.description}
          onChange={e => setPostField("description", e.target.value)}
          placeholder="Describe this post for learners"
          className="mt-3 rounded-xl border-white/15 bg-white/10 text-white placeholder:text-[#9fbeb1]"
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr]">
          <label
            className={`cursor-pointer rounded-2xl border p-4 transition ${post.mode === "free" ? "border-[#e4c66f] bg-white/10" : "border-white/15 bg-white/5 hover:bg-white/10"}`}
          >
            <input
              type="radio"
              name="post-mode"
              className="sr-only"
              checked={post.mode === "free"}
              onChange={() => setPost({ ...post, mode: "free", priceKes: "0" })}
            />
            <span className="block text-sm font-semibold">Free post</span>
            <span className="mt-1 block text-xs text-[#b5cec2]">
              Publish at no cost for learners.
            </span>
          </label>
          <label
            className={`cursor-pointer rounded-2xl border p-4 transition ${post.mode === "paid" ? "border-[#e4c66f] bg-white/10" : "border-white/15 bg-white/5 hover:bg-white/10"}`}
          >
            <input
              type="radio"
              name="post-mode"
              className="sr-only"
              checked={post.mode === "paid"}
              onChange={() => setPost({ ...post, mode: "paid" })}
            />
            <span className="block text-sm font-semibold">Paid post</span>
            <span className="mt-1 block text-xs text-[#b5cec2]">
              Require verified Paystack payment.
            </span>
          </label>
        </div>
        {post.mode === "paid" && (
          <Input
            type="number"
            min="1"
            value={post.priceKes}
            onChange={e => setPostField("priceKes", e.target.value)}
            placeholder="Price in KES"
            className="mt-3 h-10 rounded-xl border-white/15 bg-white/10 text-white placeholder:text-[#9fbeb1]"
          />
        )}
        <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-white/20 bg-white/5 p-4 transition hover:bg-white/10">
          <UploadCloud size={19} className="shrink-0 text-[#e4c66f]" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {postFile
                ? `${postFile.name} · ${(postFile.size / 1024 / 1024).toFixed(2)} MiB`
                : "Choose a document"}
            </span>
            <span className="mt-1 block text-xs text-[#b5cec2]">
              PDF, Word, PowerPoint, TXT, or CSV · max 4 MiB
            </span>
          </span>
          <input
            type="file"
            accept={acceptedDocuments}
            className="sr-only"
            disabled={preparingPost || publishPost.isPending}
            onChange={e => handlePostFile(e.target.files?.[0])}
          />
        </label>
        {preparingPost && (
          <div className="mt-3" aria-live="polite">
            <div className="flex justify-between text-xs text-[#b9dccb]">
              <span>Secure upload progress</span>
              <span>{postProgress}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[#e4c66f] transition-[width] duration-200"
                style={{ width: `${postProgress}%` }}
              />
            </div>
          </div>
        )}
        {postFeedback && (
          <p
            className={`mt-3 text-xs ${postFeedback.tone === "error" ? "text-[#ffb9b3]" : "text-[#a9e0bc]"}`}
            role="status"
            aria-live="polite"
          >
            {postFeedback.text}
          </p>
        )}
        <Button
          className="mt-4 rounded-full bg-[#e4c66f] text-[#193b34] hover:bg-[#efd581]"
          disabled={publishPost.isPending || preparingPost}
          onClick={submitPost}
        >
          <UploadCloud size={15} />{" "}
          {preparingPost
            ? "Preparing…"
            : publishPost.isPending
              ? "Publishing…"
              : "Publish catalogue update"}
        </Button>
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
