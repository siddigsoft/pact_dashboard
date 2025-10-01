# Location Sharing Guide

## Why You Don't See the Map

The map is working correctly, but it shows "No location data available" because **users don't have location coordinates stored in the database**.

## How to Fix This

### Option 1: Enable Location Sharing (Recommended)

1. **Navigate to Settings**
   - Click on your profile or settings icon
   - Go to the "Location" tab

2. **Enable Location Sharing**
   - Click the "Enable Location Sharing" button
   - Allow browser location permissions when prompted
   - Your current GPS coordinates will be captured and saved

3. **View the Map**
   - Go to Dashboard or Field Team page
   - You should now see your location on the map

### Option 2: Manually Add Location Data via Database

If you want to add test data directly to the database:

```sql
-- Update a user's location in Supabase
UPDATE profiles
SET location = jsonb_build_object(
  'latitude', 15.5007,
  'longitude', 32.5599,
  'region', 'Khartoum',
  'isSharing', true,
  'lastUpdated', NOW()
)
WHERE id = 'user-id-here';
```

### Option 3: Add Mock Location Data for Testing

You can add test locations for multiple users:

```sql
-- Khartoum
UPDATE profiles SET location = '{"latitude": 15.5007, "longitude": 32.5599, "region": "Khartoum", "isSharing": true}'::jsonb WHERE email = 'user1@example.com';

-- Kassala
UPDATE profiles SET location = '{"latitude": 15.45, "longitude": 36.4, "region": "Kassala", "isSharing": true}'::jsonb WHERE email = 'user2@example.com';

-- Gedaref
UPDATE profiles SET location = '{"latitude": 14.0, "longitude": 35.4, "region": "Gedaref", "isSharing": true}'::jsonb WHERE email = 'user3@example.com';

-- Port Sudan
UPDATE profiles SET location = '{"latitude": 19.6, "longitude": 37.2, "region": "Red Sea", "isSharing": true}'::jsonb WHERE email = 'user4@example.com';
```

## Features of the Location System

### 1. **Location Capture Component**
- Automatically requests browser geolocation
- Saves coordinates to user profile
- Shows current location status
- Displays last update time

### 2. **Map Display**
- Shows all users with location data
- Color-coded markers by availability:
  - 🟢 Green = Online
  - 🟡 Yellow = Busy
  - ⚫ Gray = Offline
- Interactive popups with user details
- Auto-fits bounds to show all locations

### 3. **Privacy & Control**
- Users control their own location sharing
- Location can be updated anytime
- Visible only to supervisors/coordinators
- Used for nearby assignment matching

## Map Components Updated

All these components now display OpenStreetMap:

1. ✅ **SimpleFieldTeamMap** (field-team folder) - Team locations view
2. ✅ **SimpleFieldTeamMap** (map folder) - Team + site visits
3. ✅ **StaticTeamMap** - Dashboard widget
4. ✅ **LeafletMapContainer** - Core map component
5. ✅ **MapComponent** - Custom markers map
6. ✅ **FieldTeamMap** - Full team map with filters
7. ✅ **DynamicFieldTeamMap** - Dynamic loading map

## Troubleshooting

### Map shows "No location data available"
- **Cause**: No users have location coordinates
- **Solution**: Enable location sharing in Settings → Location tab

### Browser doesn't request location permission
- **Cause**: Location access blocked or not supported
- **Solution**: 
  - Check browser settings
  - Enable location services
  - Try a different browser (Chrome/Firefox recommended)

### Location not updating
- **Cause**: Database connection issue or RLS policy
- **Solution**: Check Supabase connection and RLS policies for profiles table

### Map not loading
- **Cause**: Leaflet library not loaded
- **Solution**: Check console for errors, ensure `leaflet` and `react-leaflet` are installed

## Technical Details

### Database Schema
```typescript
interface User {
  location?: {
    latitude: number;
    longitude: number;
    region?: string;
    address?: string;
    isSharing?: boolean;
    lastUpdated?: string;
  }
}
```

### API Endpoints Used
- `updateUserLocation(latitude, longitude)` - Updates user location
- `toggleLocationSharing(isSharing)` - Enables/disables sharing

### Map Configuration
- **Tile Provider**: OpenStreetMap
- **Default Center**: [15.5007, 32.5599] (Sudan)
- **Default Zoom**: 6
- **Bounds**: Sudan territory
