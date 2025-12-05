package com.pact.workflow;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class PACTFirebaseMessagingService extends FirebaseMessagingService {
    private static final String TAG = "PACTFCMService";
    private static final String CHANNEL_ID = "pact_notifications";
    private static final String CHANNEL_NAME = "PACT Notifications";
    private static final String CHANNEL_HIGH_ID = "pact_urgent";
    private static final String CHANNEL_HIGH_NAME = "Urgent Notifications";
    private static final String PREFS_NAME = "pact_fcm_prefs";
    private static final String TOKEN_KEY = "fcm_token";
    private static final String TOKEN_TIMESTAMP_KEY = "fcm_token_timestamp";
    
    private static boolean isAppInForeground = false;
    
    public static void setAppForeground(boolean foreground) {
        isAppInForeground = foreground;
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        Log.d(TAG, "Message received from: " + remoteMessage.getFrom());

        String title = null;
        String body = null;
        String priority = "normal";
        String route = null;
        String type = null;

        // Extract notification data
        if (remoteMessage.getNotification() != null) {
            title = remoteMessage.getNotification().getTitle();
            body = remoteMessage.getNotification().getBody();
        }

        // Extract data payload
        Map<String, String> data = remoteMessage.getData();
        if (data.size() > 0) {
            Log.d(TAG, "Message data payload: " + data);
            
            // Override with data payload if present
            if (data.containsKey("title")) {
                title = data.get("title");
            }
            if (data.containsKey("body")) {
                body = data.get("body");
            }
            if (data.containsKey("priority")) {
                priority = data.get("priority");
            }
            if (data.containsKey("route")) {
                route = data.get("route");
            }
            if (data.containsKey("type")) {
                type = data.get("type");
            }
            
            // Handle silent data-only messages
            if (title == null && body == null) {
                handleDataOnlyMessage(data);
                return;
            }
        }

        // Show notification if we have content
        if (title != null || body != null) {
            // Don't show notification if app is in foreground and it's not urgent
            // Let the web layer handle foreground notifications to avoid duplicates
            if (isAppInForeground && !"high".equals(priority) && !"urgent".equals(priority)) {
                Log.d(TAG, "App in foreground, skipping system notification for non-urgent message");
                return;
            }
            
            showNotification(title, body, priority, route, type, data);
        }
    }
    
    private void handleDataOnlyMessage(Map<String, String> data) {
        String action = data.get("action");
        if (action == null) return;
        
        Log.d(TAG, "Handling data-only message with action: " + action);
        
        switch (action) {
            case "sync":
                // Trigger background sync
                Log.d(TAG, "Sync action received - broadcasting to app");
                Intent syncIntent = new Intent("com.pact.workflow.SYNC_REQUESTED");
                sendBroadcast(syncIntent);
                break;
                
            case "location_update":
                // Request location update
                Log.d(TAG, "Location update action received");
                Intent locationIntent = new Intent("com.pact.workflow.LOCATION_UPDATE_REQUESTED");
                sendBroadcast(locationIntent);
                break;
                
            case "token_refresh":
                // Force token refresh
                Log.d(TAG, "Token refresh action received");
                // Token will be refreshed automatically by Firebase
                break;
                
            default:
                Log.d(TAG, "Unknown action: " + action);
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        Log.d(TAG, "New FCM token received");
        
        // Save token locally for persistence
        saveTokenLocally(token);
        
        // Notify the app about the new token
        Intent intent = new Intent("com.pact.workflow.FCM_TOKEN_REFRESHED");
        intent.putExtra("token", token);
        sendBroadcast(intent);
        
        Log.d(TAG, "Token saved and broadcast sent");
    }
    
    private void saveTokenLocally(String token) {
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();
            editor.putString(TOKEN_KEY, token);
            editor.putLong(TOKEN_TIMESTAMP_KEY, System.currentTimeMillis());
            editor.apply();
            Log.d(TAG, "Token saved to SharedPreferences");
        } catch (Exception e) {
            Log.e(TAG, "Failed to save token locally", e);
        }
    }
    
    public static String getSavedToken(android.content.Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            return prefs.getString(TOKEN_KEY, null);
        } catch (Exception e) {
            Log.e(TAG, "Failed to get saved token", e);
            return null;
        }
    }

    private void showNotification(String title, String body, String priority, 
                                  String route, String type, Map<String, String> data) {
        createNotificationChannels();

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        
        // Add routing data to intent
        if (route != null) {
            intent.putExtra("route", route);
        }
        if (type != null) {
            intent.putExtra("type", type);
        }
        
        // Add all data to intent
        for (Map.Entry<String, String> entry : data.entrySet()) {
            intent.putExtra(entry.getKey(), entry.getValue());
        }
        
        int flags = PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        
        int requestCode = (int) System.currentTimeMillis();
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, requestCode, intent, flags
        );

        // Choose channel based on priority
        String channelId = "high".equals(priority) || "urgent".equals(priority) 
            ? CHANNEL_HIGH_ID : CHANNEL_ID;

        Uri defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
            .setSmallIcon(getNotificationIcon())
            .setContentTitle(title != null ? title : "PACT Notification")
            .setContentText(body != null ? body : "")
            .setAutoCancel(true)
            .setSound(defaultSoundUri)
            .setColor(Color.parseColor("#1e40af")) // Brand blue color
            .setContentIntent(pendingIntent);
        
        // Set priority based on message priority
        if ("high".equals(priority) || "urgent".equals(priority)) {
            builder.setPriority(NotificationCompat.PRIORITY_HIGH);
            builder.setDefaults(NotificationCompat.DEFAULT_ALL);
        } else {
            builder.setPriority(NotificationCompat.PRIORITY_DEFAULT);
        }
        
        // Add big text style for longer messages
        if (body != null && body.length() > 50) {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
        }

        NotificationManager notificationManager = 
            (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        
        if (notificationManager != null) {
            // Use unique ID based on timestamp and hash to prevent notification replacement
            int notificationId = (int) (System.currentTimeMillis() % Integer.MAX_VALUE);
            notificationManager.notify(notificationId, builder.build());
            Log.d(TAG, "Notification displayed with ID: " + notificationId);
        }
    }
    
    private int getNotificationIcon() {
        // Try to use custom notification icon first
        int iconId = getResources().getIdentifier(
            "ic_notification", "drawable", getPackageName()
        );
        
        // Fall back to app icon if custom icon not found
        if (iconId == 0) {
            iconId = getResources().getIdentifier(
                "ic_launcher", "mipmap", getPackageName()
            );
        }
        
        // Final fallback to system icon
        if (iconId == 0) {
            iconId = android.R.drawable.ic_dialog_info;
        }
        
        return iconId;
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager notificationManager = 
                getSystemService(NotificationManager.class);
            
            if (notificationManager == null) return;
            
            // Default channel
            NotificationChannel defaultChannel = new NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_DEFAULT
            );
            defaultChannel.setDescription("General PACT workflow notifications");
            defaultChannel.enableVibration(true);
            defaultChannel.setShowBadge(true);
            defaultChannel.setLightColor(Color.parseColor("#1e40af"));
            notificationManager.createNotificationChannel(defaultChannel);
            
            // High priority channel
            NotificationChannel highChannel = new NotificationChannel(
                CHANNEL_HIGH_ID,
                CHANNEL_HIGH_NAME,
                NotificationManager.IMPORTANCE_HIGH
            );
            highChannel.setDescription("Urgent notifications that require immediate attention");
            highChannel.enableVibration(true);
            highChannel.setShowBadge(true);
            highChannel.setLightColor(Color.RED);
            highChannel.setBypassDnd(true);
            notificationManager.createNotificationChannel(highChannel);
            
            Log.d(TAG, "Notification channels created");
        }
    }
    
    @Override
    public void onDeletedMessages() {
        super.onDeletedMessages();
        Log.d(TAG, "FCM messages were deleted on the server");
        // Optionally sync data when messages are deleted
        Intent syncIntent = new Intent("com.pact.workflow.SYNC_REQUESTED");
        sendBroadcast(syncIntent);
    }
}
