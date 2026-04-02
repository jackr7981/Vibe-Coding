import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useDashboardStore } from "../../stores/dashboardStore";

export function DashboardLayout() {
  const { sidebarOpen } = useDashboardStore();

  return (
    <div className="h-screen flex bg-gray-950 text-white overflow-hidden">
      {sidebarOpen && <Sidebar />}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
