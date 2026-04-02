import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

export const STATUS_COLORS: Record<string, string> = {
  home: "#4ade80",
  in_transit: "#facc15",
  on_board: "#60a5fa",
  at_airport: "#f97316",
  at_port: "#a78bfa",
};

export const STATUS_LABELS: Record<string, string> = {
  home: "At Home",
  in_transit: "In Transit",
  on_board: "On Board",
  at_airport: "At Airport",
  at_port: "At Port",
};

export default mapboxgl;
