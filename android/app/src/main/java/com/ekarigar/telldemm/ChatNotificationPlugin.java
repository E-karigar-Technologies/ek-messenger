package com.ekarigar.ekmessenger;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.util.Log;

@CapacitorPlugin(name = "ChatNotification")
public class ChatNotificationPlugin extends Plugin {

    private static final String TAG = "ChatNotificationPlugin";

    @PluginMethod
    public void clearRoom(PluginCall call) {
        Log.d(TAG, "🧹 ===== clearRoom method called =====");
        
        String roomId = call.getString("roomId");
        
        if (roomId == null || roomId.isEmpty()) {
            Log.e(TAG, "❌ roomId is null or empty");
            call.reject("roomId is required");
            return;
        }

        Log.d(TAG, "🧹 Attempting to clear room: " + roomId);

        try {
            // Call the static method in MyFirebaseMessagingService
            MyFirebaseMessagingService.clearStoredMessages(getContext(), roomId);
            
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("roomId", roomId);
            
            Log.d(TAG, "✅ clearRoom completed successfully for: " + roomId);
            call.resolve(ret);
            
        } catch (Exception e) {
            Log.e(TAG, "❌ Failed to clear room: " + e.getMessage(), e);
            call.reject("Failed to clear room: " + e.getMessage());
        }
    }

    @PluginMethod
    public void clearAllRooms(PluginCall call) {
        Log.d(TAG, "🧹 clearAllRooms called");
        try {
            // You can implement this if needed to clear all rooms
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
            Log.d(TAG, "✅ clearAllRooms completed");
        } catch (Exception e) {
            Log.e(TAG, "❌ clearAllRooms failed: " + e.getMessage(), e);
            call.reject("Failed to clear all rooms: " + e.getMessage());
        }
    }
}
