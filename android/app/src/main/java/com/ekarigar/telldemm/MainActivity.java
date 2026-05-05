package com.ekarigar.telldemm;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;

public class MainActivity extends BridgeActivity {
    
    private static final String TAG = "MainActivity";
    
    @Override
    public void onCreate(Bundle savedInstanceState) {
        Log.d(TAG, "🔧 ===== MainActivity onCreate (BEFORE super) =====");
        
        // Register plugin BEFORE calling super.onCreate()
        registerPlugin(ChatNotificationPlugin.class);
        Log.d(TAG, "✅ ChatNotificationPlugin registered (before super)");
        
        super.onCreate(savedInstanceState);
        
        Log.d(TAG, "✅ MainActivity onCreate completed");
        
        // ✅ CRITICAL: Handle notification intent when app launches from notification
        handleNotificationIntent(getIntent());
    }
    
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        Log.d(TAG, "👉 onNewIntent called");
        Log.d(TAG, "   Action: " + (intent != null ? intent.getAction() : "null"));
        
        setIntent(intent);
        handleNotificationIntent(intent);
    }
    
    @Override
    public void onResume() {
        super.onResume();
        Log.d(TAG, "👉 onResume called");
        
        // Check intent again on resume
        handleNotificationIntent(getIntent());
    }

    
    private void handleNotificationIntent(Intent intent) {
        if (intent == null) {
            Log.d(TAG, "⚠️ Intent is null");
            return;
        }

        Log.d(TAG, "📱 === INTENT DEBUG START ===");
        Log.d(TAG, "📱 Action: " + intent.getAction());
        Log.d(TAG, "📱 Data: " + intent.getData());
        Log.d(TAG, "📱 Type: " + intent.getType());
        Log.d(TAG, "📱 Scheme: " + intent.getScheme());
        
        // Log all extras
        Bundle extras = intent.getExtras();
        if (extras != null && !extras.isEmpty()) {
            Log.d(TAG, "📦 Intent has extras:");
            for (String key : extras.keySet()) {
                Object value = extras.get(key);
                Log.d(TAG, "  🔑 " + key + " = " + value);
            }
        } else {
            Log.d(TAG, "⚠️ Intent has NO extras");
        }
        
        Log.d(TAG, "📱 === INTENT DEBUG END ===");
        
        // ✅ Check if this is a notification tap
        if (extras != null) {
            // FCM sends data in "google.message_id" or custom data fields
            if (extras.containsKey("google.message_id") || 
                extras.containsKey("roomId") ||
                extras.containsKey("receiverId")) {
                
                Log.d(TAG, "🎯 THIS IS A NOTIFICATION TAP!");
                
                // ✅ CRITICAL: Send notification data to Capacitor/JavaScript
                try {
                    JSObject notificationData = new JSObject();
                    
                    // Add all extras to the notification data
                    for (String key : extras.keySet()) {
                        Object value = extras.get(key);
                        if (value != null) {
                            notificationData.put(key, value.toString());
                        }
                    }
                    
                    Log.d(TAG, "📤 Sending notification data to JavaScript: " + notificationData.toString());
                    
                    // ✅ Send to JavaScript via Capacitor bridge
                    // This will trigger the pushNotificationActionPerformed listener
                    getBridge().triggerWindowJSEvent("notificationTapped", notificationData.toString());
                    
                    Log.d(TAG, "✅ Notification data sent to JavaScript successfully");
                    
                } catch (Exception e) {
                    Log.e(TAG, "❌ Error sending notification data to JavaScript", e);
                }
            }
        }
    }
}