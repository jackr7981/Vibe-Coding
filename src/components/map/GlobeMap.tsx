import { useEffect, useRef } from "react";
import mapboxgl from "../../lib/mapbox";
import { STATUS_COLORS } from "../../lib/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useCrewStore } from "../../stores/crewStore";
import { useDashboardStore } from "../../stores/dashboardStore";

export function GlobeMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const { filteredCrew } = useCrewStore();
  const { setSelectedCrew } = useDashboardStore();

  useEffect(() => {
    if (!mapContainer.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [70, 20],
      zoom: 2,
      projection: "globe",
      antialias: true,
    });

    map.on("style.load", () => {
      map.setFog({
        color: "rgb(10, 14, 30)",
        "high-color": "rgb(20, 30, 60)",
        "horizon-blend": 0.08,
        "space-color": "rgb(5, 8, 18)",
        "star-intensity": 0.6,
      });
    });

    map.on("load", () => {
      map.addSource("crew-positions", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterMaxZoom: 8,
        clusterRadius: 40,
      });

      map.addLayer({
        id: "crew-clusters",
        type: "circle",
        source: "crew-positions",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#2563eb",
          "circle-radius": ["step", ["get", "point_count"], 18, 10, 24, 50, 32],
          "circle-opacity": 0.7,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#60a5fa",
        },
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "crew-positions",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-font": ["DIN Pro Medium"],
          "text-size": 13,
        },
        paint: { "text-color": "#ffffff" },
      });

      map.addLayer({
        id: "crew-dots",
        type: "circle",
        source: "crew-positions",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 5,
          "circle-opacity": 0.85,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": ["get", "color"],
          "circle-stroke-opacity": 0.4,
        },
      });

      map.on("click", "crew-dots", (e) => {
        if (e.features?.[0]?.properties?.id) {
          setSelectedCrew(e.features[0].properties.id as string);
        }
      });

      map.on("mouseenter", "crew-dots", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "crew-dots", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    mapRef.current = map;
    return () => map.remove();
  }, [setSelectedCrew]);

  // Update GeoJSON when crew data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource("crew-positions") as mapboxgl.GeoJSONSource;
    if (!source) return;

    const features = filteredCrew
      .filter((c) => c.current_location)
      .map((c) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [
            c.current_location!.coordinates[0],
            c.current_location!.coordinates[1],
          ],
        },
        properties: {
          id: c.id,
          name: c.full_name,
          status: c.current_status,
          color: STATUS_COLORS[c.current_status] || "#888",
          rank: c.rank,
          vessel: c.assigned_vessel?.name || "",
        },
      }));

    source.setData({ type: "FeatureCollection", features });
  }, [filteredCrew]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
