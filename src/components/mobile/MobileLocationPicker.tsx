import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MapPin, 
  Search, 
  Locate, 
  X, 
  Check, 
  Navigation,
  Loader2,
  Clock,
  Star,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface Location {
  latitude: number;
  longitude: number;
  address?: string;
  name?: string;
}

interface SavedLocation extends Location {
  id: string;
  isFavorite?: boolean;
  lastUsed?: Date;
}

interface MobileLocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (location: Location) => void;
  initialLocation?: Location;
  savedLocations?: SavedLocation[];
  showSearch?: boolean;
  showCurrentLocation?: boolean;
  showSavedLocations?: boolean;
  title?: string;
  className?: string;
}

export function MobileLocationPicker({
  isOpen,
  onClose,
  onSelect,
  initialLocation,
  savedLocations = [],
  showSearch = true,
  showCurrentLocation = true,
  showSavedLocations = true,
  title = 'Select Location',
  className,
}: MobileLocationPickerProps) {
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(initialLocation || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [mapCenter, setMapCenter] = useState(initialLocation || { latitude: 15.5007, longitude: 32.5599 });
  const mapRef = useRef<HTMLDivElement>(null);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    hapticPresets.buttonPress();
    setIsSearching(true);

    setTimeout(() => {
      const mockResults: Location[] = [
        { latitude: 15.5007, longitude: 32.5599, address: 'Khartoum, Sudan', name: 'Khartoum City Center' },
        { latitude: 15.5927, longitude: 32.5343, address: 'Omdurman, Sudan', name: 'Omdurman' },
        { latitude: 15.5510, longitude: 32.5765, address: 'Bahri, Sudan', name: 'Khartoum North' },
      ].filter(r => 
        r.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.address?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setSearchResults(mockResults);
      setIsSearching(false);
    }, 800);
  }, [searchQuery]);

  const handleCurrentLocation = useCallback(async () => {
    hapticPresets.buttonPress();
    setIsLocating(true);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      const location: Location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        name: 'Current Location',
      };

      setSelectedLocation(location);
      setMapCenter(location);
      hapticPresets.success();
    } catch (error) {
      console.error('Geolocation error:', error);
      hapticPresets.error();
    } finally {
      setIsLocating(false);
    }
  }, []);

  const handleMapPress = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;

    const latRange = 0.05;
    const lngRange = 0.05;
    
    const latitude = mapCenter.latitude + (0.5 - y) * latRange;
    const longitude = mapCenter.longitude + (x - 0.5) * lngRange;

    const location: Location = { latitude, longitude };
    setSelectedLocation(location);
    hapticPresets.selection();
  }, [mapCenter]);

  const handleSelectLocation = useCallback((location: Location) => {
    hapticPresets.selection();
    setSelectedLocation(location);
    setMapCenter(location);
    setSearchResults([]);
  }, []);

  const handleConfirm = useCallback(() => {
    if (selectedLocation) {
      hapticPresets.success();
      onSelect(selectedLocation);
      onClose();
    }
  }, [selectedLocation, onSelect, onClose]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-white dark:bg-neutral-900 flex flex-col"
        data-testid="location-picker"
      >
        <div className="flex items-center gap-3 p-4 border-b border-black/10 dark:border-white/10">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              hapticPresets.buttonPress();
              onClose();
            }}
            data-testid="button-close-location-picker"
          >
            <X className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-semibold text-black dark:text-white flex-1">
            {title}
          </h2>
          <Button
            variant="default"
            size="sm"
            onClick={handleConfirm}
            disabled={!selectedLocation}
            className="rounded-full bg-black dark:bg-white text-white dark:text-black"
            data-testid="button-confirm-location"
          >
            <Check className="h-4 w-4 mr-1" />
            Done
          </Button>
        </div>

        {showSearch && (
          <div className="p-4 border-b border-black/10 dark:border-white/10">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-black/40 dark:text-white/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search for a location..."
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-black/5 dark:bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20"
                data-testid="input-location-search"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-black/40 dark:text-white/40" />
              )}
            </div>

            {searchResults.length > 0 && (
              <div className="mt-2 rounded-xl bg-white dark:bg-neutral-800 border border-black/10 dark:border-white/10 overflow-hidden">
                {searchResults.map((result, index) => (
                  <button
                    key={index}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-black/5 dark:hover:bg-white/5"
                    onClick={() => handleSelectLocation(result)}
                    data-testid={`search-result-${index}`}
                  >
                    <MapPin className="h-5 w-5 text-black/40 dark:text-white/40 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-black dark:text-white truncate">
                        {result.name}
                      </p>
                      {result.address && (
                        <p className="text-xs text-black/60 dark:text-white/60 truncate">
                          {result.address}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div 
          ref={mapRef}
          className="flex-1 relative bg-neutral-100 dark:bg-neutral-800 overflow-hidden"
          onClick={handleMapPress}
          data-testid="location-map"
        >
          <div className="absolute inset-0 grid-pattern opacity-20" />

          {selectedLocation && (
            <motion.div
              className="absolute z-10"
              style={{
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -100%)',
              }}
              initial={{ scale: 0, y: 20 }}
              animate={{ scale: 1, y: 0 }}
            >
              <div className="w-10 h-10 rounded-full bg-black dark:bg-white flex items-center justify-center shadow-lg">
                <MapPin className="h-5 w-5 text-white dark:text-black" />
              </div>
              <div className="w-3 h-3 bg-black dark:bg-white rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2" />
            </motion.div>
          )}

          {showCurrentLocation && (
            <button
              className="absolute bottom-4 right-4 w-12 h-12 rounded-full bg-white dark:bg-neutral-900 shadow-lg flex items-center justify-center z-20"
              onClick={handleCurrentLocation}
              disabled={isLocating}
              data-testid="button-current-location"
            >
              {isLocating ? (
                <Loader2 className="h-5 w-5 animate-spin text-black dark:text-white" />
              ) : (
                <Locate className="h-5 w-5 text-black dark:text-white" />
              )}
            </button>
          )}

          {selectedLocation && (
            <div className="absolute bottom-20 left-4 right-4 bg-white dark:bg-neutral-900 rounded-xl shadow-lg p-3 z-20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center flex-shrink-0">
                  <MapPin className="h-5 w-5 text-black dark:text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-black dark:text-white">
                    {selectedLocation.name || 'Selected Location'}
                  </p>
                  <p className="text-xs text-black/60 dark:text-white/60 font-mono">
                    {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {showSavedLocations && savedLocations.length > 0 && !searchQuery && (
          <div className="border-t border-black/10 dark:border-white/10 max-h-[30vh] overflow-y-auto">
            <div className="p-3">
              <p className="text-xs font-semibold text-black/40 dark:text-white/40 uppercase mb-2 px-1">
                Saved Locations
              </p>
              <div className="space-y-1">
                {savedLocations.map((location) => (
                  <button
                    key={location.id}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-left"
                    onClick={() => handleSelectLocation(location)}
                    data-testid={`saved-location-${location.id}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center flex-shrink-0">
                      {location.isFavorite ? (
                        <Star className="h-4 w-4 text-black dark:text-white fill-current" />
                      ) : (
                        <Clock className="h-4 w-4 text-black/40 dark:text-white/40" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-black dark:text-white truncate">
                        {location.name}
                      </p>
                      {location.address && (
                        <p className="text-xs text-black/60 dark:text-white/60 truncate">
                          {location.address}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-black/40 dark:text-white/40 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

interface LocationButtonProps {
  location?: Location;
  onSelect: (location: Location) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function LocationButton({
  location,
  onSelect,
  placeholder = 'Select Location',
  disabled = false,
  className,
}: LocationButtonProps) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <>
      <button
        className={cn(
          "w-full flex items-center gap-3 p-3 rounded-xl border border-black/10 dark:border-white/10 text-left",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
        onClick={() => {
          if (!disabled) {
            hapticPresets.buttonPress();
            setShowPicker(true);
          }
        }}
        disabled={disabled}
        data-testid="button-select-location"
      >
        <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center flex-shrink-0">
          <MapPin className="h-5 w-5 text-black dark:text-white" />
        </div>
        <div className="flex-1 min-w-0">
          {location ? (
            <>
              <p className="text-sm font-medium text-black dark:text-white">
                {location.name || 'Selected Location'}
              </p>
              <p className="text-xs text-black/60 dark:text-white/60 font-mono">
                {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
              </p>
            </>
          ) : (
            <p className="text-sm text-black/40 dark:text-white/40">{placeholder}</p>
          )}
        </div>
        <ChevronRight className="h-5 w-5 text-black/40 dark:text-white/40 flex-shrink-0" />
      </button>

      <MobileLocationPicker
        isOpen={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={(loc) => {
          onSelect(loc);
          setShowPicker(false);
        }}
        initialLocation={location}
      />
    </>
  );
}

interface LocationPreviewProps {
  location: Location;
  showCoordinates?: boolean;
  className?: string;
}

export function LocationPreview({
  location,
  showCoordinates = true,
  className,
}: LocationPreviewProps) {
  return (
    <div 
      className={cn(
        "rounded-xl border border-black/10 dark:border-white/10 overflow-hidden",
        className
      )}
      data-testid="location-preview"
    >
      <div className="h-32 bg-neutral-100 dark:bg-neutral-800 relative">
        <div className="absolute inset-0 grid-pattern opacity-20" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full">
          <div className="w-8 h-8 rounded-full bg-black dark:bg-white flex items-center justify-center shadow-lg">
            <MapPin className="h-4 w-4 text-white dark:text-black" />
          </div>
        </div>
      </div>
      
      <div className="p-3">
        <p className="text-sm font-medium text-black dark:text-white">
          {location.name || 'Location'}
        </p>
        {location.address && (
          <p className="text-xs text-black/60 dark:text-white/60 mt-0.5">
            {location.address}
          </p>
        )}
        {showCoordinates && (
          <p className="text-xs text-black/40 dark:text-white/40 font-mono mt-1">
            {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
          </p>
        )}
      </div>
    </div>
  );
}
