import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import MapGL, { Source, Layer, Marker, NavigationControl } from "react-map-gl/mapbox";
import type { MapRef, MapMouseEvent } from "react-map-gl/mapbox";
import type {
  CircleLayerSpecification,
  LineLayerSpecification,
} from "mapbox-gl";
import { ActivityFeedOverlay } from "../feed/ActivityFeedOverlay";
import "mapbox-gl/dist/mapbox-gl.css";
import { Globe, Map as MapIcon } from "lucide-react";
import { useCrewStore } from "../../stores/crewStore";
import { useDashboardStore } from "../../stores/dashboardStore";
import { cn } from "../../lib/utils";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const STATUS_COLORS: Record<string, string> = {
  home: "#34D399", on_board: "#60A5FA", in_transit: "#FBBF24",
  at_airport: "#F97316", at_port: "#A78BFA",
};

const CITY_COORDS: Record<string, [number, number]> = {
  Bangladesh: [90.41, 23.81], India: [72.88, 19.08],
  Philippines: [120.98, 14.6], Indonesia: [106.85, -6.21], Ukraine: [30.74, 46.48],
};

function greatCircleArc(start: [number, number], end: [number, number], n = 60): [number, number][] {
  const toR = (d: number) => (d * Math.PI) / 180;
  const toD = (r: number) => (r * 180) / Math.PI;
  const [la1, lo1, la2, lo2] = [toR(start[1]), toR(start[0]), toR(end[1]), toR(end[0])];
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((la1 - la2) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo1 - lo2) / 2) ** 2
  ));
  if (d < 0.001) return [start, end];
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    const z = A * Math.sin(la1) + B * Math.sin(la2);
    pts.push([toD(Math.atan2(y, x)), toD(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  return pts;
}

// --- Crew layers ---
const crewDotsLayer: CircleLayerSpecification = {
  id: "crew-dots", type: "circle", source: "crew-positions",
  paint: {
    "circle-color": ["get", "color"],
    "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 8, 5],
    "circle-opacity": 0.85,
    "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 2, 1],
    "circle-stroke-color": ["case", ["boolean", ["feature-state", "selected"], false], "#ffffff", ["get", "color"]],
    "circle-stroke-opacity": 0.5,
  },
};

// --- Flight arc layers (multi-layered futuristic effect) ---
// Layer 1: Wide outer glow
const arcOuterGlow: LineLayerSpecification = {
  id: "arc-outer-glow", type: "line", source: "flight-arc",
  paint: { "line-color": "#FBBF24", "line-width": 12, "line-opacity": 0.06, "line-blur": 8 },
};
// Layer 2: Inner glow
const arcInnerGlow: LineLayerSpecification = {
  id: "arc-inner-glow", type: "line", source: "flight-arc",
  paint: { "line-color": "#FBBF24", "line-width": 5, "line-opacity": 0.15, "line-blur": 3 },
};
// Layer 3: Solid trail base
const arcTrail: LineLayerSpecification = {
  id: "arc-trail", type: "line", source: "flight-arc",
  paint: { "line-color": "#FBBF24", "line-width": 1.5, "line-opacity": 0.25 },
};
// Layer 4: Bright animated dash (the "pulse" traveling along the arc)
const arcPulse: LineLayerSpecification = {
  id: "arc-pulse", type: "line", source: "flight-arc",
  paint: { "line-color": "#FFD666", "line-width": 2.5, "line-opacity": 0.9, "line-dasharray": [1, 8] },
};

const EMPTY_FC = { type: "FeatureCollection" as const, features: [] };

export function GlobeMap() {
  const mapRef = useRef<MapRef>(null);
  const { filteredCrew } = useCrewStore();
  const { selectedCrewId, setSelectedCrew } = useDashboardStore();

  const [isGlobe, setIsGlobe] = useState(true);
  const [viewState, setViewState] = useState({ longitude: 65, latitude: 15, zoom: 2.2, pitch: 0 });
  const [hoverInfo, setHoverInfo] = useState<{
    x: number; y: number; name: string; color: string; status: string;
  } | null>(null);
  const [travelDotPos, setTravelDotPos] = useState<[number, number] | null>(null);

  const selectedCrew = useMemo(
    () => filteredCrew.find((c) => c.id === selectedCrewId) ?? null,
    [filteredCrew, selectedCrewId]
  );

  const isTraveling = !!(selectedCrew &&
    (selectedCrew.current_status === "in_transit" || selectedCrew.current_status === "at_airport") &&
    selectedCrew.lat != null && selectedCrew.lng != null && selectedCrew.nationality);

  // Crew positions
  const geojson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: filteredCrew
      .filter((c) => c.lat != null && c.lng != null)
      .map((c) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [c.lng!, c.lat!] },
        properties: {
          id: c.id, name: c.full_name, status: c.current_status,
          color: STATUS_COLORS[c.current_status] || "#888",
          rank: c.rank || "", vessel: c.vessel_name || "",
        },
      })),
  }), [filteredCrew]);

  // Arc + origin for selected crew
  const arcPoints = useMemo(() => {
    if (!isTraveling || !selectedCrew) return null;
    const origin = CITY_COORDS[selectedCrew.nationality!] || CITY_COORDS["Bangladesh"];
    const dest: [number, number] = [selectedCrew.lng!, selectedCrew.lat!];
    if (Math.abs(origin[0] - dest[0]) + Math.abs(origin[1] - dest[1]) < 2) return null;
    return greatCircleArc(origin, dest, 60);
  }, [selectedCrew, isTraveling]);

  const flightArc = useMemo(() => {
    if (!arcPoints) return EMPTY_FC;
    return {
      type: "FeatureCollection" as const,
      features: [{ type: "Feature" as const, geometry: { type: "LineString" as const, coordinates: arcPoints }, properties: {} }],
    };
  }, [arcPoints]);

  const originCoords = useMemo(() => {
    if (!isTraveling || !selectedCrew) return null;
    return CITY_COORDS[selectedCrew.nationality!] || null;
  }, [selectedCrew, isTraveling]);

  // Animate: pulse dash + traveling dot along arc
  useEffect(() => {
    if (!isTraveling || !arcPoints || !mapRef.current) return;
    let step = 0;
    let id: number;
    function animate() {
      step = (step + 1) % 300;
      const map = mapRef.current?.getMap();
      if (map?.getLayer("arc-pulse")) {
        const t = (step / 30) % 1;
        map.setPaintProperty("arc-pulse", "line-dasharray", [t * 2, 1, 9 - t * 2]);
      }
      // Move traveling dot along the arc
      if (arcPoints) {
        const dotPhase = (step / 300);
        const idx = Math.floor(dotPhase * (arcPoints.length - 1));
        setTravelDotPos(arcPoints[Math.min(idx, arcPoints.length - 1)]);
      }
      id = requestAnimationFrame(animate);
    }
    id = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(id); setTravelDotPos(null); };
  }, [isTraveling, arcPoints]);

  const onClick = useCallback((e: MapMouseEvent) => {
    const f = e.features?.[0];
    if (f?.properties?.id) setSelectedCrew(f.properties.id as string);
  }, [setSelectedCrew]);

  const onMouseEnter = useCallback((e: MapMouseEvent) => {
    const f = e.features?.[0];
    if (f?.properties) {
      mapRef.current?.getMap()?.getCanvas().style.setProperty("cursor", "pointer");
      setHoverInfo({ x: e.point.x, y: e.point.y, name: f.properties.name as string,
        color: f.properties.color as string, status: f.properties.status as string });
    }
  }, []);

  const onMouseLeave = useCallback(() => {
    mapRef.current?.getMap()?.getCanvas().style.setProperty("cursor", "");
    setHoverInfo(null);
  }, []);

  return (
    <div className="w-full h-full relative bg-bg-deepest rounded-xl overflow-hidden">
      <MapGL
        ref={mapRef} {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        projection={{ name: isGlobe ? "globe" : "mercator" }}
        fog={isGlobe ? { range: [0.5, 10], color: "#050B18", "horizon-blend": 0.08, "star-intensity": 0.5, "space-color": "#000000" } : undefined}
        interactiveLayerIds={["crew-dots"]}
        onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      >
        <NavigationControl position="bottom-right" showCompass={false} />

        {/* Flight arc — 4-layer futuristic light trail */}
        <Source id="flight-arc" type="geojson" data={flightArc as any}>
          <Layer {...arcOuterGlow} />
          <Layer {...arcInnerGlow} />
          <Layer {...arcTrail} />
          <Layer {...arcPulse} />
        </Source>

        {/* Origin airport marker */}
        {originCoords && isTraveling && (
          <Marker longitude={originCoords[0]} latitude={originCoords[1]} anchor="center">
            <div className="relative">
              <div className="w-3 h-3 rounded-full border-2 border-[#FBBF24] bg-[#FBBF24]/30" />
              <div className="absolute -inset-1.5 rounded-full border border-[#FBBF24]/40 animate-ping" />
            </div>
          </Marker>
        )}

        {/* Traveling dot — animates along the arc */}
        {travelDotPos && isTraveling && (
          <Marker longitude={travelDotPos[0]} latitude={travelDotPos[1]} anchor="center">
            <div className="relative">
              <div className="w-2.5 h-2.5 rounded-full bg-[#FFD666]"
                style={{ boxShadow: "0 0 10px #FBBF24, 0 0 20px #FBBF2480, 0 0 30px #FBBF2440" }} />
            </div>
          </Marker>
        )}

        {/* Crew positions — no clustering, individual dots at all zoom levels */}
        <Source id="crew-positions" type="geojson" data={geojson}>
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

      {/* Selected crew flight info badge */}
      {isTraveling && selectedCrew && (
        <div className="absolute top-4 left-4 z-10 px-4 py-2.5 rounded-lg border border-[#FBBF24]/30 flex items-center gap-3"
          style={{ background: "#0b1425ee" }}>
          <div className="relative">
            <div className="w-2.5 h-2.5 rounded-full bg-[#FBBF24]" />
            <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-[#FBBF24] animate-ping opacity-50" />
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: "#FFD666" }}>
              {selectedCrew.full_name}
            </div>
            <div className="text-[11px] font-mono" style={{ color: "#8899bb" }}>
              {selectedCrew.nationality} {"→"} {selectedCrew.current_location_label || "In Transit"}
            </div>
          </div>
        </div>
      )}

      {/* Globe / Flat toggle */}
      <div className="absolute top-4 right-4 z-10 flex rounded-lg overflow-hidden border border-border-divider"
        style={{ background: "#0b1425ee" }}>
        <button onClick={() => setIsGlobe(true)}
          className={cn("flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono uppercase tracking-wider transition-all",
            isGlobe ? "bg-accent-blue/20 text-accent-blue" : "text-text-muted hover:text-text-secondary")}>
          <Globe className="w-3.5 h-3.5" />Globe
        </button>
        <div className="w-px bg-border-divider" />
        <button onClick={() => setIsGlobe(false)}
          className={cn("flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono uppercase tracking-wider transition-all",
            !isGlobe ? "bg-accent-blue/20 text-accent-blue" : "text-text-muted hover:text-text-secondary")}>
          <MapIcon className="w-3.5 h-3.5" />Flat
        </button>
      </div>

      {/* Activity Feed Overlay — left side of globe */}
      <ActivityFeedOverlay mapRef={mapRef} />

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
      </div>
    </div>
  );
}
