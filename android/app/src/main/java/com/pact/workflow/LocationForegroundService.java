package com.pact.workflow;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

public class LocationForegroundService extends Service {
    private static final String TAG = "LocationForegroundSvc";
    private static final String CHANNEL_ID = "pact_location_service";
    private static final String CHANNEL_NAME = "Location Tracking";
    private static final int NOTIFICATION_ID = 12345;
    
    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private boolean isTracking = false;
    
    // Location update interval (in milliseconds)
    private static final long UPDATE_INTERVAL = 30000; // 30 seconds
    private static final long FASTEST_INTERVAL = 15000; // 15 seconds
    private static final float MIN_DISPLACEMENT = 10f; // 10 meters
    
    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "Location service created");
        
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        
        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult locationResult) {
                if (locationResult == null) return;
                
                for (Location location : locationResult.getLocations()) {
                    Log.d(TAG, "Location update: " + location.getLatitude() + 
                          ", " + location.getLongitude() + 
                          " (accuracy: " + location.getAccuracy() + "m)");
                    
                    // Broadcast location to the app
                    Intent intent = new Intent("com.pact.workflow.LOCATION_UPDATE");
                    intent.putExtra("latitude", location.getLatitude());
                    intent.putExtra("longitude", location.getLongitude());
                    intent.putExtra("accuracy", location.getAccuracy());
                    intent.putExtra("timestamp", location.getTime());
                    sendBroadcast(intent);
                }
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
        
        // Check permissions before starting
        if (!hasLocationPermission()) {
            Log.e(TAG, "Location permission not granted, stopping service");
            stopSelf();
            return START_NOT_STICKY;
        }
        
        // Start as foreground service
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
        
        // Check for foreground service location permission on Android 10+
        boolean foregroundServiceLocation = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            foregroundServiceLocation = ContextCompat.checkSelfPermission(this, 
                Manifest.permission.FOREGROUND_SERVICE) == PackageManager.PERMISSION_GRANTED;
        }
        
        return (fineLocation || coarseLocation) && foregroundServiceLocation;
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
        
        try {
            LocationRequest locationRequest = new LocationRequest.Builder(
                Priority.PRIORITY_HIGH_ACCURACY, UPDATE_INTERVAL)
                .setMinUpdateIntervalMillis(FASTEST_INTERVAL)
                .setMinUpdateDistanceMeters(MIN_DISPLACEMENT)
                .setWaitForAccurateLocation(true)
                .build();
            
            fusedLocationClient.requestLocationUpdates(
                locationRequest, 
                locationCallback, 
                Looper.getMainLooper()
            );
            
            isTracking = true;
            Log.d(TAG, "Location tracking started");
            
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
            fusedLocationClient.removeLocationUpdates(locationCallback);
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
        
        // Stop action
        Intent stopIntent = new Intent(this, LocationForegroundService.class);
        stopIntent.setAction("STOP");
        PendingIntent stopPendingIntent = PendingIntent.getService(
            this, 1, stopIntent, flags
        );
        
        // Try to use custom icon, fall back to system icon
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
