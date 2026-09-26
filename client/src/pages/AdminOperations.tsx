import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { educationLevelLabel } from "@shared/educationLevels";
import { uploadPortalDocument } from "@/lib/fileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import RouteProgress from "@/components/RouteProgress";
import { toast } from "sonner";
import {
  Check,
  Eye,
  FileUp,
  KeyRound,
  Search,
  ShieldCheck,
  ShieldOff,
  UploadCloud,
  Trash2,
  Users,
  WalletCards,
  X,
} from "lucide-react";

const submissionStatusStyles: Record<string, string> = {
  pending: "border-[#ead79b] bg-[#fff7dc] text-[#80631a]",
  approved: "border-[#b9ddc7] bg-[#eef9f1] text-[#327452]",
  rejected: "border-[#efc8c5] bg-[#fff4f3] text-[#a44e49]",
};

function PaperReplacement({ paper }: { paper: any }) {
  const utils = trpc.useUtils();
  const replace = trpc.admin.uploadPaper.useMutation({
    onSuccess: () => utils.admin.listPapers.invalidate(),
  });
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"success" | "error" | "idle">("idle");
  const busy = replace.isPending;
  const upload = async (file?: File) => {
    if (!file || busy) return;
    setProgress(0);
    setMessage("Uploading securely to MongoDB GridFS…");
    setTone("idle");
    try {
      const uploaded = await uploadPortalDocument({
        file,
        purpose: "paper",
        onProgress: setProgress,
      });
      await replace.mutateAsync({
        paperId: paper.legacyId,
        fileId: uploaded.fileId,
      });
      setMessage("Paper file updated and linked securely.");
      setTone("success");
      toast.success("Paper file updated", {
        description: "The replacement document is now securely linked.",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The paper file could not be updated.";
      setMessage(message);
      setTone("error");
      toast.error("Paper upload failed", { description: message });
      setProgress(0);
    }
  };
  return (
    <div className="rounded-2xl border border-[#dfe9e3] bg-[#f7fbf8] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#274d43]">
            {paper.title}
          </p>
          <p className="mt-1 text-xs text-[#82958e]">
            Replace with a validated PDF or document up to 250 MiB.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {paper.fileId && (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="rounded-full border-[#c8d9d2] bg-white text-xs text-[#1d5146]"
            >
              <a
                href={`/api/files/${encodeURIComponent(paper.fileId)}/view`}
                target="_blank"
                rel="noreferrer"
              >
                <Eye size={14} /> View
              </a>
            </Button>
          )}
          <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full border border-[#c8d9d2] bg-white px-3 py-2 text-xs font-semibold text-[#1d5146] transition hover:bg-[#e8f1ed]">
            <UploadCloud size={14} /> {busy ? "Uploading…" : "Replace file"}
            <input
              type="file"
              className="sr-only"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.csv"
              disabled={busy}
              onChange={event => {
                void upload(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      </div>
      {busy && (
        <div className="mt-3" aria-live="polite">
          <div className="flex justify-between text-xs font-semibold text-[#4b8876]">
            <span>Secure upload progress</span>
            <span>{progress}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e2efe8]">
            <div
              className="h-full rounded-full bg-[#1d5146] transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
      {message && (
        <p
          role="status"
          className={`mt-3 text-xs ${tone === "error" ? "text-[#a44e49]" : tone === "success" ? "text-[#34745f]" : "text-[#58766b]"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}

export default function AdminOperations() {
  const users = trpc.admin.listUsers.useQuery();
  const papers = trpc.admin.listPapers.useQuery();
  const payments = trpc.admin.listPayments.useQuery();
  const submissions = trpc.admin.listSubmissions.useQuery();
  const utils = trpc.useUtils();
  const grant = trpc.admin.grantAccess.useMutation({
    onSuccess: () =>
      setAccessMessage("Access granted to the selected student."),
    onError: error => setAccessMessage(error.message),
  });
  const setRole = trpc.admin.setUserRole.useMutation({
    onSuccess: async result => {
      await utils.admin.listUsers.invalidate();
      toast.success(result.role === "admin" ? "Administrator access granted" : "Administrator access removed");
    },
    onError: error => toast.error("Role change blocked", { description: error.message }),
  });
  const reviewSubmission = trpc.admin.reviewSubmission.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.admin.listSubmissions.invalidate(),
        utils.admin.listPapers.invalidate(),
      ]);
    },
  });
  const deletePaper = trpc.admin.deletePaper.useMutation({
    onSuccess: async () => {
      setDeleteConfirmation(null);
      setAccessMessage(
        "Paper permanently removed from the catalogue and user libraries."
      );
      await Promise.all([
        utils.admin.listPapers.invalidate(),
        utils.admin.listPayments.invalidate(),
      ]);
    },
    onError: error => setAccessMessage(error.message),
  });
  const [paymentFilter, setPaymentFilter] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedPaper, setSelectedPaper] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");
  const [accessMessage, setAccessMessage] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState<number | null>(
    null
  );
  const [submissionFilter, setSubmissionFilter] = useState<
    "pending" | "approved" | "rejected" | "all"
  >("pending");
  const submissionSummary = useMemo(() => {
    const rows = submissions.data ?? [];
    return {
      all: rows.length,
      pending: rows.filter(item => item.status === "pending").length,
      approved: rows.filter(item => item.status === "approved").length,
      rejected: rows.filter(item => item.status === "rejected").length,
    };
  }, [submissions.data]);
  const visibleSubmissions = useMemo(() => {
    const rows = submissions.data ?? [];
    if (submissionFilter === "all") return rows;
    return rows.filter(item => item.status === submissionFilter);
  }, [submissionFilter, submissions.data]);
  const visibleUsers = useMemo(() => {
    const query = userFilter.trim().toLowerCase();
    return (users.data ?? []).filter(user => {
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const matchesQuery =
        !query ||
        [user.name, user.email, String(user.legacyId)]
          .filter(Boolean)
          .some(value => String(value).toLowerCase().includes(query));
      return matchesRole && matchesQuery;
    });
  }, [roleFilter, userFilter, users.data]);
  const filteredPayments = useMemo(
    () =>
      payments.data?.filter(
        row =>
          row.paper &&
          `${row.payment.providerReference} ${row.paper!.title} ${row.payment.channel}`
            .toLowerCase()
            .includes(paymentFilter.toLowerCase())
      ) ?? [],
    [payments.data, paymentFilter]
  );
  const operationsLoading =
    users.isLoading ||
    papers.isLoading ||
    payments.isLoading ||
    submissions.isLoading;

  return (
    <div className="mt-8">
      <RouteProgress
        visible={operationsLoading}
        label="Syncing administrator workspace…"
      />
      <div className="mt-4 grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
        <section className="rounded-2xl border border-[#dfe9e3] bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8f1ed] text-[#2d7965]">
              <Users size={18} />
            </div>
            <div>
              <h2 className="font-serif text-xl font-semibold text-[#173e35]">
                Student access
              </h2>
              <p className="mt-1 text-xs text-[#82958e]">
                Manage roles and grant manual entitlements.
              </p>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <select
              value={selectedUser}
              onChange={event => setSelectedUser(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-xl border border-[#d9e6df] bg-white px-3 text-sm"
            >
              <option value="">Choose student</option>
              {users.data?.map(user => (
                <option key={user.legacyId} value={user.legacyId}>
                  {user.name || user.email || `Student ${user.legacyId}`}
                </option>
              ))}
            </select>
            <select
              value={selectedPaper}
              onChange={event => setSelectedPaper(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-xl border border-[#d9e6df] bg-white px-3 text-sm"
            >
              <option value="">Choose paper</option>
              {papers.data?.map(paper => (
                <option key={paper.legacyId} value={paper.legacyId}>
                  {paper.title}
                </option>
              ))}
            </select>
          </div>
          <Button
            className="mt-3 rounded-full bg-[#1d5146]"
            disabled={!selectedUser || !selectedPaper || grant.isPending}
            onClick={() => {
              setAccessMessage("");
              grant.mutate({
                userId: Number(selectedUser),
                paperId: Number(selectedPaper),
              });
            }}
          >
            <KeyRound size={15} />{" "}
            {grant.isPending ? "Granting…" : "Grant paper access"}
          </Button>
          {accessMessage && (
            <p role="status" className="mt-3 text-xs text-[#58766b]">
              {accessMessage}
            </p>
          )}
          <div className="mt-6 border-t border-[#edf2ef] pt-5">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9aaca6]" />
                <Input
                  value={userFilter}
                  onChange={event => setUserFilter(event.target.value)}
                  placeholder="Search name, email, or ID"
                  aria-label="Search users for role management"
                  className="h-10 rounded-xl pl-9"
                />
              </div>
              <select
                value={roleFilter}
                onChange={event => setRoleFilter(event.target.value as typeof roleFilter)}
                aria-label="Filter users by role"
                className="h-10 rounded-xl border border-[#d9e6df] bg-white px-3 text-sm"
              >
                <option value="all">All roles</option>
                <option value="admin">Administrators</option>
                <option value="user">Students</option>
              </select>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-[#6f887f]">
              <span className="rounded-full bg-[#eef9f1] px-3 py-1.5">{(users.data ?? []).filter(user => user.role === "admin").length} administrators</span>
              <span className="rounded-full bg-[#f5f9f6] px-3 py-1.5">{(users.data ?? []).filter(user => user.role !== "admin").length} students</span>
              <span className="rounded-full bg-[#f5f9f6] px-3 py-1.5">{visibleUsers.length} shown</span>
            </div>
            <div className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
              {visibleUsers.map(user => (
                <div
                  key={user.legacyId}
                  className="flex flex-col gap-3 rounded-xl bg-[#f5f9f6] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 truncate text-sm font-medium text-[#274d43]">
                      {user.role === "admin" ? <ShieldCheck size={15} className="shrink-0 text-[#2d7965]" /> : <ShieldOff size={15} className="shrink-0 text-[#94aaa2]" />}
                      <span className="truncate">{user.name || user.email || `User ${user.legacyId}`}</span>
                    </div>
                    <div className="truncate pl-5 text-xs text-[#82958e]">
                      {user.email || "No email"} · ID {user.legacyId}
                      {user.isPrimaryAdmin && " · Primary administrator"}
                    </div>
                  </div>
                  <select
                    value={user.role === "admin" ? "admin" : "user"}
                    disabled={setRole.isPending || user.isPrimaryAdmin}
                    aria-label={`Set role for ${user.name || user.email || `user ${user.legacyId}`}`}
                    onChange={event =>
                      setRole.mutate({
                        userId: user.legacyId,
                        role: event.target.value as "user" | "admin",
                      })
                    }
                    className="h-9 rounded-full border border-[#c8d9d2] bg-white px-3 text-xs font-semibold text-[#1d5146]"
                  >
                    <option value="user">Student</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
              ))}
              {!visibleUsers.length && (
                <p className="rounded-xl border border-dashed border-[#cdded7] px-4 py-6 text-center text-xs text-[#82958e]">
                  No users match this search.
                </p>
              )}
            </div>
            <p className="mt-3 text-[11px] leading-5 text-[#82958e]">
              Administrators can access the management workspace. The owner account, your current administrator session, and the last remaining administrator cannot be demoted.
            </p>
          </div>
        </section>
        <section className="rounded-2xl border border-[#dfe9e3] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff4d5] text-[#94701d]">
                <WalletCards size={18} />
              </div>
              <div>
                <h2 className="font-serif text-xl font-semibold text-[#173e35]">
                  Payment and file operations
                </h2>
                <p className="mt-1 text-xs text-[#82958e]">
                  Live LeeTec payment records and secure document replacement.
                </p>
              </div>
            </div>
            <div className="relative w-40">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9aaca6]"
              />
              <Input
                value={paymentFilter}
                onChange={event => setPaymentFilter(event.target.value)}
                placeholder="Filter"
                className="h-9 rounded-full pl-8"
              />
            </div>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[500px] text-left text-xs">
              <thead className="border-b border-[#edf2ef] text-[10px] font-bold uppercase tracking-widest text-[#9aaca6]">
                <tr>
                  <th className="px-2 py-3">Reference</th>
                  <th className="px-2 py-3">Paper</th>
                  <th className="px-2 py-3">Amount</th>
                  <th className="px-2 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2ef]">
                {filteredPayments.slice(0, 6).map(row => (
                  <tr key={row.payment.providerReference}>
                    <td className="px-2 py-3 font-mono">
                      {row.payment.providerReference}
                    </td>
                    <td className="px-2 py-3 text-[#506c63]">
                      {row.paper!.title}
                    </td>
                    <td className="px-2 py-3 font-medium">
                      KES {Number(row.payment.amountKes).toLocaleString()}
                    </td>
                    <td className="px-2 py-3">
                      <Badge className="border-0 bg-[#e5f2eb] text-[#34745f]">
                        {row.payment.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredPayments.length && (
              <div className="p-6 text-center text-sm text-[#82958e]">
                No transactions match the current filter.
              </div>
            )}
          </div>
          <div className="mt-6 border-t border-[#edf2ef] pt-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#274d43]">
              <Trash2 size={16} className="text-[#a44e49]" /> Permanently remove
              a paper
            </div>
            <p className="mb-3 text-xs leading-5 text-[#82958e]">
              This removes the catalogue record and every user entitlement.
              Payment history is retained for audit.
            </p>
            <div className="space-y-2">
              {papers.data?.slice(0, 10).map(paper => (
                <div
                  key={`delete-${paper.legacyId}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-[#fff8f7] p-3"
                >
                  <span className="min-w-0 truncate text-xs font-semibold text-[#5b3d3b]">
                    {paper.title}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 rounded-full border-[#efc8c5] bg-transparent text-xs text-[#a44e49]"
                    onClick={() => setDeleteConfirmation(paper.legacyId)}
                  >
                    Delete permanently
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 border-t border-[#edf2ef] pt-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#274d43]">
              <FileUp size={16} className="text-[#4b8876]" /> Replace a
              protected paper file
            </div>
            <div className="space-y-3">
              {papers.data?.slice(0, 3).map(paper => (
                <PaperReplacement key={paper.legacyId} paper={paper} />
              ))}
            </div>
          </div>
        </section>
        <section className="rounded-2xl border border-[#dfe9e3] bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <p className="section-eyebrow">Contribution control room</p>
              <h2 className="mt-1 font-serif text-xl font-semibold text-[#173e35]">
                Review & publish
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-[#82958e]">
                Approve once to publish a learner contribution to the free
                catalogue. Rejections stay recorded for moderation history,
                while rejected document bytes are permanently purged from
                GridFS.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="border-0 bg-[#fff4d5] text-[#80631a]">
                {submissionSummary.pending} pending
              </Badge>
              <Badge className="border-0 bg-[#eef9f1] text-[#327452]">
                {submissionSummary.approved} published
              </Badge>
            </div>
          </div>
          <div
            className="mt-5 flex flex-wrap gap-2"
            role="group"
            aria-label="Filter contributed resources"
          >
            {(["pending", "approved", "rejected", "all"] as const).map(
              status => (
                <button
                  key={status}
                  type="button"
                  aria-pressed={submissionFilter === status}
                  onClick={() => setSubmissionFilter(status)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d5146] focus-visible:ring-offset-2 ${submissionFilter === status ? "border-[#1d5146] bg-[#1d5146] text-white" : "border-[#d9e6df] bg-white text-[#58766b] hover:bg-[#f0f7f3]"}`}
                >
                  {status === "all"
                    ? "All resources"
                    : `${status[0].toUpperCase()}${status.slice(1)}`}
                  <span
                    className={
                      submissionFilter === status
                        ? "text-white/75"
                        : "text-[#93aaa1]"
                    }
                  >
                    {submissionSummary[status]}
                  </span>
                </button>
              )
            )}
          </div>
          <div className="mt-5 space-y-3">
            {visibleSubmissions.map((submission: any) => (
              <div
                key={submission.legacyId}
                className="flex flex-col gap-4 rounded-2xl border border-[#e1ebe5] bg-[#f7fbf8] p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-sm font-semibold text-[#274d43]">
                      {submission.title}
                    </div>
                    <Badge
                      className={`border ${submissionStatusStyles[submission.status] ?? "border-[#d9e6df] bg-white text-[#58766b]"}`}
                    >
                      {submission.status}
                    </Badge>
                  </div>
                  <div className="mt-2 text-xs text-[#82958e]">
                    {submission.course} ·{" "}
                    {educationLevelLabel(submission.level)} · {submission.unit}{" "}
                    · {submission.fileName}
                  </div>
                  <div className="mt-1 text-xs text-[#82958e]">
                    Submitted by student {submission.userId}
                    {submission.reviewedBy
                      ? ` · reviewed by ${submission.reviewedBy}`
                      : ""}
                  </div>
                  <div className="mt-2 text-xs font-medium text-[#58766b]">
                    {submission.status === "approved" && submission.paperId
                      ? submission.approvalMode === "automatic"
                        ? "✓ Auto-published after the safety check"
                        : "✓ Published to catalogue and available as free access"
                      : submission.status === "rejected"
                        ? submission.storagePurged
                          ? "Rejected · file permanently purged from GridFS"
                          : "Kept out of the catalogue · decision recorded"
                        : submission.safetyStatus === "held"
                          ? "Held by the safety detector · administrator decision required"
                          : "Awaiting administrator decision"}
                  </div>
                  {submission.safetyReasons?.length > 0 &&
                    submission.status === "pending" && (
                      <p className="mt-1 text-xs text-[#80631a]">
                        Detector note: {submission.safetyReasons.join(" ")}
                      </p>
                    )}
                  {submission.reviewNote && (
                    <p className="mt-1 text-xs italic text-[#82958e]">
                      Note: {submission.reviewNote}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {submission.fileId && !submission.storagePurged && (
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="rounded-full border-[#c8d9d2] bg-white text-[#1d5146]"
                    >
                      <a
                        href={`/api/files/${encodeURIComponent(submission.fileId)}/view`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Eye size={14} /> View document
                      </a>
                    </Button>
                  )}
                  {submission.status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        className="rounded-full bg-[#1d5146]"
                        disabled={reviewSubmission.isPending}
                        onClick={() =>
                          reviewSubmission.mutate({
                            submissionId: submission.legacyId,
                            status: "approved",
                            reviewNote:
                              "Approved and published to the free catalogue.",
                          })
                        }
                      >
                        <Check size={14} /> Approve & publish
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full border-[#efc8c5] bg-transparent text-[#a44e49]"
                        disabled={reviewSubmission.isPending}
                        onClick={() =>
                          reviewSubmission.mutate({
                            submissionId: submission.legacyId,
                            status: "rejected",
                            reviewNote: "Not approved for publication.",
                          })
                        }
                      >
                        <X size={14} /> Reject & purge
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {!visibleSubmissions.length && (
              <div className="rounded-2xl border border-dashed border-[#cdded7] p-8 text-center text-sm text-[#82958e]">
                No{" "}
                {submissionFilter === "all"
                  ? "contributed resources"
                  : `${submissionFilter} resources`}{" "}
                in this view.
              </div>
            )}
          </div>
        </section>
      </div>
      <AlertDialog
        open={deleteConfirmation !== null}
        onOpenChange={open => {
          if (!open && !deletePaper.isPending) setDeleteConfirmation(null);
        }}
      >
        <AlertDialogContent className="border-[#dfe9e3] bg-white text-[#173e35]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl text-[#173e35]">
              Permanently delete this paper?
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-6 text-[#5f786f]">
              {papers.data?.find(paper => paper.legacyId === deleteConfirmation)
                ?.title ?? "This paper"}{" "}
              will be removed from the public catalogue and every user library.
              This action cannot be undone. Payment history remains available
              for audit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deletePaper.isPending}
              className="rounded-full border-[#c8d9d2] bg-transparent text-[#1d5146]"
            >
              Keep paper
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deletePaper.isPending || deleteConfirmation === null}
              className="rounded-full bg-[#a44e49] text-white hover:bg-[#873c38]"
              onClick={event => {
                event.preventDefault();
                if (deleteConfirmation !== null)
                  deletePaper.mutate({
                    paperId: deleteConfirmation,
                    confirmation: "DELETE_PAPER",
                  });
              }}
            >
              {deletePaper.isPending ? "Deleting…" : "Yes, delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
