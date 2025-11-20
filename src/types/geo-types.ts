
export interface DataCollector {
  id: string;
  name: string;
  location: {
    latitude: number;
    longitude: number;
  };
  status: 'available' | 'busy' | 'offline';
}

export interface GeoSiteVisit {
  id: string;
  name: string;
  location: {
    latitude: number;
    longitude: number;
  };
  status: 'pending' | 'assigned' | 'inProgress' | 'completed';
}

export interface Assignment {
  id: string;
  collectorId: string;
  siteVisitId: string;
  status: 'active' | 'completed';
}

export interface Hub {
  id: string;
  name: string;
  states: string[];
  coordinates: { latitude: number; longitude: number; };
}
