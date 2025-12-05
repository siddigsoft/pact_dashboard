import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, RefreshCw, Wifi, WifiOff, Loader2, Filter, Maximize2, Minimize2, X } from 'lucide-react';
import { User } from '@/types/user';
import { SiteVisit } from '@/types/siteVisit';
import { formatDistanceToNow } from 'date-fns';
import { getUserStatus } from '@/utils/userStatusUtils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type StatusFilter = 'all' | 'online' | 'active-today' | 'offline' | 'sites';

interface TeamLocationMapProps {
  users: User[];
  siteVisits?: SiteVisit[];
  isConnected?: boolean;
  connectionStatus?: 'connecting' | 'connected' | 'disconnected';
  lastRefresh?: Date;
  onForceRefresh?: () => void;
  onlineUserIds?: Set<string>;
}

const AUTO_REFRESH_INTERVAL = 15000;

const TeamLocationMap: React.FC<TeamLocationMapProps> = ({ 
  users, 
  siteVisits = [],
  isConnected = false,
  connectionStatus = 'disconnected',
  lastRefresh,
  onForceRefresh,
  onlineUserIds = new Set()
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const fullscreenMapContainerRef = useRef<HTMLDivElement>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const isMapInitializedRef = useRef(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(lastRefresh || new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showSites, setShowSites] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fullscreenMapRef = useRef<L.Map | null>(null);

  const getStatusColor = (user: User): string => {
    if (onlineUserIds.has(user.id)) {
      return '#22c55e';
    }
    const userStatus = getUserStatus(user);
    const statusColorMap: Record<string, string> = {
      'bg-green-500': '#22c55e',
      'bg-orange-500': '#f97316',
      'bg-gray-400 dark:bg-gray-600': '#9ca3af'
    };
    return statusColorMap[userStatus.color] || '#9ca3af';
  };

  const createUserMarkerIcon = (user: User) => {
    const userStatus = getUserStatus(user);
    const markerColor = getStatusColor(user);
    const isOnline = onlineUserIds.has(user.id) || userStatus.type === 'online';
    const userName = user.name || user.fullName || 'Unknown';
    const initials = userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const avatarUrl = user.avatar;
    
    const pulseAnimation = isOnline ? `
      @keyframes pulse-${user.id.replace(/[^a-zA-Z0-9]/g, '')} {
        0%, 100% { box-shadow: 0 0 0 0 ${markerColor}80; }
        50% { box-shadow: 0 0 0 8px ${markerColor}00; }
      }
    ` : '';
    
    const animationStyle = isOnline ? `animation: pulse-${user.id.replace(/[^a-zA-Z0-9]/g, '')} 2s infinite;` : '';

    if (avatarUrl) {
      return L.divIcon({
        className: 'custom-user-marker',
        html: `
          <style>${pulseAnimation}</style>
          <div style="
            position: relative;
            width: 48px;
            height: 48px;
            ${animationStyle}
          ">
            <div style="
              position: absolute;
              top: 0;
              left: 0;
              width: 48px;
              height: 48px;
              border-radius: 50%;
              border: 3px solid ${markerColor};
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              overflow: hidden;
              background: white;
            ">
              <img 
                src="${avatarUrl}" 
                alt="${userName}"
                style="width: 100%; height: 100%; object-fit: cover;"
                onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
              />
              <div style="
                display: none;
                width: 100%;
                height: 100%;
                background: linear-gradient(135deg, ${markerColor}90, ${markerColor});
                color: white;
                font-size: 16px;
                font-weight: bold;
                align-items: center;
                justify-content: center;
              ">${initials}</div>
            </div>
            <div style="
              position: absolute;
              bottom: -2px;
              right: -2px;
              width: 16px;
              height: 16px;
              border-radius: 50%;
              background: ${markerColor};
              border: 2px solid white;
              box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            "></div>
          </div>
        `,
        iconSize: [48, 48],
        iconAnchor: [24, 24],
        popupAnchor: [0, -24],
      });
    }

    return L.divIcon({
      className: 'custom-user-marker',
      html: `
        <style>${pulseAnimation}</style>
        <div style="
          position: relative;
          width: 48px;
          height: 48px;
          ${animationStyle}
        ">
          <div style="
            position: absolute;
            top: 0;
            left: 0;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            border: 3px solid ${markerColor};
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            overflow: hidden;
            background: linear-gradient(135deg, ${markerColor}90, ${markerColor});
            display: flex;
            align-items: center;
            justify-content: center;
          ">
            <span style="
              color: white;
              font-size: 16px;
              font-weight: bold;
              text-shadow: 0 1px 2px rgba(0,0,0,0.3);
            ">${initials}</span>
          </div>
          <div style="
            position: absolute;
            bottom: -2px;
            right: -2px;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: ${markerColor};
            border: 2px solid white;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          "></div>
        </div>
      `,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
      popupAnchor: [0, -24],
    });
  };

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

    // Helper to check user online status
    const checkIsUserOnline = (user: User): boolean => {
      if (onlineUserIds.has(user.id)) return true;
      return getUserStatus(user).type === 'online';
    };

    // Filter users based on status filter
    const usersToShow = users.filter(user => {
      if (!user.location?.latitude || !user.location?.longitude) return false;
      
      if (statusFilter === 'all') return true;
      
      const isOnline = checkIsUserOnline(user);
      const userStatusType = getUserStatus(user).type;
      
      if (statusFilter === 'online') return isOnline;
      if (statusFilter === 'active-today') return !isOnline && userStatusType === 'same-day';
      if (statusFilter === 'offline') return !isOnline && userStatusType === 'offline';
      
      return true;
    });

    usersToShow.forEach((user) => {
      if (user.location?.latitude && user.location?.longitude) {
        const userStatus = getUserStatus(user);
        const markerColor = getStatusColor(user);
        const markerIcon = createUserMarkerIcon(user);

        const marker = L.marker([user.location.latitude, user.location.longitude], {
          icon: markerIcon,
        });

        const lastSeenTime = user.location?.lastUpdated || user.lastActive;
        const lastSeenText = lastSeenTime 
          ? formatDistanceToNow(new Date(lastSeenTime), { addSuffix: true })
          : 'Never';

        const getAccuracyInfo = (accuracy?: number) => {
          if (accuracy === undefined || accuracy === null) return { color: '#999', label: 'Unknown', value: 'N/A' };
          if (accuracy <= 10) return { color: '#22c55e', label: 'Excellent', value: `±${accuracy.toFixed(1)}m` };
          if (accuracy <= 30) return { color: '#eab308', label: 'Good', value: `±${accuracy.toFixed(1)}m` };
          if (accuracy <= 100) return { color: '#f97316', label: 'Fair', value: `±${accuracy.toFixed(1)}m` };
          return { color: '#ef4444', label: 'Poor', value: `±${accuracy.toFixed(0)}m` };
        };
        const accuracyInfo = getAccuracyInfo(user.location.accuracy);
        const userName = user.name || user.fullName || 'Unknown';
        const avatarHtml = user.avatar 
          ? `<img src="${user.avatar}" alt="${userName}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid ${markerColor};" onerror="this.style.display='none'" />`
          : `<div style="width: 40px; height: 40px; border-radius: 50%; background: ${markerColor}; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px;">${userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}</div>`;

        const popupContent = `
          <div style="min-width: 260px;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
              ${avatarHtml}
              <div>
                <strong style="font-size: 14px; display: block;">${userName}</strong>
                <span style="font-size: 11px; color: #666;">${user.roles?.[0] || user.role || 'Team Member'}</span>
              </div>
            </div>
            <div style="background: #f8f9fa; border-radius: 6px; padding: 10px; margin-bottom: 8px;">
              <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                <span style="width: 10px; height: 10px; background: ${markerColor}; border-radius: 50%; display: inline-block;"></span>
                <span style="font-size: 12px; font-weight: 500;">${userStatus.label}</span>
              </div>
              <div style="font-size: 11px; color: #666;">
                Last seen: ${lastSeenText}
              </div>
            </div>
            <div style="font-size: 12px; margin-bottom: 6px;">
              <strong style="color: #444;">GPS Accuracy:</strong> 
              <span style="color: ${accuracyInfo.color}; font-weight: 600;">
                ${accuracyInfo.value} (${accuracyInfo.label})
              </span>
            </div>
            ${user.location?.address ? `
              <div style="font-size: 11px; color: #666; padding-top: 8px; border-top: 1px solid #e5e7eb;">
                ${user.location.address}
              </div>
            ` : ''}
          </div>
        `;

        marker.bindPopup(popupContent);
        markersLayerRef.current?.addLayer(marker);
        bounds.extend([user.location.latitude, user.location.longitude]);
        hasValidBounds = true;
      }
    });

    // Only show sites if showSites is true
    if (showSites) {
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
    }

    if (hasValidBounds && mapRef.current) {
      try {
        mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      } catch (error) {
        console.error('Error fitting bounds:', error);
      }
    }
    
    setLastUpdated(new Date());
  }, [users, siteVisits, onlineUserIds, statusFilter, showSites, getStatusColor, createUserMarkerIcon]);

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
  }, [users, siteVisits, onlineUserIds, statusFilter, showSites, updateMarkers]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (isMapInitializedRef.current) {
        updateMarkers();
      }
    }, AUTO_REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [updateMarkers]);

  useEffect(() => {
    if (mapRef.current) {
      setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 200);
    }
  }, []);

  // Initialize fullscreen map
  const initializeFullscreenMap = useCallback(() => {
    if (!fullscreenMapContainerRef.current || fullscreenMapRef.current) return;

    try {
      const center = mapRef.current?.getCenter() || L.latLng(15.5527, 32.5599);
      const zoom = mapRef.current?.getZoom() || 6;

      fullscreenMapRef.current = L.map(fullscreenMapContainerRef.current, {
        center: [center.lat, center.lng],
        zoom: zoom,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(fullscreenMapRef.current);

      // Copy markers from main map
      const bounds = L.latLngBounds([]);
      let hasValidBounds = false;

      // Add user markers
      const usersToShow = users.filter(user => {
        if (!user.location?.latitude || !user.location?.longitude) return false;
        return true;
      });

      usersToShow.forEach((user) => {
        if (user.location?.latitude && user.location?.longitude) {
          const markerIcon = createUserMarkerIcon(user);
          const marker = L.marker([user.location.latitude, user.location.longitude], {
            icon: markerIcon,
          });
          marker.addTo(fullscreenMapRef.current!);
          bounds.extend([user.location.latitude, user.location.longitude]);
          hasValidBounds = true;
        }
      });

      // Add site markers
      if (showSites) {
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

            const marker = L.marker([lat, lng], { icon: markerIcon });
            marker.addTo(fullscreenMapRef.current!);
            bounds.extend([lat, lng]);
            hasValidBounds = true;
          }
        });
      }

      if (hasValidBounds) {
        try {
          fullscreenMapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        } catch (error) {
          console.error('Error fitting bounds:', error);
        }
      }
    } catch (error) {
      console.error('Error initializing fullscreen map:', error);
    }
  }, [users, siteVisits, showSites, createUserMarkerIcon]);

  // Clean up fullscreen map when closing
  const handleCloseFullscreen = useCallback(() => {
    if (fullscreenMapRef.current) {
      fullscreenMapRef.current.remove();
      fullscreenMapRef.current = null;
    }
    setIsFullscreen(false);
  }, []);

  // Open fullscreen map
  const handleOpenFullscreen = useCallback(() => {
    setIsFullscreen(true);
    // Initialize map after dialog opens
    setTimeout(() => {
      initializeFullscreenMap();
      // Invalidate size after a short delay to ensure proper rendering
      setTimeout(() => {
        fullscreenMapRef.current?.invalidateSize();
      }, 300);
    }, 100);
  }, [initializeFullscreenMap]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onForceRefresh) {
        await onForceRefresh();
      }
      if (mapRef.current) {
        mapRef.current.invalidateSize();
        updateMarkers();
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (lastRefresh) {
      setLastUpdated(lastRefresh);
    }
  }, [lastRefresh]);

  const teamWithLocation = users.filter(u => u.location?.latitude && u.location?.longitude);
  const sitesWithLocation = siteVisits.filter(v => 
    (v.location?.latitude && v.location?.longitude) || 
    (v.coordinates?.latitude && v.coordinates?.longitude)
  );
  
  // Check if user is online based on presence OR recent activity (5 minutes)
  const isUserOnline = (user: User): boolean => {
    // Check presence first (real-time status)
    if (onlineUserIds.has(user.id)) return true;
    // Fall back to activity-based status
    return getUserStatus(user).type === 'online';
  };
  
  const onlineWithLocation = teamWithLocation.filter(u => isUserOnline(u));
  const sameDayWithLocation = teamWithLocation.filter(u => !isUserOnline(u) && getUserStatus(u).type === 'same-day');
  const offlineWithLocation = teamWithLocation.filter(u => !isUserOnline(u) && getUserStatus(u).type === 'offline');

  const usersWithValidAccuracy = teamWithLocation.filter(
    u => u.location?.accuracy !== undefined && u.location?.accuracy !== null && !isNaN(u.location.accuracy)
  );
  const avgAccuracy = usersWithValidAccuracy.length > 0 
    ? usersWithValidAccuracy.reduce((sum, u) => sum + (u.location?.accuracy || 0), 0) / usersWithValidAccuracy.length
    : null;

  const getOverallAccuracyLabel = (avg: number | null) => {
    if (avg === null || isNaN(avg)) return { label: 'N/A', color: 'text-muted-foreground' };
    if (avg <= 10) return { label: 'Excellent', color: 'text-green-600 dark:text-green-400' };
    if (avg <= 30) return { label: 'Good', color: 'text-yellow-600 dark:text-yellow-400' };
    if (avg <= 100) return { label: 'Fair', color: 'text-orange-600 dark:text-orange-400' };
    return { label: 'Poor', color: 'text-red-600 dark:text-red-400' };
  };

  const overallAccuracy = getOverallAccuracyLabel(avgAccuracy);

  // Filter users based on selected status
  const filteredUsers = useMemo(() => {
    if (statusFilter === 'all') return teamWithLocation;
    if (statusFilter === 'online') return onlineWithLocation;
    if (statusFilter === 'active-today') return sameDayWithLocation;
    if (statusFilter === 'offline') return offlineWithLocation;
    return teamWithLocation;
  }, [statusFilter, teamWithLocation, onlineWithLocation, sameDayWithLocation, offlineWithLocation]);

  // Filter sites based on toggle
  const filteredSites = useMemo(() => {
    return showSites ? sitesWithLocation : [];
  }, [showSites, sitesWithLocation]);

  return (
    <div className="space-y-3">
      <Card className="bg-muted/30 border-border/50">
        <CardContent className="p-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            {/* Filter Buttons */}
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <div className="flex items-center gap-1 mr-1">
                <Filter className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground text-xs">Filter:</span>
              </div>
              <Button
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                className="h-6 px-2 text-xs gap-1"
                onClick={() => setStatusFilter('all')}
                data-testid="filter-all"
              >
                All ({teamWithLocation.length})
              </Button>
              <Button
                variant={statusFilter === 'online' ? 'default' : 'outline'}
                size="sm"
                className={`h-6 px-2 text-xs gap-1.5 ${statusFilter !== 'online' ? 'hover:bg-green-500/10 hover:text-green-700 dark:hover:text-green-400 hover:border-green-500/30' : 'bg-green-500 hover:bg-green-600'}`}
                onClick={() => setStatusFilter('online')}
                data-testid="filter-online"
              >
                <div className="w-2 h-2 bg-green-500 rounded-full border border-white/50"></div>
                Online ({onlineWithLocation.length})
              </Button>
              <Button
                variant={statusFilter === 'active-today' ? 'default' : 'outline'}
                size="sm"
                className={`h-6 px-2 text-xs gap-1.5 ${statusFilter !== 'active-today' ? 'hover:bg-orange-500/10 hover:text-orange-700 dark:hover:text-orange-400 hover:border-orange-500/30' : 'bg-orange-500 hover:bg-orange-600'}`}
                onClick={() => setStatusFilter('active-today')}
                data-testid="filter-active-today"
              >
                <div className="w-2 h-2 bg-orange-500 rounded-full border border-white/50"></div>
                Active Today ({sameDayWithLocation.length})
              </Button>
              <Button
                variant={statusFilter === 'offline' ? 'default' : 'outline'}
                size="sm"
                className={`h-6 px-2 text-xs gap-1.5 ${statusFilter !== 'offline' ? 'hover:bg-gray-500/10 hover:text-gray-700 dark:hover:text-gray-400 hover:border-gray-500/30' : 'bg-gray-500 hover:bg-gray-600'}`}
                onClick={() => setStatusFilter('offline')}
                data-testid="filter-offline"
              >
                <div className="w-2 h-2 bg-gray-400 rounded-full border border-white/50"></div>
                Offline ({offlineWithLocation.length})
              </Button>
              <Button
                variant={showSites ? 'default' : 'outline'}
                size="sm"
                className={`h-6 px-2 text-xs gap-1.5 ${!showSites ? 'hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:text-indigo-400 hover:border-indigo-500/30' : 'bg-indigo-500 hover:bg-indigo-600'}`}
                onClick={() => setShowSites(!showSites)}
                data-testid="filter-sites"
              >
                <div className="w-2 h-2 bg-indigo-500 rounded-full border border-white/50"></div>
                Sites ({sitesWithLocation.length})
              </Button>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {avgAccuracy !== null && !isNaN(avgAccuracy) && (
                <Badge variant="outline" className="text-xs gap-1">
                  <span>Avg GPS:</span>
                  <span className={overallAccuracy.color}>
                    ±{avgAccuracy.toFixed(0)}m ({overallAccuracy.label})
                  </span>
                </Badge>
              )}
              <Badge 
                variant={connectionStatus === 'connected' ? 'default' : 'outline'} 
                className={`text-xs gap-1 ${
                  connectionStatus === 'connected' 
                    ? 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30' 
                    : connectionStatus === 'connecting'
                    ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30'
                    : 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30'
                }`}
              >
                {connectionStatus === 'connected' ? (
                  <><Wifi className="h-3 w-3" /> Live</>
                ) : connectionStatus === 'connecting' ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Connecting</>
                ) : (
                  <><WifiOff className="h-3 w-3" /> Offline</>
                )}
              </Badge>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 px-2 text-xs"
                onClick={handleRefresh}
                disabled={isRefreshing}
                data-testid="button-refresh-locations"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0 relative">
          <div 
            ref={mapContainerRef} 
            style={{ height: '500px', width: '100%' }}
            data-testid="team-location-map"
          />
          <div className="absolute top-2 right-2 z-[1000]">
            <Button
              variant="outline"
              size="icon"
              className="bg-background/90 backdrop-blur-sm shadow-sm"
              onClick={handleOpenFullscreen}
              data-testid="button-fullscreen-map"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="absolute bottom-2 left-2 z-[1000]">
            <Badge variant="secondary" className="text-xs bg-background/90 backdrop-blur-sm shadow-sm">
              {teamWithLocation.length} member{teamWithLocation.length !== 1 ? 's' : ''} on map
            </Badge>
          </div>
          <div className="absolute bottom-2 right-2 z-[1000]">
            <Badge 
              variant="outline" 
              className="text-xs bg-background/90 backdrop-blur-sm shadow-sm cursor-pointer hover-elevate"
              onClick={handleRefresh}
              data-testid="button-refresh-map"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Fullscreen Map Dialog */}
      <Dialog open={isFullscreen} onOpenChange={(open) => !open && handleCloseFullscreen()}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="absolute top-0 left-0 right-0 z-[1001] p-4 bg-background/90 backdrop-blur-sm border-b">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Team Locations - Fullscreen View
              </DialogTitle>
              <div className="flex items-center gap-2">
                <Badge 
                  variant={connectionStatus === 'connected' ? 'default' : 'outline'} 
                  className={`text-xs gap-1 ${
                    connectionStatus === 'connected' 
                      ? 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30' 
                      : 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30'
                  }`}
                >
                  {connectionStatus === 'connected' ? (
                    <><Wifi className="h-3 w-3" /> Live</>
                  ) : (
                    <><WifiOff className="h-3 w-3" /> Offline</>
                  )}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {teamWithLocation.length} on map
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCloseFullscreen}
                  data-testid="button-close-fullscreen"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div 
            ref={fullscreenMapContainerRef}
            className="w-full h-full pt-16"
            style={{ minHeight: 'calc(90vh - 4rem)' }}
            data-testid="fullscreen-map-container"
          />
        </DialogContent>
      </Dialog>

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
