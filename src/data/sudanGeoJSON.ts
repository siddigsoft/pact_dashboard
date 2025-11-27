export const sudanStateBoundaries = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { id: "khartoum", name: "Khartoum", code: "KH", nameAr: "الخرطوم" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [32.0, 15.2], [32.8, 15.2], [33.2, 15.4], [33.4, 15.8],
          [33.2, 16.0], [32.5, 16.0], [32.0, 15.8], [32.0, 15.2]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { id: "gezira", name: "Gezira", code: "GZ", nameAr: "الجزيرة" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [32.5, 13.5], [34.0, 13.5], [34.2, 14.0], [34.0, 14.8],
          [33.2, 15.2], [32.5, 15.2], [32.2, 14.5], [32.5, 13.5]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { id: "red-sea", name: "Red Sea", code: "RS", nameAr: "البحر الأحمر" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [35.5, 17.0], [38.5, 17.0], [38.5, 22.0], [36.5, 22.0],
          [35.0, 20.0], [35.0, 18.0], [35.5, 17.0]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { id: "kassala", name: "Kassala", code: "KS", nameAr: "كسلا" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [35.0, 14.5], [36.8, 14.5], [37.0, 15.5], [36.5, 16.5],
          [35.5, 17.0], [35.0, 16.5], [34.5, 15.5], [35.0, 14.5]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { id: "gedaref", name: "Gedaref", code: "GD", nameAr: "القضارف" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [34.0, 13.0], [36.0, 13.0], [36.5, 14.0], [35.5, 15.0],
          [34.5, 15.0], [34.0, 14.5], [34.0, 13.0]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { id: "white-nile", name: "White Nile", code: "WN", nameAr: "النيل الأبيض" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [31.5, 12.0], [33.0, 12.0], [33.2, 13.0], [32.8, 14.0],
          [32.0, 14.5], [31.0, 14.0], [31.0, 13.0], [31.5, 12.0]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { id: "blue-nile", name: "Blue Nile", code: "BN", nameAr: "النيل الأزرق" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [33.5, 10.5], [35.0, 10.5], [35.5, 11.5], [35.0, 12.5],
          [34.0, 13.0], [33.0, 12.5], [33.0, 11.5], [33.5, 10.5]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { id: "sennar", name: "Sennar", code: "SN", nameAr: "سنار" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [33.0, 12.5], [34.5, 12.5], [35.0, 13.5], [34.2, 14.0],
          [33.2, 14.0], [32.8, 13.5], [33.0, 12.5]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { id: "north-kordofan", name: "North Kordofan", code: "NK", nameAr: "شمال كردفان" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [28.5, 12.5], [31.5, 12.5], [32.0, 14.0], [31.5, 15.5],
          [30.0, 16.0], [28.0, 15.5], [27.5, 14.0], [28.5, 12.5]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { id: "south-kordofan", name: "South Kordofan", code: "SK", nameAr: "جنوب كردفان" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [28.5, 10.0], [31.0, 10.0], [31.5, 11.0], [31.5, 12.5],
          [30.0, 12.5], [28.5, 12.0], [28.0, 11.0], [28.5, 10.0]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { id: "west-kordofan", name: "West Kordofan", code: "WK", nameAr: "غرب كردفان" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [27.0, 11.0], [29.0, 11.0], [29.5, 12.5], [29.0, 14.0],
          [27.5, 14.0], [26.5, 13.0], [26.5, 12.0], [27.0, 11.0]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { id: "north-darfur", name: "North Darfur", code: "ND", nameAr: "شمال دارفور" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [23.0, 14.5], [27.0, 14.5], [27.5, 16.0], [27.0, 18.0],
          [25.0, 20.0], [22.5, 20.0], [22.0, 18.0], [22.5, 16.0], [23.0, 14.5]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { id: "south-darfur", name: "South Darfur", code: "SD", nameAr: "جنوب دارفور" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [24.0, 10.0], [27.0, 10.0], [27.5, 11.5], [27.0, 13.0],
          [25.5, 13.5], [24.0, 13.0], [23.5, 12.0], [24.0, 10.0]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { id: "west-darfur", name: "West Darfur", code: "WD", nameAr: "غرب دارفور" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [22.0, 11.5], [24.0, 11.5], [24.5, 13.0], [24.0, 14.5],
          [22.5, 14.5], [22.0, 13.5], [22.0, 11.5]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { id: "east-darfur", name: "East Darfur", code: "ED", nameAr: "شرق دارفور" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [25.0, 10.5], [27.5, 10.5], [28.0, 12.0], [27.5, 13.5],
          [26.0, 13.5], [25.0, 12.5], [25.0, 10.5]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { id: "central-darfur", name: "Central Darfur", code: "CD", nameAr: "وسط دارفور" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [23.5, 12.0], [25.5, 12.0], [26.0, 13.5], [25.5, 14.5],
          [24.0, 14.5], [23.0, 13.5], [23.5, 12.0]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { id: "river-nile", name: "River Nile", code: "RN", nameAr: "نهر النيل" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [32.5, 16.0], [35.0, 16.0], [35.5, 17.5], [35.0, 19.0],
          [33.5, 20.0], [32.0, 19.5], [32.0, 17.5], [32.5, 16.0]
        ]]
      }
    },
    {
      type: "Feature",
      properties: { id: "northern", name: "Northern", code: "NO", nameAr: "الشمالية" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [28.0, 18.5], [33.5, 18.5], [35.0, 20.0], [33.0, 22.0],
          [30.0, 22.0], [27.0, 21.0], [27.0, 20.0], [28.0, 18.5]
        ]]
      }
    }
  ]
};

export const hubLocations = [
  {
    id: 'kassala-hub',
    name: 'Kassala Hub',
    coordinates: [15.4507, 36.4048] as [number, number],
    color: '#8B5CF6',
    states: ['red-sea', 'kassala', 'gedaref']
  },
  {
    id: 'kosti-hub',
    name: 'Kosti Hub',
    coordinates: [13.1629, 32.6635] as [number, number],
    color: '#F97316',
    states: ['white-nile', 'sennar', 'blue-nile', 'gezira']
  },
  {
    id: 'el-fasher-hub',
    name: 'El Fasher Hub',
    coordinates: [13.6289, 25.3493] as [number, number],
    color: '#EC4899',
    states: ['north-darfur', 'west-darfur', 'south-darfur', 'central-darfur', 'east-darfur']
  },
  {
    id: 'dongola-hub',
    name: 'Dongola Hub',
    coordinates: [19.1653, 30.4763] as [number, number],
    color: '#3B82F6',
    states: ['northern', 'river-nile']
  },
  {
    id: 'country-office',
    name: 'Country Office',
    coordinates: [15.5007, 32.5599] as [number, number],
    color: '#8B5CF6',
    states: ['khartoum', 'north-kordofan', 'south-kordofan', 'west-kordofan']
  }
];

export const stateColors: Record<string, string> = {
  'khartoum': '#8B5CF6',
  'gezira': '#10B981',
  'red-sea': '#EF4444',
  'kassala': '#F59E0B',
  'gedaref': '#6366F1',
  'white-nile': '#06B6D4',
  'blue-nile': '#3B82F6',
  'sennar': '#EC4899',
  'north-kordofan': '#84CC16',
  'south-kordofan': '#F97316',
  'west-kordofan': '#A855F7',
  'north-darfur': '#14B8A6',
  'south-darfur': '#F43F5E',
  'west-darfur': '#8B5CF6',
  'east-darfur': '#EAB308',
  'central-darfur': '#22C55E',
  'river-nile': '#0EA5E9',
  'northern': '#D946EF',
};

export const hubColors: Record<string, string> = {
  'kassala-hub': '#8B5CF6',
  'kosti-hub': '#F97316',
  'el-fasher-hub': '#EC4899',
  'dongola-hub': '#3B82F6',
  'country-office': '#8B5CF6',
};
