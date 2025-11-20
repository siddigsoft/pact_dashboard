
import React from 'react';
import { Circle } from 'react-leaflet';
import { Hub } from '@/types';

interface HubHighlightProps {
  hub: Hub;
  color: string;
}

const HubHighlight: React.FC<HubHighlightProps> = ({ hub, color }) => {
  if (!hub.coordinates?.latitude || !hub.coordinates?.longitude) {
    return null;
  }

  return (
    <Circle
      center={[hub.coordinates.latitude, hub.coordinates.longitude]}
      radius={50000} // 50km radius
      pathOptions={{
        fillColor: color,
        fillOpacity: 0.2,
        color: color,
        weight: 2
      }}
    />
  );
};

export default HubHighlight;
