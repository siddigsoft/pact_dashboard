package com.pact.commandcenter;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

public class LocationForegroundService extends Service {
    private static final String TAG = "LocationForegroundSvc";
    private static final String CHANNEL_ID = "pact_location_service";
    private static final String CHANNEL_NAME = "Location Tracking";
    private static final int NOTIFICATION_ID = 12345;
    
    private LocationManager locationManager;
    private LocationListener locationListener;
    private boolean isTracking = false;
    
    private static final long UPDATE_INTERVAL = 30000;
    private static final float MIN_DISPLACEMENT = 10f;
    
    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "Location service created");
        
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        
        locationListener = new LocationListener() {
            @Override
            public void onLocationChanged(@NonNull Location location) {
                Log.d(TAG, "Location update: " + location.getLatitude() + 
                      ", " + location.getLongitude() + 
                      " (accuracy: " + location.getAccuracy() + "m)");
                
                Intent intent = new Intent("com.pact.commandcenter.LOCATION_UPDATE");
                intent.putExtra("latitude", location.getLatitude());
                intent.putExtra("longitude", location.getLongitude());
                intent.putExtra("accuracy", location.getAccuracy());
                intent.putExtra("timestamp", location.getTime());
                sendBroadcast(intent);
            }
            
            @Override
            public void onStatusChanged(String provider, int status, Bundle extras) {
                Log.d(TAG, "Provider status changed: " + provider + " status: " + status);
            }
            
            @Override
            public void onProviderEnabled(@NonNull String provider) {
                Log.d(TAG, "Provider enabled: " + provider);
            }
            
            @Override
            public void onProviderDisabled(@NonNull String provider) {
                Log.d(TAG, "Provider disabled: " + provider);
            }
        };
        
        createNotificationChannel();
    }
    
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "Location service started");
        
        if (intent != null) {
            String action = intent.getAction();
            if ("STOP".equals(action)) {
                stopTracking();
                stopForeground(true);
                stopSelf();
                return START_NOT_STICKY;
            }
        }
        
        if (!hasLocationPermission()) {
            Log.e(TAG, "Location permission not granted, stopping service");
            stopSelf();
            return START_NOT_STICKY;
        }
        
        Notification notification = createNotification();
        
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, 
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            
            startTracking();
        } catch (Exception e) {
            Log.e(TAG, "Failed to start foreground service", e);
            stopSelf();
            return START_NOT_STICKY;
        }
        
        return START_STICKY;
    }
    
    private boolean hasLocationPermission() {
        boolean fineLocation = ContextCompat.checkSelfPermission(this, 
            Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarseLocation = ContextCompat.checkSelfPermission(this, 
            Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        
        return fineLocation || coarseLocation;
    }
    
    private void startTracking() {
        if (isTracking) {
            Log.d(TAG, "Already tracking location");
            return;
        }
        
        if (!hasLocationPermission()) {
            Log.e(TAG, "Cannot start tracking: permission not granted");
            return;
        }
        
        if (locationManager == null) {
            Log.e(TAG, "LocationManager is null");
            return;
        }
        
        try {
            String provider = LocationManager.GPS_PROVIDER;
            if (!locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    provider = LocationManager.NETWORK_PROVIDER;
                } else {
                    Log.e(TAG, "No location provider available");
                    stopSelf();
                    return;
                }
            }
            
            locationManager.requestLocationUpdates(
                provider,
                UPDATE_INTERVAL,
                MIN_DISPLACEMENT,
                locationListener
            );
            
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) && 
                !provider.equals(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER,
                    UPDATE_INTERVAL,
                    MIN_DISPLACEMENT,
                    locationListener
                );
            }
            
            isTracking = true;
            Log.d(TAG, "Location tracking started with provider: " + provider);
            
        } catch (SecurityException e) {
            Log.e(TAG, "Location permission not granted", e);
            stopSelf();
        } catch (Exception e) {
            Log.e(TAG, "Failed to start location tracking", e);
            stopSelf();
        }
    }
    
    private void stopTracking() {
        if (!isTracking) return;
        
        try {
            if (locationManager != null && locationListener != null) {
                locationManager.removeUpdates(locationListener);
            }
            isTracking = false;
            Log.d(TAG, "Location tracking stopped");
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop location tracking", e);
        }
    }
    
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Used for continuous location tracking during site visits");
            channel.setShowBadge(false);
            channel.enableVibration(false);
            
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
    
    private Notification createNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, notificationIntent, flags
        );
        
        Intent stopIntent = new Intent(this, LocationForegroundService.class);
        stopIntent.setAction("STOP");
        PendingIntent stopPendingIntent = PendingIntent.getService(
            this, 1, stopIntent, flags
        );
        
        int iconId = getResources().getIdentifier(
            "ic_notification", "drawable", getPackageName()
        );
        if (iconId == 0) {
            iconId = android.R.drawable.ic_menu_mylocation;
        }
        
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("PACT Location Tracking")
            .setContentText("Tracking your location for site visits")
            .setSmallIcon(iconId)
            .setContentIntent(pendingIntent)
            .addAction(android.R.drawable.ic_media_pause, "Stop", stopPendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
    }
    
    @Override
    public void onDestroy() {
        super.onDestroy();
        stopTracking();
        Log.d(TAG, "Location service destroyed");
    }
    
    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
