import { useState, useMemo, useCallback } from "react";
import MapGL, { Marker, NavigationControl } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { Globe, Map as MapIcon } from "lucide-react";
import { useCrewStore } from "../../stores/crewStore";
import { useDashboardStore } from "../../stores/dashboardStore";
import { cn } from "../../lib/utils";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const STATUS_COLORS: Record<string, string> = {
  home: "#34D399",
  on_board: "#60A5FA",
  in_transit: "#FBBF24",
  at_airport: "#F97316",
  at_port: "#A78BFA",
};

export function GlobeMap() {
  const { filteredCrew } = useCrewStore();
  const { selectedCrewId, setSelectedCrew } = useDashboardStore();

  const [isGlobe, setIsGlobe] = useState(true);
  const [viewState, setViewState] = useState({
    longitude: 65,
    latitude: 15,
    zoom: 2.2,
    pitch: 0,
  });

  const crewWithLocation = useMemo(
    () => filteredCrew.filter((c) => c.current_location),
    [filteredCrew]
  );

  const toggleProjection = useCallback(() => {
    setIsGlobe((prev) => !prev);
  }, []);

  return (
    <div className="w-full h-full relative bg-bg-deepest rounded-xl overflow-hidden">
      <MapGL
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        projection={{ name: isGlobe ? "globe" : "mercator" }}
        fog={
          isGlobe
            ? {
                range: [0.5, 10],
                color: "#050B18",
                "horizon-blend": 0.08,
                "star-intensity": 0.5,
                "space-color": "#000000",
              }
            : undefined
        }
      >
        <NavigationControl position="bottom-right" showCompass={false} />

        {crewWithLocation.map((crew) => {
          const isSelected = crew.id === selectedCrewId;
          const color = STATUS_COLORS[crew.current_status];
          const coords = crew.current_location!.coordinates;

          return (
            <Marker
              key={crew.id}
              longitude={coords[0]}
              latitude={coords[1]}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setSelectedCrew(crew.id);
              }}
            >
              <div className="relative group cursor-pointer">
                {isSelected && (
                  <div
                    className="absolute -inset-4 rounded-full animate-ping opacity-50"
                    style={{ backgroundColor: color }}
                  />
                )}
                <div
                  className="w-2.5 h-2.5 rounded-full transition-transform duration-300 group-hover:scale-150"
                  style={{
                    backgroundColor: color,
                    boxShadow: `0 0 12px ${color}`,
                    border: isSelected ? "2px solid white" : "none",
                  }}
                />

                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                  <div className="glass-panel px-2 py-1 rounded text-xs font-medium flex items-center gap-2">
                    <span>{crew.full_name}</span>
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  </div>
                </div>
              </div>
            </Marker>
          );
        })}
      </MapGL>

      {/* Globe / Flat Toggle */}
      <div className="absolute top-4 right-4 z-10 flex glass-panel rounded-lg overflow-hidden">
        <button
          onClick={toggleProjection}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono uppercase tracking-wider transition-all",
            isGlobe
              ? "bg-accent-blue/20 text-accent-blue"
              : "text-text-muted hover:text-text-secondary"
          )}
        >
          <Globe className="w-3.5 h-3.5" />
          Globe
        </button>
        <div className="w-px bg-border-divider" />
        <button
          onClick={toggleProjection}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono uppercase tracking-wider transition-all",
            !isGlobe
              ? "bg-accent-blue/20 text-accent-blue"
              : "text-text-muted hover:text-text-secondary"
          )}
        >
          <MapIcon className="w-3.5 h-3.5" />
          Flat
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 glass-panel p-3 rounded-lg flex flex-col gap-2 z-10">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
            />
            <span className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">
              {status.replace("_", " ")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
