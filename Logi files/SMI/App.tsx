import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import Dashboard from "@/pages/Dashboard";
import RisquesPage from "@/pages/planification/RisquesPage";
import ObjectifsPage from "@/pages/planification/ObjectifsPage";
import DocumentsPage from "@/pages/support/DocumentsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/planification/risques" element={<RisquesPage />} />
            <Route path="/planification/objectifs" element={<ObjectifsPage />} />
            <Route path="/support/documents" element={<DocumentsPage />} />
            {/* Placeholder routes for other modules */}
            <Route path="/contexte/*" element={<Dashboard />} />
            <Route path="/leadership/*" element={<Dashboard />} />
            <Route path="/planification/*" element={<Dashboard />} />
            <Route path="/support/*" element={<Dashboard />} />
            <Route path="/realisation/*" element={<Dashboard />} />
            <Route path="/evaluation/*" element={<Dashboard />} />
            <Route path="/amelioration/*" element={<Dashboard />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
