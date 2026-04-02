import { useState, useMemo, useCallback, useRef } from "react";
import MapGL, { Source, Layer, NavigationControl } from "react-map-gl/mapbox";
import type { MapRef, MapMouseEvent } from "react-map-gl/mapbox";
import type {
  CircleLayerSpecification,
  SymbolLayerSpecification,
  LineLayerSpecification,
} from "mapbox-gl";
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

// Known airport coords for generating arcs (home city -> airport)
const CITY_COORDS: Record<string, [number, number]> = {
  Bangladesh: [90.41, 23.81],
  India: [72.88, 19.08],
  Philippines: [120.98, 14.6],
  Indonesia: [106.85, -6.21],
  Ukraine: [30.74, 46.48],
};


/**
 * Generate intermediate points along a great circle arc.
 * This creates the curved flight path effect on the globe.
 */
function greatCircleArc(
  start: [number, number],
  end: [number, number],
  numPoints = 50
): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const lat1 = toRad(start[1]);
  const lon1 = toRad(start[0]);
  const lat2 = toRad(end[1]);
  const lon2 = toRad(end[0]);

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.pow(Math.sin((lat1 - lat2) / 2), 2) +
          Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon1 - lon2) / 2), 2)
      )
    );

  const points: [number, number][] = [];
  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);
    points.push([toDeg(lon), toDeg(lat)]);
  }
  return points;
}

// Crew dots layer
const crewDotsLayer: CircleLayerSpecification = {
  id: "crew-dots",
  type: "circle",
  source: "crew-positions",
  filter: ["!", ["has", "point_count"]],
  paint: {
    "circle-color": ["get", "color"],
    "circle-radius": [
      "case",
      ["boolean", ["feature-state", "selected"], false],
      8,
      5,
    ],
    "circle-opacity": 0.85,
    "circle-stroke-width": [
      "case",
      ["boolean", ["feature-state", "selected"], false],
      2,
      1,
    ],
    "circle-stroke-color": [
      "case",
      ["boolean", ["feature-state", "selected"], false],
      "#ffffff",
      ["get", "color"],
    ],
    "circle-stroke-opacity": 0.5,
  },
};

// Cluster circles
const clusterLayer: CircleLayerSpecification = {
  id: "crew-clusters",
  type: "circle",
  source: "crew-positions",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": "#2b6cff",
    "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 50, 32],
    "circle-opacity": 0.7,
    "circle-stroke-width": 2,
    "circle-stroke-color": "#60A5FA",
  },
};

// Cluster count labels
const clusterCountLayer: SymbolLayerSpecification = {
  id: "cluster-count",
  type: "symbol",
  source: "crew-positions",
  filter: ["has", "point_count"],
  layout: {
    "text-field": "{point_count_abbreviated}",
    "text-size": 13,
  },
  paint: { "text-color": "#ffffff" },
};

// Flight arc line style
const flightArcLayer: LineLayerSpecification = {
  id: "flight-arcs",
  type: "line",
  source: "flight-arcs",
  paint: {
    "line-color": "#FBBF24",
    "line-width": 1.5,
    "line-opacity": 0.6,
    "line-dasharray": [2, 3],
  },
};

// Flight arc glow
const flightArcGlowLayer: LineLayerSpecification = {
  id: "flight-arcs-glow",
  type: "line",
  source: "flight-arcs",
  paint: {
    "line-color": "#FBBF24",
    "line-width": 4,
    "line-opacity": 0.15,
    "line-blur": 3,
  },
};

export function GlobeMap() {
  const mapRef = useRef<MapRef>(null);
  const { filteredCrew } = useCrewStore();
  const { setSelectedCrew } = useDashboardStore();

  const [isGlobe, setIsGlobe] = useState(true);
  const [viewState, setViewState] = useState({
    longitude: 65,
    latitude: 15,
    zoom: 2.2,
    pitch: 0,
  });
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    name: string;
    color: string;
    status: string;
  } | null>(null);

  // Build crew positions GeoJSON
  const geojson = useMemo(() => {
    const features = filteredCrew
      .filter((c) => c.lat != null && c.lng != null)
      .map((c) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [c.lng!, c.lat!],
        },
        properties: {
          id: c.id,
          name: c.full_name,
          status: c.current_status,
          color: STATUS_COLORS[c.current_status] || "#888",
          rank: c.rank || "",
          vessel: c.vessel_name || "",
        },
      }));
    return { type: "FeatureCollection" as const, features };
  }, [filteredCrew]);

  // Build flight arcs for in_transit and at_airport crew
  const flightArcs = useMemo(() => {
    const features = filteredCrew
      .filter(
        (c) =>
          (c.current_status === "in_transit" || c.current_status === "at_airport") &&
          c.lat != null &&
          c.lng != null &&
          c.nationality
      )
      .map((c) => {
        // Origin: crew's home country capital airport
        const origin = CITY_COORDS[c.nationality!] || CITY_COORDS["Bangladesh"];
        const destination: [number, number] = [c.lng!, c.lat!];

        // Only draw if origin != destination (more than 2 degrees apart)
        const dist = Math.abs(origin[0] - destination[0]) + Math.abs(origin[1] - destination[1]);
        if (dist < 2) return null;

        const arcPoints = greatCircleArc(origin, destination, 40);

        return {
          type: "Feature" as const,
          geometry: {
            type: "LineString" as const,
            coordinates: arcPoints,
          },
          properties: {
            id: c.id,
            name: c.full_name,
            status: c.current_status,
          },
        };
      })
      .filter(Boolean);

    return { type: "FeatureCollection" as const, features };
  }, [filteredCrew]);

  const onClick = useCallback(
    (e: MapMouseEvent) => {
      const feature = e.features?.[0];
      if (feature?.properties?.id) {
        setSelectedCrew(feature.properties.id as string);
      }
    },
    [setSelectedCrew]
  );

  const onMouseEnter = useCallback((e: MapMouseEvent) => {
    const feature = e.features?.[0];
    if (feature?.properties) {
      const map = mapRef.current?.getMap();
      if (map) map.getCanvas().style.cursor = "pointer";
      setHoverInfo({
        x: e.point.x,
        y: e.point.y,
        name: feature.properties.name as string,
        color: feature.properties.color as string,
        status: feature.properties.status as string,
      });
    }
  }, []);

  const onMouseLeave = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map) map.getCanvas().style.cursor = "";
    setHoverInfo(null);
  }, []);

  return (
    <div className="w-full h-full relative bg-bg-deepest rounded-xl overflow-hidden">
      <MapGL
        ref={mapRef}
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
        interactiveLayerIds={["crew-dots"]}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <NavigationControl position="bottom-right" showCompass={false} />

        {/* Flight arcs — dashed yellow lines from origin to current location */}
        <Source id="flight-arcs" type="geojson" data={flightArcs as any}>
          <Layer {...flightArcGlowLayer} />
          <Layer {...flightArcLayer} />
        </Source>

        {/* Crew position dots */}
        <Source
          id="crew-positions"
          type="geojson"
          data={geojson}
          cluster={true}
          clusterMaxZoom={8}
          clusterRadius={40}
        >
          <Layer {...clusterLayer} />
          <Layer {...clusterCountLayer} />
          <Layer {...crewDotsLayer} />
        </Source>
      </MapGL>

      {/* Hover tooltip */}
      {hoverInfo && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{ left: hoverInfo.x + 12, top: hoverInfo.y - 12 }}
        >
          <div className="glass-panel px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2.5 shadow-lg">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                backgroundColor: hoverInfo.color,
                boxShadow: `0 0 6px ${hoverInfo.color}`,
              }}
            />
            <span className="text-white">{hoverInfo.name}</span>
            <span className="text-[10px] font-mono text-text-muted uppercase">
              {hoverInfo.status.replace("_", " ")}
            </span>
          </div>
        </div>
      )}

      {/* Globe / Flat Toggle */}
      <div className="absolute top-4 right-4 z-10 flex glass-panel rounded-lg overflow-hidden">
        <button
          onClick={() => setIsGlobe(true)}
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
          onClick={() => setIsGlobe(false)}
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
        <div className="flex items-center gap-2 mt-1 pt-1 border-t border-border-divider">
          <div className="w-5 h-px bg-[#FBBF24]" style={{ backgroundImage: "repeating-linear-gradient(90deg, #FBBF24 0, #FBBF24 4px, transparent 4px, transparent 8px)" }} />
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-secondary">
            Flight Route
          </span>
        </div>
      </div>
    </div>
  );
}
