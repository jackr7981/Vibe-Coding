import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function DashboardLayout() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg-deepest bg-noise text-text-primary font-sans selection:bg-accent-blue/30">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden relative z-10">
        <Outlet />
      </div>
    </div>
  );
}
