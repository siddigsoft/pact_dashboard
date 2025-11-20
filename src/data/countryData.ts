
export interface CountryData {
  code: string;
  name: string;
  currency: {
    code: string;
    symbol: string;
    name: string;
  };
  regions: {
    id: string;
    name: string;
    states: {
      id: string;
      name: string;
      localities?: { id: string; name: string; }[];
    }[];
  }[];
}

export const countries: CountryData[] = [
  {
    code: 'SD',
    name: 'Sudan',
    currency: {
      code: 'SDG',
      symbol: 'SDG',
      name: 'Sudanese Pound'
    },
    regions: [
      {
        id: 'darfur',
        name: 'Darfur',
        states: [
          {
            id: 'north-darfur',
            name: 'North Darfur',
            localities: [
              { id: 'el-fasher', name: 'El Fasher' },
              { id: 'mellit', name: 'Mellit' },
            ]
          },
          {
            id: 'south-darfur',
            name: 'South Darfur',
            localities: [
              { id: 'nyala', name: 'Nyala' },
              { id: 'buram', name: 'Buram' },
            ]
          }
        ]
      }
    ]
  },
  {
    code: 'SS',
    name: 'South Sudan',
    currency: {
      code: 'SSP',
      symbol: 'SSP',
      name: 'South Sudanese Pound'
    },
    regions: [
      {
        id: 'equatoria',
        name: 'Equatoria',
        states: [
          {
            id: 'central-equatoria',
            name: 'Central Equatoria',
            localities: [
              { id: 'juba', name: 'Juba' },
              { id: 'yei', name: 'Yei' },
            ]
          }
        ]
      }
    ]
  },
  {
    code: 'UG',
    name: 'Uganda',
    currency: {
      code: 'UGX',
      symbol: 'USh',
      name: 'Ugandan Shilling'
    },
    regions: [
      {
        id: 'central',
        name: 'Central Region',
        states: [
          {
            id: 'kampala',
            name: 'Kampala',
            localities: [
              { id: 'central-division', name: 'Central Division' },
              { id: 'nakawa', name: 'Nakawa' },
            ]
          }
        ]
      }
    ]
  },
  {
    code: 'RW',
    name: 'Rwanda',
    currency: {
      code: 'RWF',
      symbol: 'RF',
      name: 'Rwandan Franc'
    },
    regions: [
      {
        id: 'kigali',
        name: 'Kigali Province',
        states: [
          {
            id: 'nyarugenge',
            name: 'Nyarugenge',
            localities: [
              { id: 'gitega', name: 'Gitega' },
              { id: 'nyamirambo', name: 'Nyamirambo' },
            ]
          }
        ]
      }
    ]
  },
  {
    code: 'QA',
    name: 'Qatar',
    currency: {
      code: 'QAR',
      symbol: 'ر.ق',
      name: 'Qatari Riyal'
    },
    regions: [
      {
        id: 'doha',
        name: 'Doha',
        states: [
          {
            id: 'doha-municipality',
            name: 'Doha Municipality',
            localities: [
              { id: 'west-bay', name: 'West Bay' },
              { id: 'pearl', name: 'The Pearl' },
            ]
          }
        ]
      }
    ]
  },
  {
    code: 'US',
    name: 'United States',
    currency: {
      code: 'USD',
      symbol: '$',
      name: 'US Dollar'
    },
    regions: [
      {
        id: 'northeast',
        name: 'Northeast',
        states: [
          {
            id: 'ny',
            name: 'New York',
            localities: [
              { id: 'nyc', name: 'New York City' },
              { id: 'buffalo', name: 'Buffalo' },
            ]
          }
        ]
      }
    ]
  }
];

export const getCountryByCode = (code: string): CountryData | undefined => {
  return countries.find(country => country.code === code);
};

export const getRegionsByCountry = (countryCode: string) => {
  const country = getCountryByCode(countryCode);
  return country?.regions || [];
};

export const getStatesByRegion = (countryCode: string, regionId: string) => {
  const country = getCountryByCode(countryCode);
  const region = country?.regions.find(r => r.id === regionId);
  return region?.states || [];
};

export const getLocalitiesByState = (countryCode: string, regionId: string, stateId: string) => {
  const states = getStatesByRegion(countryCode, regionId);
  const state = states.find(s => s.id === stateId);
  return state?.localities || [];
};
