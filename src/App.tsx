import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DashboardLayout } from "./components/layout/DashboardLayout";
import { Dashboard } from "./pages/Dashboard";
import { CrewManagement } from "./pages/CrewManagement";
import { Vessels } from "./pages/Vessels";
import { VesselDetail } from "./pages/VesselDetail";
import { Itineraries } from "./pages/Itineraries";
import { CrewChanges } from "./pages/CrewChanges";
import { Documents } from "./pages/Documents";
import { Reports } from "./pages/Reports";

const queryClient = new QueryClient();

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route element={<DashboardLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/crew" element={<CrewManagement />} />
              <Route path="/vessels" element={<Vessels />} />
              <Route path="/vessels/:id" element={<VesselDetail />} />
              <Route path="/itineraries" element={<Itineraries />} />
              <Route path="/crew-changes" element={<CrewChanges />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/reports" element={<Reports />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
