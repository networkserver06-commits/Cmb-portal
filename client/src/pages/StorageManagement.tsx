import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Database,
  Eye,
  FileCheck2,
  Loader2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import RouteProgress from "@/components/RouteProgress";
import { trpc } from "@/lib/trpc";
import StorageTooltip from "@/components/StorageTooltip";

const statusLabel = {
  protected: "Protected",
  recent: "Recent upload",
  temporary: "Temporary submission",
  orphaned: "Orphaned / eligible",
} as const;

export default function StorageManagement() {
  const inventory = trpc.admin.storageAudit.useQuery();
  const utils = trpc.useUtils();
  const cleanup = trpc.admin.cleanupStorage.useMutation({
    onSuccess: () => {
      setSelected([]);
      void utils.admin.storageAudit.invalidate();
    },
  });
  const [selected, setSelected] = useState<string[]>([]);
  const items = inventory.data?.items ?? [];
  const candidates = useMemo(
    () =>
      items.filter(
        item =>
          item.cleanupEligible &&
          item.status === "orphaned" &&
          item.referenceCount === 0
      ),
    [items]
  );
  const selectedCandidates = selected.filter(key =>
    candidates.some(item => item.key === key)
  );

  const toggle = (key: string) =>
    setSelected(current =>
      current.includes(key)
        ? current.filter(item => item !== key)
        : [...current, key]
    );
  const selectAll = () =>
    setSelected(
      selectedCandidates.length === candidates.length
        ? []
        : candidates.map(item => item.key)
    );
  const remove = () => {
    if (!selectedCandidates.length) return;
    if (
      !window.confirm(
        `Permanently unlink ${selectedCandidates.length} unused file reference${selectedCandidates.length === 1 ? "" : "s"}? Referenced exam papers are protected.`
      )
    )
      return;
    cleanup.mutate({
      keys: selectedCandidates,
      confirmation: "DELETE_UNUSED_FILES",
    });
  };

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-[#dfe9e3] bg-white shadow-sm">
      <div className="border-b border-[#edf2ef] p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f1ed] text-[#2d7965]">
              <Database size={18} />
            </div>
            <div>
              <p className="section-eyebrow">Storage operations</p>
              <h2 className="mt-1 font-serif text-xl font-semibold text-[#173e35]">
                File health and cleanup
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-[#82958e]">
                Audit known uploads across papers and student submissions.
                Active references are protected; only unreferenced objects older
                than {inventory.data?.retentionDays ?? 7} days can be
                permanently unlinked.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="border-0 bg-[#e5f2eb] text-[#34745f]">
              {inventory.data?.totals.protected ?? 0} protected
            </Badge>
            <Badge className="border-0 bg-[#fff4d5] text-[#94701d]">
              {inventory.data?.totals.orphaned ?? 0} candidates
            </Badge>
          </div>
        </div>
      </div>
      <RouteProgress
        visible={inventory.isLoading}
        label="Auditing storage references…"
      />
      <div className="grid gap-4 border-b border-[#edf2ef] p-6 sm:grid-cols-3">
        <div className="rounded-xl bg-[#f5f9f6] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#789087]">
            <FileCheck2 size={15} /> Known files
          </div>
          <div className="mt-3 text-2xl font-semibold text-[#173e35]">
            {inventory.data?.totals.known ?? 0}
          </div>
        </div>
        <div className="rounded-xl bg-[#f5f9f6] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#789087]">
            <ShieldCheck size={15} /> Protected
          </div>
          <div className="mt-3 text-2xl font-semibold text-[#173e35]">
            {inventory.data?.totals.protected ?? 0}
          </div>
        </div>
        <div className="rounded-xl bg-[#fff9e8] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#94701d]">
            <Trash2 size={15} /> Eligible cleanup
          </div>
          <div className="mt-3 text-2xl font-semibold text-[#7a5b16]">
            {inventory.data?.totals.orphaned ?? 0}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3 border-b border-[#edf2ef] bg-[#fbfdfb] px-6 py-4 text-xs text-[#718780] md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[#b88327]" />
          <span>
            Cleanup permanently removes the portal’s MongoDB reference and
            audit-tracks the action. The current storage adapter does not expose
            physical S3 deletion; use provider retention/versioning controls for
            byte-level removal.
          </span>
        </div>
        <div className="flex shrink-0 gap-2">
          <StorageTooltip
            label={
              candidates.length
                ? "Select every unreferenced file that has passed the retention window."
                : "No eligible unreferenced files are available for selection."
            }
          >
            <Button
              variant="outline"
              size="sm"
              aria-label="Select all eligible storage files"
              className="rounded-full border-[#d9e6df] bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-[#8fb2a4] hover:bg-[#f2f7f4]"
              onClick={selectAll}
              disabled={!candidates.length}
            >
              {selectedCandidates.length === candidates.length
                ? "Clear selection"
                : "Select all eligible"}
            </Button>
          </StorageTooltip>
          <StorageTooltip label="Unlink selected eligible files from MongoDB. Referenced exam materials are always protected; physical object deletion requires provider controls.">
            <Button
              size="sm"
              aria-label="Permanently unlink selected storage references"
              className="rounded-full bg-[#a44e49] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#873c38] hover:shadow-md"
              onClick={remove}
              disabled={!selectedCandidates.length || cleanup.isPending}
            >
              {cleanup.isPending && (
                <Loader2 className="account-spinner" size={14} />
              )}
              {cleanup.isPending ? "Unlinking…" : "Permanently unlink selected"}
            </Button>
          </StorageTooltip>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="border-b border-[#edf2ef] text-[10px] font-bold uppercase tracking-[0.15em] text-[#9aaca6]">
            <tr>
              <th className="w-12 px-6 py-4" />
              <th className="px-3 py-4">File</th>
              <th className="px-3 py-4">Document</th>
              <th className="px-3 py-4">Origin</th>
              <th className="px-3 py-4">References</th>
              <th className="px-3 py-4">Age</th>
              <th className="px-3 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf2ef]">
            {inventory.isLoading ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-6 py-10 text-center text-sm text-[#82958e]"
                >
                  Preparing storage inventory…
                </td>
              </tr>
            ) : (
              items.slice(0, 40).map(item => (
                <tr
                  key={item.key}
                  className="text-[#506c63] transition-colors duration-200 hover:bg-[#f7fbf8]"
                >
                  <td className="px-6 py-3">
                    {item.cleanupEligible && item.status === "orphaned" && (
                      <input
                        type="checkbox"
                        title="Select this unreferenced cleanup candidate"
                        aria-label={`Select ${item.fileName || item.key}`}
                        checked={selected.includes(item.key)}
                        onChange={() => toggle(item.key)}
                        className="h-4 w-4 accent-[#1d5146]"
                      />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div
                      className="max-w-[280px] truncate font-medium text-[#274d43]"
                      title={item.key}
                    >
                      {item.fileName || item.key}
                    </div>
                    <div className="mt-1 max-w-[280px] truncate font-mono text-[10px] text-[#9aaca6]">
                      {item.key}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <a
                      href={`/api/files/${encodeURIComponent(item.key)}/view`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`View document ${item.fileName || item.key}`}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#c8d9d2] px-3 py-1.5 font-semibold text-[#1d5146] transition hover:bg-[#f5f9f6]"
                    >
                      <Eye size={13} /> View document
                    </a>
                  </td>
                  <td className="px-3 py-3 capitalize">{item.origin}</td>
                  <td className="px-3 py-3">
                    {item.referenceCount ? (
                      <span title={item.references.join(", ")}>
                        {item.referenceCount} protected
                      </span>
                    ) : (
                      "None"
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {item.createdAt ? `${item.ageDays} days` : "Unknown"}
                  </td>
                  <td className="px-3 py-3">
                    <Badge
                      className={`border-0 ${item.status === "protected" ? "bg-[#e5f2eb] text-[#34745f]" : item.status === "recent" || item.status === "temporary" ? "bg-[#edf2f5] text-[#607887]" : "bg-[#fff4d5] text-[#94701d]"}`}
                    >
                      {statusLabel[item.status]}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {!inventory.isLoading && !items.length && (
          <div className="p-10 text-center text-sm text-[#82958e]">
            No tracked uploads yet. New paper and submission uploads will appear
            here automatically.
          </div>
        )}
      </div>
      {cleanup.error && (
        <div
          role="alert"
          className="border-t border-[#efc8c5] bg-[#fff4f3] px-6 py-3 text-xs text-[#a44e49]"
        >
          {cleanup.error.message}
        </div>
      )}
      <div className="border-t border-[#edf2ef] px-6 py-4 text-[11px] leading-5 text-[#9aaca6]">
        Last audited{" "}
        {inventory.data?.generatedAt
          ? new Date(inventory.data.generatedAt).toLocaleString()
          : "not yet"}
        . Protected means at least one paper or submission still points to the
        file key, including paid and free published materials.
      </div>
    </section>
  );
}
