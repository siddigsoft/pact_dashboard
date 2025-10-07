
import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DataCollector, GeoSiteVisit, Assignment } from '@/types';
import { Card, CardContent } from '@/components/ui/card';

// Delete L.Icon.Default markers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

interface MapComponentProps {
  collectors?: DataCollector[];
  siteVisits?: GeoSiteVisit[];
  assignments?: Assignment[];
  center?: [number, number];
  zoom?: number;
  onMapReady?: (map: L.Map) => void;
  onMarkerClick?: (type: 'collector' | 'site', id: string) => void;
  showAssignmentLines?: boolean;
  height?: string;
}

const MapComponent: React.FC<MapComponentProps> = ({
  collectors = [],
  siteVisits = [],
  assignments = [],
  center = [15.5007, 32.5599], // Sudan's center coordinates
  zoom = 6,
  onMapReady,
  onMarkerClick,
  showAssignmentLines = true,
  height = '500px',
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const mapMarkers = useRef<{[key: string]: L.Marker}>({});
  const mapLines = useRef<L.Polyline[]>([]);

  const createCollectorIcon = (status: string) => {
    const color = 
      status === 'available' ? '#10b981' : 
      status === 'busy' ? '#f59e0b' : 
      '#6b7280';

    return L.divIcon({
      className: 'custom-div-icon',
      html: `
        <div style="
          background-color: ${color};
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 0 0 2px ${color}40;
        "></div>
      `,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });
  };

  const createSiteVisitIcon = (status: string) => {
    const color = 
      status === 'completed' ? '#10b981' : 
      status === 'inProgress' ? '#6366f1' : 
      status === 'assigned' ? '#f59e0b' : 
      '#ef4444';

    return L.divIcon({
      className: 'custom-div-icon',
      html: `
        <div style="
          background-color: ${color};
          width: 16px;
          height: 16px;
          clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
          border: 2px solid white;
          box-shadow: 0 0 0 2px ${color}40;
        "></div>
      `,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  };

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Create map instance
    map.current = L.map(mapContainer.current, {
      minZoom: 5,
      maxBounds: [
        [8.5, 21.8], // Southwest coordinates
        [22.5, 39.0]  // Northeast coordinates
      ]
    }).setView(center, zoom);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map.current);

    // Add zoom control
    map.current.addControl(L.control.zoom({ position: 'topright' }));

    if (onMapReady && map.current) {
      onMapReady(map.current);
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update collectors
  useEffect(() => {
    if (!map.current) return;

    // Clear existing collector markers
    Object.keys(mapMarkers.current).forEach(key => {
      if (key.startsWith('collector-')) {
        mapMarkers.current[key].remove();
        delete mapMarkers.current[key];
      }
    });

    // Add new collector markers
    collectors.forEach(collector => {
      if (!collector.location) return;

      const marker = L.marker(
        [collector.location.latitude, collector.location.longitude],
        { icon: createCollectorIcon(collector.status) }
      ).addTo(map.current!);

      marker.bindPopup(`
        <div class="p-2">
          <strong>${collector.name}</strong>
          <div class="text-xs mt-1">${collector.status}</div>
        </div>
      `);

      if (onMarkerClick) {
        marker.on('click', () => onMarkerClick('collector', collector.id));
      }

      mapMarkers.current[`collector-${collector.id}`] = marker;
    });
  }, [collectors, map.current]);

  // Update site visits
  useEffect(() => {
    if (!map.current) return;

    // Clear existing site visit markers
    Object.keys(mapMarkers.current).forEach(key => {
      if (key.startsWith('site-')) {
        mapMarkers.current[key].remove();
        delete mapMarkers.current[key];
      }
    });

    // Add new site visit markers
    siteVisits.forEach(site => {
      if (!site.location) return;

      const marker = L.marker(
        [site.location.latitude, site.location.longitude],
        { icon: createSiteVisitIcon(site.status) }
      ).addTo(map.current!);

      marker.bindPopup(`
        <div class="p-2">
          <strong>${site.name}</strong>
          <div class="text-xs mt-1">${site.status}</div>
        </div>
      `);

      if (onMarkerClick) {
        marker.on('click', () => onMarkerClick('site', site.id));
      }

      mapMarkers.current[`site-${site.id}`] = marker;
    });
  }, [siteVisits, map.current]);

  // Update assignment lines
  useEffect(() => {
    if (!map.current || !showAssignmentLines) {
      // Clear existing lines
      mapLines.current.forEach(line => line.remove());
      mapLines.current = [];
      return;
    }

    // Clear existing lines
    mapLines.current.forEach(line => line.remove());
    mapLines.current = [];

    // Add new assignment lines
    assignments.forEach(assignment => {
      const collector = collectors.find(c => c.id === assignment.collectorId);
      const site = siteVisits.find(s => s.id === assignment.siteVisitId);

      if (!collector?.location || !site?.location) return;

      const line = L.polyline(
        [
          [collector.location.latitude, collector.location.longitude],
          [site.location.latitude, site.location.longitude]
        ],
        {
          color: assignment.status === 'completed' ? '#10b981' : '#6366f1',
          weight: 2,
          opacity: 0.6,
          dashArray: '5, 10'
        }
      ).addTo(map.current);

      mapLines.current.push(line);
    });
  }, [assignments, collectors, siteVisits, showAssignmentLines, map.current]);

  return (
    <Card className="w-full overflow-hidden relative z-0">
      <CardContent className="p-0 overflow-hidden">
        <div className="relative z-0 w-full overflow-hidden" style={{ height }}>
          <div ref={mapContainer} className="absolute inset-0 rounded-lg z-0" />
        </div>
      </CardContent>
    </Card>
  );
};

export default MapComponent;
