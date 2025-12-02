import React, { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Users, RefreshCw } from 'lucide-react';
import { User } from '@/types/user';
import { SiteVisit } from '@/types/siteVisit';
import { formatDistanceToNow } from 'date-fns';
import { getUserStatus } from '@/utils/userStatusUtils';
import { Button } from '@/components/ui/button';

interface TeamLocationMapProps {
  users: User[];
  siteVisits?: SiteVisit[];
}

const TeamLocationMap: React.FC<TeamLocationMapProps> = ({ users, siteVisits = [] }) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const isMapInitializedRef = useRef(false);

  const initializeMap = useCallback(() => {
    if (!mapContainerRef.current || isMapInitializedRef.current) return;

    try {
      mapRef.current = L.map(mapContainerRef.current, {
        center: [15.5527, 32.5599],
        zoom: 6,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(mapRef.current);

      markersLayerRef.current = L.layerGroup().addTo(mapRef.current);
      isMapInitializedRef.current = true;
    } catch (error) {
      console.error('Error initializing map:', error);
    }
  }, []);

  const updateMarkers = useCallback(() => {
    if (!mapRef.current || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();
    const bounds = L.latLngBounds([]);
    let hasValidBounds = false;

    users.forEach((user) => {
      if (user.location?.latitude && user.location?.longitude) {
        const userStatus = getUserStatus(user);
        
        const statusColorMap: Record<string, string> = {
          'bg-green-500': '#22c55e',
          'bg-orange-500': '#f97316',
          'bg-gray-400 dark:bg-gray-600': '#9ca3af'
        };
        const markerColor = statusColorMap[userStatus.color] || '#9ca3af';
        const isOnline = userStatus.type === 'online';
        
        const markerIcon = L.divIcon({
          className: 'custom-marker',
          html: `
            <div style="position: relative;">
              <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 0C7.163 0 0 7.163 0 16c0 12 16 24 16 24s16-12 16-24c0-8.837-7.163-16-16-16z" 
                  fill="${markerColor}" 
                  stroke="#fff" 
                  stroke-width="2"/>
                <circle cx="16" cy="16" r="6" fill="#fff"/>
              </svg>
              ${isOnline ? '<div style="position: absolute; top: 2px; right: 2px; width: 8px; height: 8px; background: #10b981; border: 2px solid #fff; border-radius: 50%;"></div>' : ''}
            </div>
          `,
          iconSize: [32, 40],
          iconAnchor: [16, 40],
          popupAnchor: [0, -40],
        });

        const marker = L.marker([user.location.latitude, user.location.longitude], {
          icon: markerIcon,
        });

        const lastSeenTime = user.location?.lastUpdated || user.lastActive;
        const lastSeenText = lastSeenTime 
          ? formatDistanceToNow(new Date(lastSeenTime), { addSuffix: true })
          : 'Never';

        const getAccuracyInfo = (accuracy?: number) => {
          if (accuracy === undefined) return { color: '#999', label: 'Unknown' };
          if (accuracy <= 10) return { color: '#22c55e', label: 'Excellent' };
          if (accuracy <= 30) return { color: '#eab308', label: 'Good' };
          return { color: '#f97316', label: 'Fair' };
        };
        const accuracyInfo = getAccuracyInfo(user.location.accuracy);

        const popupContent = `
          <div style="min-width: 240px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <div style="width: 8px; height: 8px; background: ${markerColor}; border-radius: 50%;"></div>
              <strong style="font-size: 14px;">${user.name || user.fullName || 'Unknown'}</strong>
            </div>
            <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
              <strong>Role:</strong> ${user.roles?.[0] || user.role || 'N/A'}
            </div>
            <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
              <strong>Status:</strong> <span style="display: inline-flex; align-items: center; gap: 4px;"><span style="width: 8px; height: 8px; background: ${markerColor}; border-radius: 50%; display: inline-block;"></span> ${userStatus.label}</span>
            </div>
            <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
              <strong>Last Seen:</strong> ${lastSeenText}
            </div>
            ${user.location.accuracy !== undefined ? `
              <div style="font-size: 12px; margin-bottom: 4px;">
                <strong style="color: #666;">GPS Accuracy:</strong> 
                <span style="color: ${accuracyInfo.color}; font-weight: 500;">
                  \u00B1${user.location.accuracy.toFixed(1)}m (${accuracyInfo.label})
                </span>
              </div>
            ` : ''}
            ${user.location?.address ? `
              <div style="font-size: 12px; color: #666; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
                ${user.location.address}
              </div>
            ` : ''}
            <div style="font-size: 11px; color: #999; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-style: italic;">
              Click card/table row for messaging & assignment options
            </div>
          </div>
        `;

        marker.bindPopup(popupContent);
        markersLayerRef.current?.addLayer(marker);
        bounds.extend([user.location.latitude, user.location.longitude]);
        hasValidBounds = true;
      }
    });

    siteVisits.forEach((visit) => {
      const lat = visit.location?.latitude || visit.coordinates?.latitude;
      const lng = visit.location?.longitude || visit.coordinates?.longitude;
      
      if (lat && lng) {
        const getColor = () => {
          if (visit.status === 'completed') return '#10b981';
          if (visit.status === 'inProgress') return '#3b82f6';
          if (visit.priority === 'high') return '#ef4444';
          if (visit.priority === 'medium') return '#f59e0b';
          return '#6366f1';
        };

        const markerIcon = L.divIcon({
          className: 'custom-marker',
          html: `
            <div>
              <svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22c0-7.732-6.268-14-14-14z" 
                  fill="${getColor()}" 
                  stroke="#fff" 
                  stroke-width="2"/>
                <text x="14" y="17" text-anchor="middle" fill="#fff" font-size="12" font-weight="bold">S</text>
              </svg>
            </div>
          `,
          iconSize: [28, 36],
          iconAnchor: [14, 36],
          popupAnchor: [0, -36],
        });

        const marker = L.marker([lat, lng], {
          icon: markerIcon,
        });

        const address = visit.location?.address || '';
        const popupContent = `
          <div style="min-width: 200px;">
            <strong style="font-size: 14px; display: block; margin-bottom: 8px;">
              ${visit.siteName || 'Site Visit'}
            </strong>
            ${visit.siteCode ? `
              <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
                <strong>Code:</strong> ${visit.siteCode}
              </div>
            ` : ''}
            <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
              <strong>Status:</strong> <span style="text-transform: capitalize;">${visit.status?.replace(/([A-Z])/g, ' $1').trim() || 'N/A'}</span>
            </div>
            <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
              <strong>Priority:</strong> <span style="text-transform: capitalize;">${visit.priority || 'Normal'}</span>
            </div>
            ${visit.scheduledDate ? `
              <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
                <strong>Scheduled:</strong> ${new Date(visit.scheduledDate).toLocaleDateString()}
              </div>
            ` : ''}
            ${visit.assignedTo ? `
              <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
                <strong>Assigned To:</strong> ${typeof visit.assignedTo === 'string' ? visit.assignedTo : 'Assigned'}
              </div>
            ` : ''}
            ${address ? `
              <div style="font-size: 12px; color: #666; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
                ${address}
              </div>
            ` : ''}
          </div>
        `;

        marker.bindPopup(popupContent);
        markersLayerRef.current?.addLayer(marker);
        bounds.extend([lat, lng]);
        hasValidBounds = true;
      }
    });

    if (hasValidBounds && mapRef.current) {
      try {
        mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      } catch (error) {
        console.error('Error fitting bounds:', error);
      }
    }
  }, [users, siteVisits]);

  useEffect(() => {
    const timer = setTimeout(() => {
      initializeMap();
    }, 100);

    return () => {
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersLayerRef.current = null;
        isMapInitializedRef.current = false;
      }
    };
  }, [initializeMap]);

  useEffect(() => {
    if (isMapInitializedRef.current) {
      updateMarkers();
    }
  }, [users, siteVisits, updateMarkers]);

  useEffect(() => {
    if (mapRef.current) {
      setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 200);
    }
  }, []);

  const handleRefresh = () => {
    if (mapRef.current) {
      mapRef.current.invalidateSize();
      updateMarkers();
    }
  };

  const teamWithLocation = users.filter(u => u.location?.latitude && u.location?.longitude);
  const sitesWithLocation = siteVisits.filter(v => 
    (v.location?.latitude && v.location?.longitude) || 
    (v.coordinates?.latitude && v.coordinates?.longitude)
  );
  
  const onlineWithLocation = teamWithLocation.filter(u => getUserStatus(u).type === 'online');
  const sameDayWithLocation = teamWithLocation.filter(u => getUserStatus(u).type === 'same-day');
  const offlineWithLocation = teamWithLocation.filter(u => getUserStatus(u).type === 'offline');
  const onlineCount = onlineWithLocation.length;
  const sameDayCount = sameDayWithLocation.length;
  const offlineCount = offlineWithLocation.length;

  return (
    <div className="space-y-3">
      <Card className="bg-muted/30 border-border/50">
        <CardContent className="p-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4 text-xs flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                <span>Online ({onlineCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-orange-500 rounded-full border-2 border-white"></div>
                <span>Active Today ({sameDayCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-gray-400 rounded-full border-2 border-white"></div>
                <span>Offline ({offlineCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-indigo-500 rounded-full border-2 border-white"></div>
                <span>Site Visits ({sitesWithLocation.length})</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {teamWithLocation.length} team member{teamWithLocation.length !== 1 ? 's' : ''} | {sitesWithLocation.length} site{sitesWithLocation.length !== 1 ? 's' : ''}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                className="h-7 text-xs gap-1"
                data-testid="button-refresh-map"
              >
                <RefreshCw className="h-3 w-3" />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div 
            ref={mapContainerRef} 
            style={{ height: '500px', width: '100%' }}
            data-testid="team-location-map"
          />
        </CardContent>
      </Card>

      {teamWithLocation.length === 0 && sitesWithLocation.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <MapPin className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">No team members or site visits with location data</p>
            <p className="text-xs mt-1">Enable location sharing to see team positions on the map</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TeamLocationMap;
