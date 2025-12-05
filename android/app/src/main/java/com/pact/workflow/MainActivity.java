package com.pact.workflow;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Enable edge-to-edge display - content extends behind system bars
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        
        // Make status bar and navigation bar transparent
        // Let the Capacitor StatusBar plugin handle icon appearance based on theme
        getWindow().setStatusBarColor(android.graphics.Color.TRANSPARENT);
        getWindow().setNavigationBarColor(android.graphics.Color.TRANSPARENT);
        
        // Create notification channels on app startup
        createNotificationChannels();
    }
    
    @Override
    protected void onResume() {
        super.onResume();
        // Notify FCM service that app is in foreground
        PACTFirebaseMessagingService.setAppForeground(true);
    }
    
    @Override
    protected void onPause() {
        super.onPause();
        // Notify FCM service that app is in background
        PACTFirebaseMessagingService.setAppForeground(false);
    }
    
    private void createNotificationChannels() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            android.app.NotificationManager manager = 
                getSystemService(android.app.NotificationManager.class);
            
            if (manager == null) return;
            
            // Default notification channel
            android.app.NotificationChannel defaultChannel = new android.app.NotificationChannel(
                "pact_notifications",
                "PACT Notifications",
                android.app.NotificationManager.IMPORTANCE_DEFAULT
            );
            defaultChannel.setDescription("General PACT workflow notifications");
            defaultChannel.enableVibration(true);
            defaultChannel.setShowBadge(true);
            manager.createNotificationChannel(defaultChannel);
            
            // High priority channel for urgent notifications
            android.app.NotificationChannel urgentChannel = new android.app.NotificationChannel(
                "pact_urgent",
                "Urgent Notifications",
                android.app.NotificationManager.IMPORTANCE_HIGH
            );
            urgentChannel.setDescription("Urgent notifications requiring immediate attention");
            urgentChannel.enableVibration(true);
            urgentChannel.setShowBadge(true);
            urgentChannel.setBypassDnd(true);
            manager.createNotificationChannel(urgentChannel);
            
            // Location tracking channel
            android.app.NotificationChannel locationChannel = new android.app.NotificationChannel(
                "pact_location_service",
                "Location Tracking",
                android.app.NotificationManager.IMPORTANCE_LOW
            );
            locationChannel.setDescription("Used for continuous location tracking during site visits");
            locationChannel.setShowBadge(false);
            locationChannel.enableVibration(false);
            manager.createNotificationChannel(locationChannel);
        }
    }
}
