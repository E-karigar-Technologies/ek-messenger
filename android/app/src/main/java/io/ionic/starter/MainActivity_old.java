package com.ekarigar.ekmessenger;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity_old extends BridgeActivity {
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // ✅ Handle notification tap when app was killed or in background
        handleNotificationIntent(getIntent());
    }
    
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        
        // ✅ Handle notification tap when app is already running
        Log.d("PushNotification", "onNewIntent called");
        setIntent(intent);
        handleNotificationIntent(intent);
    }
    
    private void handleNotificationIntent(Intent intent) {
        if (intent != null) {
            Bundle extras = intent.getExtras();
            
            if (extras != null) {
                Log.d("PushNotification", "Intent extras: " + extras.toString());
                
                // ✅ Check for notification data
                if (extras.containsKey("route") || 
                    extras.containsKey("roomId") || 
                    extras.containsKey("senderId")) {
                    
                    Log.d("PushNotification", "Notification data found in intent");
                    
                    // ✅ Pass all extras to the bridge for Capacitor to access
                    getBridge().getActivity().getIntent().putExtras(extras);
                    
                    // ✅ Notify the web layer about the notification data
                    getBridge().triggerJSEvent("notificationTapped", extras.toString());
                }
            }
            
            // ✅ Check intent action
            String action = intent.getAction();
            if ("MAIN_ACTIVITY".equals(action)) {
                Log.d("PushNotification", "Launched via MAIN_ACTIVITY action");
            }
        }
    }
}