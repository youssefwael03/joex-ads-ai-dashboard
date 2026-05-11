import { Suspense, lazy } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import NotFound from "@/pages/not-found";

const Landing = lazy(() => import("@/pages/Landing"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const AdSets = lazy(() => import("@/pages/AdSets"));
const Ads = lazy(() => import("@/pages/Ads"));
const AIInsights = lazy(() => import("@/pages/AIInsights"));
const AIAssistant = lazy(() => import("@/pages/AIAssistant"));
const Creatives = lazy(() => import("@/pages/Creatives"));
const Instagram = lazy(() => import("@/pages/Instagram"));
const Leads = lazy(() => import("@/pages/Leads"));
const Catalog = lazy(() => import("@/pages/Catalog"));
const Alerts = lazy(() => import("@/pages/Alerts"));
const Reports = lazy(() => import("@/pages/Reports"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function LoadingFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Switch>
        <Route path="/" component={Landing} />
        <Route>
          <AppLayout>
            <Suspense fallback={<LoadingFallback />}>
              <Switch>
                <Route path="/dashboard" component={Dashboard} />
                <Route path="/campaigns" component={Campaigns} />
                <Route path="/adsets" component={AdSets} />
                <Route path="/ads" component={Ads} />
                <Route path="/ai-insights" component={AIInsights} />
                <Route path="/ai-assistant" component={AIAssistant} />
                <Route path="/creatives" component={Creatives} />
                <Route path="/instagram" component={Instagram} />
                <Route path="/leads" component={Leads} />
                <Route path="/catalog" component={Catalog} />
                <Route path="/alerts" component={Alerts} />
                <Route path="/reports" component={Reports} />
                <Route component={NotFound} />
              </Switch>
            </Suspense>
          </AppLayout>
        </Route>
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster theme="dark" position="top-right" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
