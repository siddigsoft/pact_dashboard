import { sudanStates } from '@/data/sudanStates';

export type MapViewportId =
  | 'world'
  | 'east-africa'
  | 'sudan'
  | 'south-sudan'
  | 'uganda'
  | 'rwanda'
  | 'qatar'
  | 'us'
  | 'fit-locations'
  | `state:${string}`;

export interface MapViewport {
  id: MapViewportId;
  label: string;
  group: 'overview' | 'country' | 'state';
  /** Southwest then northeast corners */
  bounds?: [[number, number], [number, number]];
  center?: [number, number];
  zoom?: number;
  maxZoom?: number;
}

const SUDAN_STATE_COORDS: Record<string, [number, number]> = {
  khartoum: [15.5007, 32.5599],
  gezira: [14.4, 33.5],
  'red-sea': [19.6, 37.2],
  kassala: [15.45, 36.4],
  gedarif: [14.0, 35.4],
  'white-nile': [13.2, 32.5],
  'blue-nile': [11.8, 34.2],
  sennar: [13.5, 33.6],
  'north-kordofan': [13.9, 30.8],
  'south-kordofan': [11.2, 29.9],
  'north-darfur': [15.6, 24.9],
  'south-darfur': [11.7, 24.9],
  'west-darfur': [12.9, 23.5],
  'east-darfur': [11.5, 26.1],
  'central-darfur': [12.9, 23.5],
  'river-nile': [18.5, 33.9],
  northern: [19.6, 30.4],
  'west-kordofan': [12.7, 29.2],
};

export const MAP_VIEWPORT_PRESETS: MapViewport[] = [
  {
    id: 'world',
    label: 'World overview',
    group: 'overview',
    center: [15, 20],
    zoom: 2,
  },
  {
    id: 'east-africa',
    label: 'East Africa region',
    group: 'overview',
    bounds: [
      [-4, 21],
      [23, 42],
    ],
    maxZoom: 6,
  },
  {
    id: 'sudan',
    label: 'Sudan',
    group: 'country',
    bounds: [
      [3.5, 21.5],
      [22.5, 38.8],
    ],
    maxZoom: 7,
  },
  {
    id: 'south-sudan',
    label: 'South Sudan',
    group: 'country',
    bounds: [
      [3.5, 23.5],
      [12.2, 35.9],
    ],
    maxZoom: 7,
  },
  {
    id: 'uganda',
    label: 'Uganda',
    group: 'country',
    bounds: [
      [-1.5, 29.5],
      [4.2, 35.0],
    ],
    maxZoom: 8,
  },
  {
    id: 'rwanda',
    label: 'Rwanda',
    group: 'country',
    bounds: [
      [-2.8, 28.8],
      [-1.0, 30.9],
    ],
    maxZoom: 9,
  },
  {
    id: 'qatar',
    label: 'Qatar',
    group: 'country',
    bounds: [
      [24.4, 50.7],
      [26.2, 51.7],
    ],
    maxZoom: 10,
  },
  {
    id: 'us',
    label: 'United States',
    group: 'country',
    bounds: [
      [24.5, -125],
      [49.5, -66],
    ],
    maxZoom: 5,
  },
];

export const SUDAN_STATE_VIEWPORTS: MapViewport[] = sudanStates.map((state) => {
  const center = SUDAN_STATE_COORDS[state.id] ?? [15.5, 32.5];
  const pad = 1.2;
  return {
    id: `state:${state.id}` as MapViewportId,
    label: state.name,
    group: 'state' as const,
    bounds: [
      [center[0] - pad, center[1] - pad],
      [center[0] + pad, center[1] + pad],
    ],
    maxZoom: 10,
  };
});

export const ALL_MAP_VIEWPORTS: MapViewport[] = [
  ...MAP_VIEWPORT_PRESETS,
  ...SUDAN_STATE_VIEWPORTS,
];

export function getMapViewport(id: MapViewportId): MapViewport | undefined {
  if (id === 'fit-locations') {
    return { id: 'fit-locations', label: 'All markers', group: 'overview' };
  }
  return ALL_MAP_VIEWPORTS.find((v) => v.id === id);
}

export const DEFAULT_MAP_VIEWPORT_ID: MapViewportId = 'sudan';
