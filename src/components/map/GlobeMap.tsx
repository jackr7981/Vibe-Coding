import { useState, useMemo, useCallback, useRef, useEffect } from "react";
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

// Home country airport coords for generating flight arcs
const CITY_COORDS: Record<string, [number, number]> = {
  Bangladesh: [90.41, 23.81],
  India: [72.88, 19.08],
  Philippines: [120.98, 14.6],
  Indonesia: [106.85, -6.21],
  Ukraine: [30.74, 46.48],
};

/** Great circle arc interpolation for curved flight paths */
function greatCircleArc(
  start: [number, number],
  end: [number, number],
  numPoints = 50
): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(start[1]), lon1 = toRad(start[0]);
  const lat2 = toRad(end[1]), lon2 = toRad(end[0]);
  const d = 2 * Math.asin(Math.sqrt(
    Math.pow(Math.sin((lat1 - lat2) / 2), 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lon1 - lon2) / 2), 2)
  ));
  if (d < 0.001) return [start, end];
  const points: [number, number][] = [];
  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    points.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  return points;
}

// --- Layer specs ---

const crewDotsLayer: CircleLayerSpecification = {
  id: "crew-dots", type: "circle", source: "crew-positions",
  filter: ["!", ["has", "point_count"]],
  paint: {
    "circle-color": ["get", "color"],
    "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 8, 5],
    "circle-opacity": 0.85,
    "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 2, 1],
    "circle-stroke-color": ["case", ["boolean", ["feature-state", "selected"], false], "#ffffff", ["get", "color"]],
    "circle-stroke-opacity": 0.5,
  },
};

const clusterLayer: CircleLayerSpecification = {
  id: "crew-clusters", type: "circle", source: "crew-positions",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": "#2b6cff",
    "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 50, 32],
    "circle-opacity": 0.7, "circle-stroke-width": 2, "circle-stroke-color": "#60A5FA",
  },
};

const clusterCountLayer: SymbolLayerSpecification = {
  id: "cluster-count", type: "symbol", source: "crew-positions",
  filter: ["has", "point_count"],
  layout: { "text-field": "{point_count_abbreviated}", "text-size": 13 },
  paint: { "text-color": "#ffffff" },
};

// Flight arc — the solid trail (background)
const flightArcTrailLayer: LineLayerSpecification = {
  id: "flight-arc-trail", type: "line", source: "flight-arcs",
  paint: {
    "line-color": "#FBBF24",
    "line-width": 2,
    "line-opacity": 0.12,
  },
};

// Flight arc — animated dashes (foreground)
const flightArcLayer: LineLayerSpecification = {
  id: "flight-arcs", type: "line", source: "flight-arcs",
  paint: {
    "line-color": "#FBBF24",
    "line-width": 2,
    "line-opacity": 0.7,
    "line-dasharray": [0, 4, 3],
  },
};

// Flight arc glow
const flightArcGlowLayer: LineLayerSpecification = {
  id: "flight-arcs-glow", type: "line", source: "flight-arcs",
  paint: {
    "line-color": "#FBBF24",
    "line-width": 6,
    "line-opacity": 0.08,
    "line-blur": 4,
  },
};

// Origin airport dots
const originDotsLayer: CircleLayerSpecification = {
  id: "origin-dots", type: "circle", source: "origin-airports",
  paint: {
    "circle-color": "#FBBF24",
    "circle-radius": 4,
    "circle-opacity": 0.5,
    "circle-stroke-width": 1,
    "circle-stroke-color": "#FBBF24",
    "circle-stroke-opacity": 0.3,
  },
};

export function GlobeMap() {
  const mapRef = useRef<MapRef>(null);
  const { filteredCrew, filters } = useCrewStore();
  const { setSelectedCrew } = useDashboardStore();

  const [isGlobe, setIsGlobe] = useState(true);
  const [viewState, setViewState] = useState({
    longitude: 65, latitude: 15, zoom: 2.2, pitch: 0,
  });
  const [hoverInfo, setHoverInfo] = useState<{
    x: number; y: number; name: string; color: string; status: string;
  } | null>(null);

  // Are we filtering to transit crew?
  const showFlightArcs = filters.status === "in_transit" || filters.status === "at_airport";

  // Crew positions GeoJSON
  const geojson = useMemo(() => {
    const features = filteredCrew
      .filter((c) => c.lat != null && c.lng != null)
      .map((c) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [c.lng!, c.lat!] },
        properties: {
          id: c.id, name: c.full_name, status: c.current_status,
          color: STATUS_COLORS[c.current_status] || "#888",
          rank: c.rank || "", vessel: c.vessel_name || "",
        },
      }));
    return { type: "FeatureCollection" as const, features };
  }, [filteredCrew]);

  // Flight arcs — only computed when filter is active
  const flightArcs = useMemo(() => {
    if (!showFlightArcs) return { type: "FeatureCollection" as const, features: [] };

    const features = filteredCrew
      .filter((c) =>
        (c.current_status === "in_transit" || c.current_status === "at_airport") &&
        c.lat != null && c.lng != null && c.nationality
      )
      .map((c) => {
        const origin = CITY_COORDS[c.nationality!] || CITY_COORDS["Bangladesh"];
        const dest: [number, number] = [c.lng!, c.lat!];
        const dist = Math.abs(origin[0] - dest[0]) + Math.abs(origin[1] - dest[1]);
        if (dist < 2) return null;
        return {
          type: "Feature" as const,
          geometry: { type: "LineString" as const, coordinates: greatCircleArc(origin, dest, 40) },
          properties: { id: c.id, name: c.full_name },
        };
      })
      .filter(Boolean);

    return { type: "FeatureCollection" as const, features };
  }, [filteredCrew, showFlightArcs]);

  // Origin airport dots (start of each arc)
  const originAirports = useMemo(() => {
    if (!showFlightArcs) return { type: "FeatureCollection" as const, features: [] };

    const seen = new Set<string>();
    const features = filteredCrew
      .filter((c) =>
        (c.current_status === "in_transit" || c.current_status === "at_airport") && c.nationality
      )
      .map((c) => {
        if (seen.has(c.nationality!)) return null;
        seen.add(c.nationality!);
        const coords = CITY_COORDS[c.nationality!];
        if (!coords) return null;
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: coords },
          properties: { country: c.nationality },
        };
      })
      .filter(Boolean);

    return { type: "FeatureCollection" as const, features };
  }, [filteredCrew, showFlightArcs]);

  // Animate the dash offset for flowing line effect
  useEffect(() => {
    if (!showFlightArcs || !mapRef.current) return;

    let step = 0;
    let animationId: number;

    function animate() {
      step = (step + 1) % 200;
      const map = mapRef.current?.getMap();
      if (map && map.getLayer("flight-arcs")) {
        // Cycle through dash phases to create flowing effect
        const dashPhase = step / 25;
        const t = dashPhase % 1;
        map.setPaintProperty("flight-arcs", "line-dasharray", [
          t * 4,        // gap before
          4,            // dash length
          3 - t * 3,    // gap after
        ]);
      }
      animationId = requestAnimationFrame(animate);
    }

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [showFlightArcs]);

  const onClick = useCallback((e: MapMouseEvent) => {
    const feature = e.features?.[0];
    if (feature?.properties?.id) setSelectedCrew(feature.properties.id as string);
  }, [setSelectedCrew]);

  const onMouseEnter = useCallback((e: MapMouseEvent) => {
    const feature = e.features?.[0];
    if (feature?.properties) {
      mapRef.current?.getMap()?.getCanvas().style.setProperty("cursor", "pointer");
      setHoverInfo({
        x: e.point.x, y: e.point.y,
        name: feature.properties.name as string,
        color: feature.properties.color as string,
        status: feature.properties.status as string,
      });
    }
  }, []);

  const onMouseLeave = useCallback(() => {
    mapRef.current?.getMap()?.getCanvas().style.setProperty("cursor", "");
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
        fog={isGlobe ? {
          range: [0.5, 10], color: "#050B18",
          "horizon-blend": 0.08, "star-intensity": 0.5, "space-color": "#000000",
        } : undefined}
        interactiveLayerIds={["crew-dots"]}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <NavigationControl position="bottom-right" showCompass={false} />

        {/* Flight arcs — only when transit filter active */}
        <Source id="flight-arcs" type="geojson" data={flightArcs as any}>
          <Layer {...flightArcGlowLayer} />
          <Layer {...flightArcTrailLayer} />
          <Layer {...flightArcLayer} />
        </Source>

        {/* Origin airport dots */}
        <Source id="origin-airports" type="geojson" data={originAirports as any}>
          <Layer {...originDotsLayer} />
        </Source>

        {/* Crew positions */}
        <Source id="crew-positions" type="geojson" data={geojson} cluster={true} clusterMaxZoom={8} clusterRadius={40}>
          <Layer {...clusterLayer} />
          <Layer {...clusterCountLayer} />
          <Layer {...crewDotsLayer} />
        </Source>
      </MapGL>

      {/* Hover tooltip */}
      {hoverInfo && (
        <div className="absolute z-50 pointer-events-none" style={{ left: hoverInfo.x + 12, top: hoverInfo.y - 12 }}>
          <div className="px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2.5 shadow-lg border border-border-divider"
            style={{ background: "#0b1425ee" }}>
            <span className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: hoverInfo.color, boxShadow: `0 0 6px ${hoverInfo.color}` }} />
            <span style={{ color: "#f0f4fc" }}>{hoverInfo.name}</span>
            <span className="text-[10px] font-mono uppercase" style={{ color: "#6b7fa0" }}>
              {hoverInfo.status.replace("_", " ")}
            </span>
          </div>
        </div>
      )}

      {/* Globe / Flat toggle */}
      <div className="absolute top-4 right-4 z-10 flex rounded-lg overflow-hidden border border-border-divider"
        style={{ background: "#0b1425ee" }}>
        <button
          onClick={() => setIsGlobe(true)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono uppercase tracking-wider transition-all",
            isGlobe ? "bg-accent-blue/20 text-accent-blue" : "text-text-muted hover:text-text-secondary"
          )}
        >
          <Globe className="w-3.5 h-3.5" />Globe
        </button>
        <div className="w-px bg-border-divider" />
        <button
          onClick={() => setIsGlobe(false)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono uppercase tracking-wider transition-all",
            !isGlobe ? "bg-accent-blue/20 text-accent-blue" : "text-text-muted hover:text-text-secondary"
          )}
        >
          <MapIcon className="w-3.5 h-3.5" />Flat
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 p-3 rounded-lg flex flex-col gap-2 z-10 border border-border-divider"
        style={{ background: "#0b1425ee" }}>
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#8899bb" }}>
              {status.replace("_", " ")}
            </span>
          </div>
        ))}
        {showFlightArcs && (
          <div className="flex items-center gap-2 mt-1 pt-1 border-t border-border-divider">
            <div className="w-5 h-[2px] rounded-full bg-[#FBBF24]" />
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#FBBF24" }}>
              Flight Route
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
