import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { educationLevelLabel } from "@shared/educationLevels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import RouteProgress from "@/components/RouteProgress";
import {
  ArrowLeft,
  BookOpen,
  Download,
  Eye,
  FileText,
  LockKeyhole,
  Receipt,
  UserRound,
} from "lucide-react";

function LibraryLoading({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-[#f7f8f6] text-[#19312c]">
      <RouteProgress visible label={label} />
      <main className="container py-12 md:py-16">
        <div className="account-reveal">
          <span className="account-skeleton-line h-3 w-28" />
          <span className="account-skeleton-line mt-4 h-10 w-64" />
          <span className="account-skeleton-line mt-3 h-4 w-80 max-w-full" />
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="account-content-loading rounded-2xl border border-[#dfe9e3] bg-white p-6">
            <span className="account-skeleton-line h-4 w-40" />
            <span className="account-skeleton-line mt-5 h-12 w-full" />
            <span className="account-skeleton-line mt-3 h-3 w-2/3" />
          </div>
          <div className="account-content-loading rounded-2xl border border-[#dfe9e3] bg-white p-6">
            <span className="account-skeleton-line h-4 w-40" />
            <span className="account-skeleton-line mt-5 h-12 w-full" />
            <span className="account-skeleton-line mt-3 h-3 w-2/3" />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function Library() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const library = trpc.student.library.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const orders = trpc.student.orders.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  if (authLoading)
    return <LibraryLoading label="Checking your account access…" />;
  if (!isAuthenticated)
    return (
      <div className="grid min-h-screen place-items-center bg-[#f7f8f6] p-6 text-center account-route-shell">
        <div className="account-panel-transition">
          <LockKeyhole className="mx-auto h-12 w-12 text-[#b88327]" />
          <h1 className="mt-5 font-serif text-3xl font-semibold text-[#173e35]">
            Your library is private
          </h1>
          <p className="mt-2 text-sm text-[#718780]">
            Sign in to view purchased papers and secure downloads.
          </p>
          <Button
            className="mt-6 rounded-full bg-[#1d5146]"
            onClick={() => startLogin()}
          >
            Student sign in
          </Button>
        </div>
      </div>
    );
  const dataLoading = library.isLoading || orders.isLoading;
  return (
    <div className="min-h-screen bg-[#f7f8f6] text-[#19312c] account-route-shell">
      <RouteProgress
        visible={dataLoading}
        label="Loading your library resources…"
      />
      <header className="border-b border-[#dce6e1] bg-white">
        <div className="container flex h-20 items-center justify-between">
          <a
            href="/"
            className="flex items-center gap-2 text-sm font-semibold text-[#1d5146]"
          >
            <ArrowLeft size={16} /> Back to catalogue
          </a>
          <div className="flex items-center gap-3 text-sm text-[#668078]">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-[#e8f1ed] text-[#2d7965]">
              <UserRound size={16} />
            </div>
            <span className="hidden sm:inline">
              {user?.name || user?.email || "Student"}
            </span>
          </div>
        </div>
      </header>
      <main className="container py-12 md:py-16">
        <div className="account-reveal">
          <p className="section-eyebrow">Student account</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight text-[#173e35]">
            My library
          </h1>
          <p className="mt-3 text-[#718780]">
            Your purchased papers, available only to this authenticated account.
          </p>
        </div>
        <section className="mt-10 account-reveal account-reveal-delay-1">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-2xl font-semibold text-[#173e35]">
              Unlocked papers
            </h2>
            <Badge className="border-0 bg-[#e5f2eb] text-[#34745f]">
              {library.data?.length ?? 0} papers
            </Badge>
          </div>
          {library.isLoading ? (
            <div className="rounded-2xl border border-[#dfe9e3] bg-white p-8">
              <div className="flex items-center gap-2 text-sm text-[#718780]">
                <span className="account-spinner inline-flex">
                  <FileText size={16} />
                </span>{" "}
                Preparing your secure downloads…
              </div>
            </div>
          ) : library.data?.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {library.data
                .filter(item => item.paper)
                .map(item => (
                  <div
                    key={item.entitlement.legacyId}
                    className="account-resource-card flex items-center justify-between rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e8f1ed] text-[#2d7965]">
                        <FileText size={19} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate font-medium text-[#274d43]">
                          {item.paper!.title}
                        </h3>
                        <p className="mt-1 text-xs text-[#82958e]">
                          {item.paper!.unit} ·{" "}
                          {educationLevelLabel(item.paper!.level)}
                        </p>
                      </div>
                    </div>
                    <div className="ml-3 flex shrink-0 items-center gap-2">
                      <a
                        href={`/api/papers/${item.paper!.legacyId}/view`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#c8d9d2] bg-white px-3 py-2 text-xs font-semibold text-[#1d5146] transition hover:bg-[#e8f1ed]"
                      >
                        <Eye size={14} /> View
                      </a>
                      <a
                        href={`/api/papers/${item.paper!.legacyId}/download`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#1d5146] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#153c34]"
                      >
                        <Download size={14} /> Download
                      </a>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="account-empty-state rounded-2xl border border-dashed border-[#cdded7] bg-white p-10 text-center">
              <BookOpen className="mx-auto h-9 w-9 text-[#9bb9ab]" />
              <p className="mt-4 text-sm text-[#718780]">
                No papers unlocked yet. Explore the catalogue to get started.
              </p>
              <a href="/#catalogue">
                <Button className="mt-5 rounded-full bg-[#1d5146]">
                  Browse catalogue
                </Button>
              </a>
            </div>
          )}
        </section>
        <section className="mt-12 account-reveal account-reveal-delay-2">
          <div className="mb-4 flex items-center gap-2">
            <Receipt size={17} className="text-[#4b8876]" />
            <h2 className="font-serif text-2xl font-semibold text-[#173e35]">
              Purchase history
            </h2>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-[#dfe9e3] bg-white shadow-sm">
            {orders.isLoading ? (
              <div className="p-8 text-sm text-[#718780]">
                Loading your payment records…
              </div>
            ) : (
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-[#edf2ef] text-[10px] font-bold uppercase tracking-[0.15em] text-[#9aaca6]">
                  <tr>
                    <th className="px-5 py-4">Reference</th>
                    <th className="px-5 py-4">Paper</th>
                    <th className="px-5 py-4">Amount</th>
                    <th className="px-5 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2ef]">
                  {orders.data
                    ?.filter(item => item.paper)
                    .map(item => (
                      <tr key={item.order.legacyId} className="text-[#506c63]">
                        <td className="px-5 py-4 font-mono text-xs">
                          {item.order.reference}
                        </td>
                        <td className="px-5 py-4">{item.paper!.title}</td>
                        <td className="px-5 py-4">
                          KES {Number(item.order.amountKes).toLocaleString()}
                        </td>
                        <td className="px-5 py-4">
                          <Badge className="border-0 bg-[#e5f2eb] text-[#34745f]">
                            {item.order.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
            {!orders.isLoading && !orders.data?.length && (
              <div className="p-8 text-center text-sm text-[#718780]">
                Purchase references will appear here after checkout.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
