import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Admin from "./pages/Admin";
import Library from "./pages/Library";
import PaymentResult from "./pages/PaymentResult";
import Account from "./pages/Account";
import PasswordReset from "./pages/PasswordReset";
import EmailVerification from "./pages/EmailVerification";

function LoginRoute() {
  return <Account initialMode="login" />;
}

function CreateAccountRoute() {
  return <Account initialMode="create" />;
}

function AccountRoute() {
  return <Account />;
}

function AnalyticsTracker() {
  const [location] = useLocation();
  const recordVisit = trpc.analytics.recordVisit.useMutation();
  useEffect(() => {
    try {
      const key = "examvault-analytics-session";
      const existing = sessionStorage.getItem(key);
      const sessionId =
        existing ??
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (!existing) sessionStorage.setItem(key, sessionId);
      recordVisit.mutate({
        sessionId,
        path: location.split(/[?#]/)[0] || "/",
        screen: `${window.innerWidth}x${window.innerHeight}`,
      });
    } catch {
      // Analytics should never block the application when browser storage is unavailable.
    }
  }, [location]);
  return null;
}

function Router() {
  const [location] = useLocation();
  const isAccountFlow =
    /^\/(account(?:\/|$)|login$|signup$|create-account$|reset-password$|verify-email$)/.test(
      location.split("?")[0]
    );
  // Keep account aliases explicit so bookmarks and host-level navigation never fall into the 404 route.
  return (
    <div
      key={location}
      className={isAccountFlow ? "account-route-transition" : undefined}
    >
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/library"} component={Library} />
        <Route path={"/payment-result"} component={PaymentResult} />
        <Route path={"/login"} component={LoginRoute} />
        <Route path={"/signup"} component={CreateAccountRoute} />
        <Route path={"/create-account"} component={CreateAccountRoute} />
        <Route path={"/reset-password"} component={PasswordReset} />
        <Route path={"/verify-email"} component={EmailVerification} />
        <Route path={"/account/login"} component={LoginRoute} />
        <Route path={"/account/create"} component={CreateAccountRoute} />
        <Route path={"/account"} component={AccountRoute} />
        <Route path={"/admin"} component={Admin} />
        <Route path={"/admin/:section"} component={Admin} />
        <Route path={"/404"} component={NotFound} />
        {/* Final fallback route */}
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster />
          <AnalyticsTracker />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
