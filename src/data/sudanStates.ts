
import { Hub } from '@/types';

export interface SudanState {
  id: string;
  name: string;
  code: string;
  localities: { id: string; name: string; }[];
}

export const sudanStates: SudanState[] = [
  { id: 'khartoum', name: 'Khartoum', code: 'KH', localities: [
    { id: 'kh-bahri', name: 'Bahri' },
    { id: 'kh-omdurman', name: 'Omdurman' },
    { id: 'kh-central', name: 'Khartoum Central' },
    { id: 'kh-east', name: 'Eastern Khartoum' },
  ]},
  { id: 'gezira', name: 'Al Jazirah (Gezira)', code: 'GZ', localities: [
    { id: 'gz-wad-madani', name: 'Wad Madani' },
    { id: 'gz-hasaheisa', name: 'Al Hasaheisa' },
    { id: 'gz-kamlin', name: 'Kamlin' },
  ]},
  { id: 'red-sea', name: 'Red Sea', code: 'RS', localities: [
    { id: 'rs-port-sudan', name: 'Port Sudan' },
    { id: 'rs-suakin', name: 'Suakin' },
  ]},
  { id: 'kassala', name: 'Kassala', code: 'KS', localities: [
    { id: 'ks-kassala-city', name: 'Kassala City' },
    { id: 'ks-aroma', name: 'Aroma' },
  ]},
  { id: 'gedaref', name: 'Al Qadarif', code: 'GD', localities: [
    { id: 'gd-gedaref-city', name: 'Gedaref City' },
    { id: 'gd-fao', name: 'Al Fao' },
  ]},
  { id: 'white-nile', name: 'White Nile', code: 'WN', localities: [
    { id: 'wn-rabak', name: 'Rabak' },
    { id: 'wn-kosti', name: 'Kosti' },
  ]},
  { id: 'blue-nile', name: 'Blue Nile', code: 'BN', localities: [
    { id: 'bn-damazin', name: 'Damazin' },
    { id: 'bn-roseieres', name: 'Roseieres' },
  ]},
  { id: 'sennar', name: 'Sennar', code: 'SN', localities: [
    { id: 'sn-singa', name: 'Singa' },
    { id: 'sn-sennar', name: 'Sennar' },
  ]},
  { id: 'north-kordofan', name: 'North Kordofan', code: 'NK', localities: [
    { id: 'nk-elobeid', name: 'El Obeid' },
    { id: 'nk-bara', name: 'Bara' },
  ]},
  { id: 'south-kordofan', name: 'South Kordofan', code: 'SK', localities: [
    { id: 'sk-kadugli', name: 'Kadugli' },
    { id: 'sk-dilling', name: 'Dilling' },
  ]},
  { id: 'north-darfur', name: 'North Darfur', code: 'ND', localities: [
    { id: 'nd-el-fasher', name: 'El Fasher' },
    { id: 'nd-kutum', name: 'Kutum' },
  ]},
  { id: 'south-darfur', name: 'South Darfur', code: 'SD', localities: [
    { id: 'sd-nyala', name: 'Nyala' },
    { id: 'sd-buram', name: 'Buram' },
  ]},
  { id: 'west-darfur', name: 'West Darfur', code: 'WD', localities: [
    { id: 'wd-el-geneina', name: 'El Geneina' },
    { id: 'wd-zalingei', name: 'Zalingei' },
  ]},
  { id: 'east-darfur', name: 'East Darfur', code: 'ED', localities: [
    { id: 'ed-ed-daein', name: 'Ed Daein' },
    { id: 'ed-abu-karinka', name: 'Abu Karinka' },
  ]},
  { id: 'central-darfur', name: 'Central Darfur', code: 'CD', localities: [
    { id: 'cd-zalingei', name: 'Zalingei' },
    { id: 'cd-mukjar', name: 'Mukjar' },
  ]},
  { id: 'river-nile', name: 'River Nile', code: 'RN', localities: [
    { id: 'rn-ed-damer', name: 'Ed Damer' },
    { id: 'rn-atbara', name: 'Atbara' },
  ]},
  { id: 'northern', name: 'Northern State', code: 'NS', localities: [
    { id: 'ns-dongola', name: 'Dongola' },
    { id: 'ns-wadi-halfa', name: 'Wadi Halfa' },
    { id: 'ns-al-borgag', name: 'Al Borgag' },
  ]},
  { id: 'west-kordofan', name: 'West Kordofan', code: 'WK', localities: [
    { id: 'wk-en-nahud', name: 'En Nahud' },
    { id: 'wk-el-fula', name: 'El Fula' },
  ]},
];

export const hubs: Hub[] = [
  {
    id: 'kassala-hub',
    name: 'Kassala Hub',
    states: ['kassala', 'red-sea', 'gedaref'],
    coordinates: { latitude: 15.45, longitude: 36.4 }
  },
  {
    id: 'kosti-hub',
    name: 'Kosti Hub',
    states: ['white-nile', 'sennar', 'blue-nile'],
    coordinates: { latitude: 13.2, longitude: 32.5 }
  },
  {
    id: 'forchana-hub',
    name: 'El Fasher Hub',
    states: ['north-darfur', 'south-darfur', 'west-darfur', 'central-darfur', 'east-darfur'],
    coordinates: { latitude: 13.63, longitude: 25.35 }
  },
  {
    id: 'dongola-hub',
    name: 'Dongola Hub',
    states: ['northern', 'river-nile'],
    coordinates: { latitude: 19.16, longitude: 30.48 }
  },
  {
    id: 'country-office',
    name: 'Country Office',
    states: ['khartoum', 'gezira', 'north-kordofan', 'south-kordofan', 'west-kordofan'],
    coordinates: { latitude: 15.5007, longitude: 32.5599 }
  }
];

/**
 * Sample Structure of Each Hub (for your review):
 * 
 * Kassala Hub: {
 *    gezira:    "Al Jazirah (Gezira)",
 *    blue-nile: "Blue Nile",
 *    gedaref:   "Al Qadarif",
 *    kassala:   "Kassala",
 *    sennar:    "Sennar"
 * }
 * Kosti Hub: {
 *    east-darfur:   "East Darfur",
 *    north-darfur:  "North Darfur",
 *    north-kordofan:"North Kordofan",
 *    south-darfur:  "South Darfur",
 *    south-kordofan:"South Kordofan",
 *    west-kordofan: "West Kordofan",
 *    white-nile:    "White Nile"
 * }
 * Forchana Hub: {
 *    west-darfur:    "West Darfur",
 *    central-darfur: "Central Darfur"
 * }
 * Dongola Hub: {
 *    northern:   "Northern State",
 *    river-nile: "River Nile"
 * }
 * Country Office (CO) Hub: {
 *    red-sea:  "Red Sea",
 *    khartoum: "Khartoum"
 * }
 */

/**
 * Get localities for a given state
 */
export const getLocalitiesByState = (stateId: string): { id: string; name: string; }[] => {
  const state = sudanStates.find(s => s.id === stateId);
  return state ? state.localities : [];
};

/**
 * Get state name by ID
 */
export const getStateName = (stateId: string): string => {
  const state = sudanStates.find(s => s.id === stateId);
  return state ? state.name : stateId;
};

/**
 * Get locality name by ID and state ID
 */
export const getLocalityName = (stateId: string, localityId: string): string => {
  const state = sudanStates.find(s => s.id === stateId);
  if (!state) return localityId;
  
  const locality = state.localities.find(l => l.id === localityId);
  return locality ? locality.name : localityId;
};

/**
 * Get hub for a given state
 */
export const getHubForState = (stateId: string): string | undefined => {
  const hub = hubs.find(h => h.states.includes(stateId));
  return hub?.id;
};
