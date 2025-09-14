import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/hooks/use-theme.jsx";
import Layout from "./components/layout/Layout";
import Dashboard from "./pages/Dashboard";
import Upload from "./pages/Upload";
import Leaderboard from "./pages/Leaderboard";
import Analytics from "./pages/Analytics";
import SystemStatus from "./pages/SystemStatus";
import BatchStatus from "./pages/BatchStatus";
import AgentDetail from "./pages/AgentDetail";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="dark" storageKey="agenteval-ui-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/upload" element={<Upload />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/status" element={<SystemStatus />} />
              <Route path="/batch/:batchId" element={<BatchStatus />} />
              <Route path="/agent/:agentId" element={<AgentDetail />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
