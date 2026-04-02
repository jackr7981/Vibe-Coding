import { AnimatePresence } from "motion/react";
import { useCrewRealtime } from "../hooks/useCrewRealtime";
import { useDashboardStats } from "../hooks/useDashboardStats";
import { Header } from "../components/layout/Header";
import { GlobeMap } from "../components/map/GlobeMap";
import { StatCards } from "../components/stats/StatCards";
import { CrewList } from "../components/crew/CrewList";
import { CrewDetail } from "../components/crew/CrewDetail";
import { AiChat } from "../components/crew/AiChat";
import { AlertBanner } from "../components/alerts/AlertBanner";
import { AlertPanel } from "../components/alerts/AlertPanel";
import { useDashboardStore } from "../stores/dashboardStore";
import { useState } from "react";

export function Dashboard() {
  useCrewRealtime();
  useDashboardStats();

  const [isAlertPanelOpen, setIsAlertPanelOpen] = useState(false);
  const selectedCrewId = useDashboardStore((s) => s.selectedCrewId);

  return (
    <>
      <Header />
      <AlertBanner onOpenPanel={() => setIsAlertPanelOpen(true)} />

      <main className="flex-1 overflow-hidden p-4 flex flex-col gap-3">
        <StatCards />

        <div className="flex-1 flex gap-4 overflow-hidden">
          {/* Globe — Activity feed overlay is rendered inside GlobeMap */}
          <div className="flex-1 glass-panel rounded-xl overflow-hidden relative shadow-2xl">
            <GlobeMap />
            <AnimatePresence>
              {selectedCrewId && <CrewDetail />}
            </AnimatePresence>
          </div>

          {/* Right sidebar: AI chat + crew list */}
          <div className="w-72 flex flex-col gap-3 shrink-0 overflow-hidden">
            <AiChat />
            <CrewList />
          </div>
        </div>
      </main>

      <AlertPanel
        isOpen={isAlertPanelOpen}
        onClose={() => setIsAlertPanelOpen(false)}
      />
    </>
  );
}
