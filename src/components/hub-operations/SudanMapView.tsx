import { useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { sudanStateBoundaries, stateColors, hubColors } from '@/data/sudanGeoJSON';
import { ManagedHub, SiteRegistry } from '@/types/hub-operations';
import { sudanStates } from '@/data/sudanStates';

interface SudanMapViewProps {
  hubs: ManagedHub[];
  sites?: SiteRegistry[];
  selectedStateId?: string | null;
  selectedHubId?: string | null;
  onStateClick?: (stateId: string) => void;
  onHubClick?: (hubId: string) => void;
  showHubLabels?: boolean;
  showStateLabels?: boolean;
  height?: string;
}

const createHubMarker = (color: string, size: number = 32) => {
  return L.divIcon({
    className: 'custom-hub-marker',
    html: `
      <div style="
        position: relative;
        width: ${size}px;
        height: ${size}px;
      ">
        <div style="
          position: absolute;
          width: 100%;
          height: 100%;
          background-color: ${color};
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 10px rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px;">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        </div>
        <div style="
          position: absolute;
          bottom: -4px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 8px solid transparent;
          border-right: 8px solid transparent;
          border-top: 10px solid ${color};
        "></div>
      </div>
    `,
    iconSize: [size, size + 10],
    iconAnchor: [size / 2, size + 10],
    popupAnchor: [0, -size],
  });
};

const createSiteMarker = (color: string) => {
  return L.divIcon({
    className: 'custom-site-marker',
    html: `
      <div style="
        width: 12px;
        height: 12px;
        background-color: ${color};
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
      "></div>
    `,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
};

export default function SudanMapView({
  hubs,
  sites = [],
  selectedStateId,
  selectedHubId,
  onStateClick,
  onHubClick,
  showHubLabels = true,
  showStateLabels = true,
  height = "500px",
}: SudanMapViewProps) {
  const getHubForState = (stateId: string) => {
    return hubs.find(hub => hub.states?.includes(stateId));
  };

  const stateStyle = (feature: any) => {
    const stateId = feature.properties.id;
    const isSelected = selectedStateId === stateId;
    const hub = getHubForState(stateId);
    const isHubSelected = hub && selectedHubId === hub.id;
    const baseColor = stateColors[stateId] || '#6B7280';
    const hubColor = hub ? (hubColors[hub.id] || baseColor) : baseColor;
    
    return {
      fillColor: hubColor,
      weight: isSelected || isHubSelected ? 3 : 1.5,
      opacity: 1,
      color: isSelected || isHubSelected ? '#fff' : hubColor,
      fillOpacity: isSelected || isHubSelected ? 0.6 : 0.35,
      dashArray: isSelected ? '' : '3',
    };
  };

  const onEachState = (feature: any, layer: any) => {
    const stateId = feature.properties.id;
    const stateName = feature.properties.name;
    const stateNameAr = feature.properties.nameAr;
    const hub = getHubForState(stateId);
    const stateData = sudanStates.find(s => s.id === stateId);
    const localityCount = stateData?.localities.length || 0;
    const sitesInState = sites.filter(s => s.state_id === stateId).length;

    layer.bindTooltip(
      `<div style="text-align: center; min-width: 120px;">
        <strong style="font-size: 14px;">${stateName}</strong><br/>
        <span style="color: #666; font-size: 12px;">${stateNameAr}</span>
        ${hub ? `<br/><span style="color: ${hubColors[hub.id] || '#8B5CF6'}; font-size: 11px; font-weight: 600;">Hub: ${hub.name}</span>` : ''}
        <hr style="margin: 4px 0; border-color: #ddd;"/>
        <span style="font-size: 11px;">${localityCount} Localities</span>
        ${sitesInState > 0 ? `<br/><span style="font-size: 11px;">${sitesInState} Sites</span>` : ''}
      </div>`,
      { 
        permanent: false, 
        direction: 'center',
        className: 'state-tooltip'
      }
    );

    layer.on({
      mouseover: (e: any) => {
        const layer = e.target;
        layer.setStyle({
          weight: 3,
          fillOpacity: 0.7,
        });
        layer.bringToFront();
      },
      mouseout: (e: any) => {
        const layer = e.target;
        layer.setStyle(stateStyle(feature));
      },
      click: () => {
        if (onStateClick) {
          onStateClick(stateId);
        }
      },
    });
  };

  const hubMarkers = useMemo(() => {
    return hubs.map(hub => {
      const coords = hub.coordinates;
      if (!coords || (!coords.latitude && !coords.longitude)) {
        const defaultCoords: Record<string, [number, number]> = {
          'kassala-hub': [15.4507, 36.4048],
          'kosti-hub': [13.1629, 32.6635],
          'el-fasher-hub': [13.6289, 25.3493],
          'dongola-hub': [19.1653, 30.4763],
          'country-office': [15.5007, 32.5599],
        };
        return {
          ...hub,
          position: defaultCoords[hub.id] || [15.5, 32.5] as [number, number],
        };
      }
      return {
        ...hub,
        position: [coords.latitude, coords.longitude] as [number, number],
      };
    });
  }, [hubs]);

  const siteMarkers = useMemo(() => {
    return sites.filter(site => site.gps_latitude && site.gps_longitude).map(site => ({
      ...site,
      position: [site.gps_latitude!, site.gps_longitude!] as [number, number],
    }));
  }, [sites]);

  return (
    <div className="relative rounded-lg overflow-hidden border" style={{ height }}>
      <MapContainer
        center={[15.5, 30.0]}
        zoom={5}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <GeoJSON
          key={`states-${selectedStateId}-${selectedHubId}`}
          data={sudanStateBoundaries as any}
          style={stateStyle}
          onEachFeature={onEachState}
        />

        {hubMarkers.map((hub) => (
          <Marker
            key={hub.id}
            position={hub.position}
            icon={createHubMarker(hubColors[hub.id] || '#8B5CF6')}
            eventHandlers={{
              click: () => onHubClick?.(hub.id),
            }}
          >
            <Popup>
              <div className="text-center min-w-[150px]">
                <h3 className="font-bold text-sm mb-1">{hub.name}</h3>
                {hub.description && (
                  <p className="text-xs text-gray-600 mb-2">{hub.description}</p>
                )}
                <div className="text-xs">
                  <strong>{hub.states?.length || 0}</strong> States Assigned
                </div>
                <div className="text-xs mt-1 text-gray-500">
                  {hub.states?.map(stateId => 
                    sudanStates.find(s => s.id === stateId)?.name
                  ).filter(Boolean).join(', ')}
                </div>
              </div>
            </Popup>
            {showHubLabels && (
              <Tooltip permanent direction="bottom" offset={[0, 20]} className="hub-label">
                <span className="font-semibold text-xs">{hub.name}</span>
              </Tooltip>
            )}
          </Marker>
        ))}

        {siteMarkers.map((site) => (
          <Marker
            key={site.id}
            position={site.position}
            icon={createSiteMarker(stateColors[site.state_id] || '#6B7280')}
          >
            <Popup>
              <div className="min-w-[120px]">
                <h4 className="font-bold text-xs">{site.site_name}</h4>
                <p className="text-xs text-gray-500">{site.site_code}</p>
                <p className="text-xs">{site.locality_name}, {site.state_name}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div className="absolute bottom-4 left-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 z-[1000] max-w-[200px]">
        <h4 className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-300">Legend</h4>
        <div className="space-y-1.5">
          {hubs.slice(0, 5).map(hub => (
            <div key={hub.id} className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full border border-white shadow-sm" 
                style={{ backgroundColor: hubColors[hub.id] || '#6B7280' }}
              />
              <span className="text-xs text-gray-600 dark:text-gray-400">{hub.name}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .state-tooltip {
          background: white !important;
          border: 1px solid #e5e7eb !important;
          border-radius: 8px !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
          padding: 8px 12px !important;
        }
        .hub-label {
          background: rgba(0,0,0,0.75) !important;
          border: none !important;
          border-radius: 4px !important;
          color: white !important;
          padding: 2px 6px !important;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
        }
        .hub-label::before {
          display: none !important;
        }
        .custom-hub-marker, .custom-site-marker {
          background: transparent !important;
          border: none !important;
        }
      `}</style>
    </div>
  );
}
