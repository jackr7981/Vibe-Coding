import { Bell, Search, Menu } from "lucide-react";
import { useDashboardStore } from "../../stores/dashboardStore";
import { useCrewStore } from "../../stores/crewStore";

export function Header() {
  const { toggleSidebar } = useDashboardStore();
  const { setFilters } = useCrewStore();

  return (
    <header className="h-14 bg-gray-900/80 backdrop-blur border-b border-gray-800 flex items-center px-4 gap-4">
      <button
        onClick={toggleSidebar}
        className="text-gray-400 hover:text-white lg:hidden"
      >
        <Menu size={20} />
      </button>

      <div className="flex-1 relative max-w-md">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
        />
        <input
          type="text"
          placeholder="Search crew, vessels..."
          onChange={(e) => setFilters({ search: e.target.value })}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      <button className="relative text-gray-400 hover:text-white">
        <Bell size={20} />
        <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
      </button>
    </header>
  );
}
