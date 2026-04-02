import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { useCrewRealtime } from "../hooks/useCrewRealtime";
import { useDashboardStats } from "../hooks/useDashboardStats";
import { Header } from "../components/layout/Header";
import { GlobeMap } from "../components/map/GlobeMap";
import { StatCards } from "../components/stats/StatCards";
import { CrewList } from "../components/crew/CrewList";
import { CrewDetail } from "../components/crew/CrewDetail";
import { ActivityFeed } from "../components/feed/ActivityFeed";
import { TicketUploadModal } from "../components/tickets/TicketUpload";
import { AlertBanner } from "../components/alerts/AlertBanner";
import { AlertPanel } from "../components/alerts/AlertPanel";
import { useDashboardStore } from "../stores/dashboardStore";

export function Dashboard() {
  useCrewRealtime();
  useDashboardStats();

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isAlertPanelOpen, setIsAlertPanelOpen] = useState(false);
  const selectedCrewId = useDashboardStore((s) => s.selectedCrewId);

  return (
    <>
      <Header onUploadClick={() => setIsUploadModalOpen(true)} />
      <AlertBanner onOpenPanel={() => setIsAlertPanelOpen(true)} />

      <main className="flex-1 overflow-hidden p-4 flex flex-col gap-4">
        <StatCards />

        <div className="flex-1 flex gap-4 overflow-hidden">
          <div className="flex-1 glass-panel rounded-xl overflow-hidden relative shadow-2xl">
            <GlobeMap />
            <AnimatePresence>
              {selectedCrewId && <CrewDetail />}
            </AnimatePresence>
          </div>

          <div className="w-80 flex flex-col gap-4 shrink-0 overflow-hidden">
            <CrewList />
            <ActivityFeed />
          </div>
        </div>
      </main>

      <TicketUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
      />
      <AlertPanel
        isOpen={isAlertPanelOpen}
        onClose={() => setIsAlertPanelOpen(false)}
      />
    </>
  );
}
