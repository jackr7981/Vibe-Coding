import { create } from "zustand";
import type { DashboardStats } from "../lib/types";

interface DashboardState {
  selectedCrewId: string | null;
  sidebarOpen: boolean;
  stats: DashboardStats | null;
  statsLoading: boolean;
  setSelectedCrew: (id: string | null) => void;
  toggleSidebar: () => void;
  setStats: (stats: DashboardStats) => void;
  setStatsLoading: (loading: boolean) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  selectedCrewId: null,
  sidebarOpen: true,
  stats: null,
  statsLoading: false,

  setSelectedCrew: (id) => set({ selectedCrewId: id }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setStats: (stats) => set({ stats, statsLoading: false }),
  setStatsLoading: (loading) => set({ statsLoading: loading }),
}));
