package com.pact.commandcenter;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        
        getWindow().setStatusBarColor(android.graphics.Color.TRANSPARENT);
        getWindow().setNavigationBarColor(android.graphics.Color.TRANSPARENT);
        
        createNotificationChannels();
    }
    
    @Override
    public void onResume() {
        super.onResume();
        PACTFirebaseMessagingService.setAppForeground(true);
    }
    
    @Override
    public void onPause() {
        super.onPause();
        PACTFirebaseMessagingService.setAppForeground(false);
    }
    
    private void createNotificationChannels() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            android.app.NotificationManager manager = 
                getSystemService(android.app.NotificationManager.class);
            
            if (manager == null) return;
            
            android.app.NotificationChannel defaultChannel = new android.app.NotificationChannel(
                "pact_notifications",
                "PACT Notifications",
                android.app.NotificationManager.IMPORTANCE_DEFAULT
            );
            defaultChannel.setDescription("General PACT workflow notifications");
            defaultChannel.enableVibration(true);
            defaultChannel.setShowBadge(true);
            manager.createNotificationChannel(defaultChannel);
            
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
