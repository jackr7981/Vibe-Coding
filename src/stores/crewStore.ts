import { create } from "zustand";
import type { CrewMember, CrewStatus } from "../lib/types";

interface CrewFilters {
  status: CrewStatus | "all";
  search: string;
  vesselId: string | "all";
}

interface CrewState {
  crew: CrewMember[];
  filters: CrewFilters;
  filteredCrew: CrewMember[];
  setCrew: (crew: CrewMember[]) => void;
  updateCrewMember: (updated: CrewMember) => void;
  setFilters: (filters: Partial<CrewFilters>) => void;
}

function applyFilters(crew: CrewMember[], filters: CrewFilters): CrewMember[] {
  return crew.filter((c) => {
    if (filters.status !== "all" && c.current_status !== filters.status) return false;
    if (filters.vesselId !== "all" && c.assigned_vessel_id !== filters.vesselId) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      return (
        c.full_name.toLowerCase().includes(q) ||
        c.employee_id.toLowerCase().includes(q) ||
        c.rank?.toLowerCase().includes(q) ||
        c.nationality?.toLowerCase().includes(q)
      );
    }
    return true;
  });
}

export const useCrewStore = create<CrewState>((set, get) => ({
  crew: [],
  filters: { status: "all", search: "", vesselId: "all" },
  filteredCrew: [],

  setCrew: (crew) => {
    set({ crew, filteredCrew: applyFilters(crew, get().filters) });
  },

  updateCrewMember: (updated) => {
    const crew = get().crew.map((c) => (c.id === updated.id ? { ...c, ...updated } : c));
    set({ crew, filteredCrew: applyFilters(crew, get().filters) });
  },

  setFilters: (partial) => {
    const filters = { ...get().filters, ...partial };
    set({ filters, filteredCrew: applyFilters(get().crew, filters) });
  },
}));
