import { cn } from "@/lib/utils";
import {
  clearAssetRecoveryAttempt,
  isStaleAssetError,
  markAssetRecoveryAttempt,
} from "@/lib/staleAssetRecovery";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    if (isStaleAssetError(error) && markAssetRecoveryAttempt()) {
      window.location.reload();
    }
  }

  reload = () => {
    clearAssetRecoveryAttempt();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const staleAsset = isStaleAssetError(this.state.error);
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#f7f8f6] p-6 text-[#19312c]">
          <div className="flex w-full max-w-xl flex-col items-center rounded-3xl border border-[#dfe9e3] bg-white p-8 text-center shadow-sm md:p-10">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#fff4df] text-[#8a641c]">
              <AlertTriangle size={28} />
            </div>

            <h2 className="mt-5 font-serif text-2xl font-semibold text-[#173e35]">
              {staleAsset ? "ScholarShelf needs a quick refresh." : "Something interrupted ScholarShelf."}
            </h2>

            <p className="mt-3 max-w-md text-sm leading-6 text-[#718780]">
              {staleAsset
                ? "This page opened an older application file after an update. Refreshing loads the current version without changing your account or saved resources."
                : "The page could not finish loading. Refresh the workspace and try again. If the issue continues, contact support."}
            </p>

            {!staleAsset && this.state.error?.stack && (
              <details className="mt-5 w-full rounded-2xl bg-[#f5f9f6] p-4 text-left">
                <summary className="cursor-pointer text-xs font-semibold text-[#58766b]">
                  Technical details
                </summary>
                <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-[#718780]">
                  {this.state.error.stack}
                </pre>
              </details>
            )}

            <button
              type="button"
              onClick={this.reload}
              className={cn(
                "mt-6 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition hover:-translate-y-0.5",
                "bg-[#1d5146] text-white hover:bg-[#153c34] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d5146] focus-visible:ring-offset-2"
              )}
            >
              <RotateCcw size={16} />
              Refresh workspace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
