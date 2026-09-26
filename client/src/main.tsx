import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from "@shared/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import { installStaleAssetRecovery } from "./lib/staleAssetRecovery";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});
installStaleAssetRecovery();

function installOptionalAnalytics() {
  const endpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT?.trim();
  const websiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID?.trim();
  if (!endpoint || !websiteId || typeof document === "undefined") return;

  let analyticsUrl: URL;
  try {
    analyticsUrl = new URL(endpoint);
  } catch {
    return;
  }
  if (analyticsUrl.protocol !== "https:" && analyticsUrl.protocol !== "http:")
    return;

  analyticsUrl.pathname = `${analyticsUrl.pathname.replace(/\/+$/, "")}/umami`;
  if (
    Array.from(document.scripts).some(
      script => script.dataset.websiteId === websiteId
    )
  )
    return;

  const script = document.createElement("script");
  script.defer = true;
  script.src = analyticsUrl.toString();
  script.dataset.websiteId = websiteId;
  document.head.appendChild(script);
}

installOptionalAnalytics();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  startLogin();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      fetch(input, init) {
        return globalThis
          .fetch(input, {
            ...(init ?? {}),
            credentials: "include",
          })
          .then(async response => {
            const contentType = response.headers.get("content-type") ?? "";
            if (contentType.toLowerCase().includes("application/json"))
              return response;
            return new Response(
              JSON.stringify([
                {
                  error: {
                    json: {
                      message:
                        "The server returned an invalid response. Please try again.",
                      code: -32603,
                      data: {
                        code: "INTERNAL_SERVER_ERROR",
                        httpStatus: response.status || 500,
                      },
                    },
                  },
                },
              ]),
              {
                status: response.status || 500,
                headers: { "content-type": "application/json" },
              }
            );
          });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
