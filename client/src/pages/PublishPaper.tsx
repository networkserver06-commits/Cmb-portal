import { trpc } from "@/lib/trpc";
import { uploadPortalDocument, validatePortalDocument } from "@/lib/fileUpload";
import EducationLevelSelect from "@/components/EducationLevelSelect";
import type { EducationLevel } from "@shared/educationLevels";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, FileUp, Loader2, ShieldCheck } from "lucide-react";

export default function PublishPaper({
  onSubmitted,
}: {
  onSubmitted?: () => void;
}) {
  const [form, setForm] = useState({
    title: "",
    course: "",
    level: "" as EducationLevel | "",
    cycle: "Not specified",
    unit: "General revision",
    paperType: "Revision paper",
    description: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [submissionNotice, setSubmissionNotice] = useState("");
  const submit = trpc.student.submitPaper.useMutation({
    onSuccess: result => {
      setForm({
        title: "",
        course: "",
        level: "" as EducationLevel | "",
        cycle: "Not specified",
        unit: "General revision",
        paperType: "Revision paper",
        description: "",
      });
      setFile(null);
      setAuthorized(false);
      setError("");
      setProgress(0);
      setSubmissionNotice(
        result.publication.status === "published"
          ? "Safety check passed. Your paper is now published in the free catalogue."
          : "Your paper was held for administrator review because the safety detector needs a closer look."
      );
      onSubmitted?.();
    },
  });
  const update = (key: keyof typeof form, value: string) =>
    setForm(current => ({ ...current, [key]: value }));
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmissionNotice("");
    if (!file) return setError("Choose a supported examination document.");
    const validationError = validatePortalDocument(file, "submission");
    if (validationError) return setError(validationError);
    if (!authorized)
      return setError(
        "Confirm that you own or are authorized to share this paper."
      );
    if (!form.level) return setError("Choose an education level.");
    const level = form.level as EducationLevel;
    setUploading(true);
    try {
      const uploaded = await uploadPortalDocument({
        file,
        purpose: "submission",
        onProgress: setProgress,
      });
      await submit.mutateAsync({
        ...form,
        level,
        fileId: uploaded.fileId,
        authorized: true,
      });
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to upload this paper."
      );
      setProgress(0);
    } finally {
      setUploading(false);
    }
  };
  const busy = uploading || submit.isPending;
  return (
    <form
      onSubmit={send}
      className="rounded-2xl border border-[#dfe9e3] bg-white p-6 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-eyebrow">Share for free</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold text-[#173e35]">
            Submit a paper
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#718780]">
            Share an authorized examination document. Safe PDFs, text, CSV, and
            supported office files can publish immediately; formats or content
            that need a closer look are held securely for administrator review.
          </p>
        </div>
        <div className="hidden rounded-xl bg-[#e5f2eb] p-3 text-[#34745f] sm:block">
          <ShieldCheck size={20} />
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-[#3c5d53]">
          Paper title
          <Input
            required
            value={form.title}
            onChange={event => update("title", event.target.value)}
            className="mt-2 rounded-xl border-[#d9e6df]"
            placeholder="e.g. Communication Skills June 2025"
          />
        </label>
        <label className="text-sm font-medium text-[#3c5d53]">
          Course
          <Input
            required
            value={form.course}
            onChange={event => update("course", event.target.value)}
            className="mt-2 rounded-xl border-[#d9e6df]"
            placeholder="CDACC"
          />
        </label>
        <label className="text-sm font-medium text-[#3c5d53]">
          Education level
          <EducationLevelSelect
            value={form.level}
            onChange={value => update("level", value)}
            className="mt-2 h-10 rounded-xl border-[#d9e6df]"
          />
          <span className="mt-1 block text-xs font-normal text-[#82958e]">
            Choose the learner pathway for this paper.
          </span>
        </label>
      </div>
      <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#b9d2c5] bg-[#f6faf7] p-4 text-sm text-[#58766b]">
        <FileUp size={19} className="text-[#4b8876]" />
        <span className="min-w-0 flex-1 truncate">
          {file
            ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MiB`
            : "Select a PDF, Word, Excel, PowerPoint, or supported document (maximum 4 MiB)"}
        </span>
        <input
          className="sr-only"
          type="file"
          accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.odp,.ods,.rtf,.epub,.md,.html,.txt,.csv"
          disabled={busy}
          onChange={event => {
            const next = event.target.files?.[0] ?? null;
            setFile(next);
            setError(
              next ? (validatePortalDocument(next, "submission") ?? "") : ""
            );
            setProgress(0);
          }}
        />
      </label>
      <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-[#58766b]">
        <input
          type="checkbox"
          checked={authorized}
          disabled={busy}
          onChange={event => setAuthorized(event.target.checked)}
          className="mt-1 h-4 w-4 accent-[#1d5146]"
        />
        I confirm I own this material or have permission to share it. Safe files
        may appear immediately; anything uncertain is held for administrator
        review.
      </label>
      {uploading && (
        <div className="mt-4" aria-live="polite">
          <div className="flex justify-between text-xs font-semibold text-[#4b8876]">
            <span>Uploading securely</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e8f1ed]">
            <div
              className="h-full rounded-full bg-[#1d5146] transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-[#fff4f3] p-3 text-sm text-[#a44e49]"
        >
          {error}
        </p>
      )}
      {submissionNotice && (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-[#e5f2eb] p-3 text-sm text-[#34745f]">
          <CheckCircle2 size={17} /> {submissionNotice}
        </p>
      )}
      <Button
        type="submit"
        disabled={busy}
        className="mt-6 rounded-full bg-[#1d5146] hover:bg-[#153c34]"
      >
        {busy && <Loader2 size={16} className="animate-spin" />}
        {uploading
          ? "Uploading securely…"
          : submit.isPending
            ? "Saving submission…"
            : "Submit for safe checking"}
      </Button>
    </form>
  );
}
