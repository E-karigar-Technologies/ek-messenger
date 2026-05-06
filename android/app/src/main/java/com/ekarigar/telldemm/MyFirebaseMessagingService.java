// package com.ekarigar.ekmessenger;

// import android.app.*;
// import android.content.*;
// import android.database.Cursor;
// import android.net.Uri;
// import android.os.Build;
// import android.provider.ContactsContract;
// import android.service.notification.StatusBarNotification;
// import android.util.Log;

// import androidx.core.app.NotificationCompat;

// import com.google.firebase.messaging.FirebaseMessagingService;
// import com.google.firebase.messaging.RemoteMessage;

// import org.json.JSONArray;
// import org.json.JSONObject;

// import java.util.*;

// public class MyFirebaseMessagingService extends FirebaseMessagingService {

//     private static final String TAG = "FCMService";
//     private static final String CHANNEL_ID = "chat_notifications";
//     private static final String PREF_NAME = "chat_notifications_store";
//     private static final int MAX_LINES = 5;

//     @Override
//     public void onMessageReceived(RemoteMessage remoteMessage) {
//         Log.d(TAG, "🔔 ===== onMessageReceived CALLED =====");
//         Log.d(TAG, "📨 From: " + remoteMessage.getFrom());
//         Log.d(TAG, "📨 Message ID: " + remoteMessage.getMessageId());
//         Log.d(TAG, "📨 Has Notification: " + (remoteMessage.getNotification() != null));
//         Log.d(TAG, "📨 Has Data: " + (remoteMessage.getData() != null && !remoteMessage.getData().isEmpty()));

//         // ✅ CRITICAL: Handle BOTH notification and data messages
        
//         // Case 1: Notification message (should be avoided, but handle it anyway)
//         if (remoteMessage.getNotification() != null) {
//             Log.w(TAG, "⚠️ WARNING: Received notification message (backend should send data-only!)");
//             RemoteMessage.Notification notification = remoteMessage.getNotification();
//             Log.d(TAG, "📬 Notification Title: " + notification.getTitle());
//             Log.d(TAG, "📬 Notification Body: " + notification.getBody());
            
//             // Still process the data if available
//             if (remoteMessage.getData() != null && !remoteMessage.getData().isEmpty()) {
//                 processMessageData(remoteMessage.getData());
//             } else {
//                 Log.w(TAG, "⚠️ Notification message has no data payload");
//             }
//             return;
//         }

//         // Case 2: Data-only message (CORRECT approach)
//         Map<String, String> data = remoteMessage.getData();
//         if (data == null || data.isEmpty()) {
//             Log.w(TAG, "⚠️ Message has no data");
//             return;
//         }

//         Log.d(TAG, "✅ Processing data-only message");
//         processMessageData(data);
//     }

//     /**
//      * Process the message data and show notification
//      */
//     private void processMessageData(Map<String, String> data) {
//         try {
//             Log.d(TAG, "📦 Data payload keys: " + data.keySet());
            
//             JSONObject payload = new JSONObject();
            
//             // ✅ PRIORITY 1: Read from top-level data fields (most reliable)
//             if (data.containsKey("roomId")) {
//                 Log.d(TAG, "✅ Reading from top-level data fields");
//                 for (Map.Entry<String, String> entry : data.entrySet()) {
//                     // Don't add the "payload" string itself as a field
//                     if (!"payload".equals(entry.getKey())) {
//                         payload.put(entry.getKey(), entry.getValue());
//                     }
//                 }
//             }
//             // ✅ FALLBACK: Try to parse payload JSON string
//             else if (data.containsKey("payload")) {
//                 Log.d(TAG, "ℹ️ Reading from payload JSON string");
//                 String payloadJson = data.get("payload");
//                 if (payloadJson != null && !payloadJson.isEmpty()) {
//                     payload = new JSONObject(payloadJson);
//                 }
//             }
//             // ✅ LAST RESORT: Build from whatever data we have
//             else {
//                 Log.w(TAG, "⚠️ No standard fields found, using all data");
//                 for (Map.Entry<String, String> entry : data.entrySet()) {
//                     payload.put(entry.getKey(), entry.getValue());
//                 }
//             }

//             String chatType = payload.optString("chatType", "private");
//             String roomId = payload.optString("roomId");
//             String senderPhone = payload.optString("senderPhone");
//             String body = payload.optString("body", "New message");
//             String groupName = payload.optString("groupName", "Group");

//             // ✅ Validate required fields
//             if (roomId == null || roomId.isEmpty()) {
//                 Log.e(TAG, "❌ Missing roomId in payload");
//                 return;
//             }

//             Log.d(TAG, "📨 Processing message for room: " + roomId);
//             Log.d(TAG, "📨 Chat type: " + chatType);
//             Log.d(TAG, "📨 Sender: " + senderPhone);
//             Log.d(TAG, "📨 Message: " + body);

//             String senderName = resolveSenderName(senderPhone);

//             String title;
//             if ("group".equals(chatType)) {
//                 title = senderName + " • " + groupName;
//             } else {
//                 title = senderName;
//             }

//             // ✅ Get existing messages
//             List<String> messages = getStoredMessages(roomId);
//             Log.d(TAG, "📊 Existing messages count for room " + roomId + ": " + messages.size());
            
//             // ✅ Add new message at the beginning
//             messages.add(0, body);
//             Log.d(TAG, "📊 After adding new message: " + messages.size());

//             // ✅ Limit to MAX_LINES
//             if (messages.size() > MAX_LINES) {
//                 messages = messages.subList(0, MAX_LINES);
//                 Log.d(TAG, "📊 After limiting to MAX_LINES: " + messages.size());
//             }

//             // ✅ Save updated messages
//             saveMessages(roomId, messages);
            
//             // ✅ Verify save
//             List<String> verifyMessages = getStoredMessages(roomId);
//             Log.d(TAG, "✅ Verified saved messages count: " + verifyMessages.size());

//             showInboxNotification(title, roomId, messages, payload);

//         } catch (Exception e) {
//             Log.e(TAG, "❌ Error processing message data", e);
//             e.printStackTrace();
//         }
//     }

//     // =====================================================
//     // 🔔 Notification Builder (InboxStyle)
//     // =====================================================
//     private void showInboxNotification(
//             String title,
//             String roomId,
//             List<String> messages,
//             JSONObject payload
//     ) {
//         Log.d(TAG, "🔔 showInboxNotification called for room: " + roomId);

//         NotificationManager manager =
//                 (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
//         if (manager == null) {
//             Log.e(TAG, "❌ NotificationManager is null");
//             return;
//         }

//         // Channel
//         if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
//             NotificationChannel channel = new NotificationChannel(
//                     CHANNEL_ID,
//                     "Chat Notifications",
//                     NotificationManager.IMPORTANCE_HIGH
//             );
//             channel.enableVibration(true);
//             channel.setShowBadge(true);
//             channel.setDescription("Notifications for chat messages");
//             manager.createNotificationChannel(channel);
//             Log.d(TAG, "✅ Notification channel created/updated");
//         }

//         // ✅ Create intent that Capacitor can intercept
//         Intent intent = new Intent(this, MainActivity.class);
//         intent.setAction("com.ekarigar.ekmessenger.NOTIFICATION_TAP");
//         intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

//         // ✅ Add payload data as extras
//         Iterator<String> keys = payload.keys();
//         while (keys.hasNext()) {
//             String key = keys.next();
//             intent.putExtra(key, payload.optString(key));
//         }

//         // ✅ Add notification metadata that Capacitor expects
//         intent.putExtra("google.message_id", "notif_" + System.currentTimeMillis());
//         intent.putExtra("google.sent_time", System.currentTimeMillis());
        
//         // ✅ Store the entire payload as JSON string
//         intent.putExtra("payload", payload.toString());

//         Log.d(TAG, "📦 Intent created with " + payload.length() + " extras");

//         PendingIntent pendingIntent = PendingIntent.getActivity(
//                 this,
//                 roomId.hashCode(), // ✅ Unique request code per room
//                 intent,
//                 PendingIntent.FLAG_UPDATE_CURRENT |
//                         (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
//                                 ? PendingIntent.FLAG_IMMUTABLE
//                                 : 0)
//         );

//         // 🔥 LATEST message for popup (collapsed state)
//         String latestMessage =
//                 (messages != null && !messages.isEmpty())
//                         ? messages.get(0)
//                         : "New message";

//         // 🔥 Inbox style (expanded state)
//         NotificationCompat.InboxStyle inboxStyle =
//                 new NotificationCompat.InboxStyle()
//                         .setBigContentTitle(title)
//                         .setSummaryText(messages.size() + " new message" + (messages.size() > 1 ? "s" : ""));

//         for (int i = messages.size() - 1; i >= 0; i--) {
//             inboxStyle.addLine(messages.get(i));
//         }

//         NotificationCompat.Builder builder =
//                 new NotificationCompat.Builder(this, CHANNEL_ID)
//                         .setSmallIcon(getApplicationInfo().icon)
//                         .setContentTitle(title)
//                         .setContentText(latestMessage)
//                         .setStyle(inboxStyle)
//                         .setAutoCancel(true)
//                         .setPriority(NotificationCompat.PRIORITY_HIGH)
//                         .setDefaults(NotificationCompat.DEFAULT_ALL)
//                         .setContentIntent(pendingIntent)
//                         .setGroup(roomId);

//         manager.notify(roomId, 0, builder.build());
//         Log.d(TAG, "✅ Notification shown for room: " + roomId + " with " + messages.size() + " messages");
//     }

//     // =====================================================
//     // 📞 Resolve sender name from contacts
//     // =====================================================
//     private String resolveSenderName(String phone) {
//         String name = getContactName(phone);
//         return (name != null && !name.isEmpty()) ? name : phone;
//     }

//     private String getContactName(String phone) {
//         if (phone == null || phone.isEmpty()) return null;

//         String clean = phone.replaceAll("[^0-9+]", "");

//         Uri uri = Uri.withAppendedPath(
//                 ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
//                 Uri.encode(clean)
//         );

//         Cursor cursor = null;
//         try {
//             cursor = getContentResolver().query(
//                     uri,
//                     new String[]{ContactsContract.PhoneLookup.DISPLAY_NAME},
//                     null,
//                     null,
//                     null
//             );

//             if (cursor != null && cursor.moveToFirst()) {
//                 return cursor.getString(0);
//             }
//         } catch (Exception ignored) {
//         } finally {
//             if (cursor != null) cursor.close();
//         }
//         return null;
//     }

//     // =====================================================
//     // 💾 Local storage for messages (per room)
//     // =====================================================
//     private List<String> getStoredMessages(String roomId) {
//         SharedPreferences prefs = getSharedPreferences(PREF_NAME, MODE_PRIVATE);
//         String json = prefs.getString(roomId, "[]");
        
//         Log.d(TAG, "🔍 getStoredMessages for room: " + roomId);
//         Log.d(TAG, "📦 Raw stored JSON: " + json);

//         List<String> list = new ArrayList<>();
//         try {
//             JSONArray arr = new JSONArray(json);
//             for (int i = 0; i < arr.length(); i++) {
//                 list.add(arr.getString(i));
//             }
//             Log.d(TAG, "✅ Parsed " + list.size() + " messages from storage");
//         } catch (Exception e) {
//             Log.e(TAG, "❌ Error parsing stored messages", e);
//         }
//         return list;
//     }

//     private void saveMessages(String roomId, List<String> messages) {
//         SharedPreferences prefs = getSharedPreferences(PREF_NAME, MODE_PRIVATE);
//         JSONArray arr = new JSONArray();
//         for (String m : messages) arr.put(m);
//         String jsonToSave = arr.toString();
        
//         Log.d(TAG, "💾 saveMessages for room: " + roomId);
//         Log.d(TAG, "📦 Saving JSON: " + jsonToSave);
        
//         boolean saved = prefs.edit().putString(roomId, jsonToSave).commit();
//         Log.d(TAG, saved ? "✅ Messages saved successfully" : "❌ Failed to save messages");
//     }

//     // =====================================================
//     // 🔑 Token refresh
//     // =====================================================
//     @Override
//     public void onNewToken(String token) {
//         Log.d(TAG, "🔑 New FCM Token: " + token);
//         // TODO: Send this token to your backend
//     }

//     // =====================================================
//     // 🧹 Clear stored messages and notification
//     // =====================================================
//     public static void clearStoredMessages(Context context, String roomId) {
//         try {
//             if (roomId == null || roomId.isEmpty()) {
//                 Log.w("FCMService", "⚠️ clearStoredMessages: roomId is null or empty");
//                 return;
//             }

//             Log.d("FCMService", "🧹 ===== CLEARING ROOM: " + roomId + " =====");

//             SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
            
//             String beforeClear = prefs.getString(roomId, "[]");
//             Log.d("FCMService", "📋 Before clear - stored messages: " + beforeClear);
            
//             SharedPreferences.Editor editor = prefs.edit();
//             editor.remove(roomId);
//             boolean prefCleared = editor.commit();
            
//             String afterClearValue = prefs.getString(roomId, "[]");
//             Log.d("FCMService", "📋 After clear - stored messages: " + afterClearValue);
            
//             if (prefCleared && "[]".equals(afterClearValue)) {
//                 Log.d("FCMService", "✅ SharedPreferences VERIFIED CLEARED for room: " + roomId);
//             } else {
//                 Log.e("FCMService", "❌ WARNING: SharedPreferences may not be properly cleared");
//             }

//             NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

//             if (manager != null) {
//                 manager.cancel(roomId, 0);
//                 Log.d("FCMService", "✅ Cancelled notification: tag=" + roomId + ", id=0");
                
//                 manager.cancel(roomId, Integer.MAX_VALUE);
                
//                 if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
//                     try {
//                         StatusBarNotification[] activeNotifications = manager.getActiveNotifications();
//                         int totalActive = activeNotifications.length;
//                         int canceledCount = 0;
                        
//                         Log.d("FCMService", "📊 Scanning " + totalActive + " active notifications...");
                        
//                         for (StatusBarNotification sbn : activeNotifications) {
//                             String tag = sbn.getTag();
//                             int id = sbn.getId();
//                             String group = sbn.getNotification().getGroup();
                            
//                             boolean isMatch = roomId.equals(tag) || roomId.equals(group);
                            
//                             if (isMatch) {
//                                 if (tag != null && !tag.isEmpty()) {
//                                     manager.cancel(tag, id);
//                                     Log.d("FCMService", "✅ Cancelled: tag=" + tag + ", id=" + id);
//                                 } else {
//                                     manager.cancel(id);
//                                     Log.d("FCMService", "✅ Cancelled: id=" + id);
//                                 }
//                                 canceledCount++;
//                             }
//                         }
                        
//                         if (canceledCount > 0) {
//                             Log.d("FCMService", "✅ Total notifications cancelled: " + canceledCount);
//                         } else {
//                             Log.d("FCMService", "ℹ️ No matching notifications found");
//                         }
                        
//                     } catch (Exception e) {
//                         Log.e("FCMService", "❌ Error scanning notifications", e);
//                     }
//                 }
//             }

//             Log.d("FCMService", "🎉 ===== ROOM CLEARED: " + roomId + " =====");

//         } catch (Exception e) {
//             Log.e("FCMService", "❌ ERROR clearing room: " + roomId, e);
//             e.printStackTrace();
//         }
//     }
// }

package com.ekarigar.ekmessenger;

import android.app.*;
import android.content.*;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.ContactsContract;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.*;

public class MyFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "FCMService";
    private static final String CHANNEL_ID = "chat_notifications";
    private static final String PREF_NAME = "chat_notifications_store";
    private static final int MAX_LINES = 5;

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Log.d(TAG, "🔔 ===== onMessageReceived CALLED =====");
        Log.d(TAG, "📨 From: " + remoteMessage.getFrom());
        Log.d(TAG, "📨 Message ID: " + remoteMessage.getMessageId());
        Log.d(TAG, "📨 Has Notification: " + (remoteMessage.getNotification() != null));
        Log.d(TAG, "📨 Has Data: " + (remoteMessage.getData() != null && !remoteMessage.getData().isEmpty()));

        if (remoteMessage.getNotification() != null) {
            Log.w(TAG, "⚠️ WARNING: Received notification message (backend should send data-only!)");
            if (remoteMessage.getData() != null && !remoteMessage.getData().isEmpty()) {
                processMessageData(remoteMessage.getData());
            }
            return;
        }

        Map<String, String> data = remoteMessage.getData();
        if (data == null || data.isEmpty()) {
            Log.w(TAG, "⚠️ Message has no data");
            return;
        }

        Log.d(TAG, "✅ Processing data-only message");
        processMessageData(data);
    }

    private void processMessageData(Map<String, String> data) {
        try {
            Log.d(TAG, "📦 Data payload keys: " + data.keySet());

            JSONObject payload = new JSONObject();

            if (data.containsKey("roomId")) {
                Log.d(TAG, "✅ Reading from top-level data fields");
                for (Map.Entry<String, String> entry : data.entrySet()) {
                    if (!"payload".equals(entry.getKey())) {
                        payload.put(entry.getKey(), entry.getValue());
                    }
                }
            } else if (data.containsKey("payload")) {
                Log.d(TAG, "ℹ️ Reading from payload JSON string");
                String payloadJson = data.get("payload");
                if (payloadJson != null && !payloadJson.isEmpty()) {
                    payload = new JSONObject(payloadJson);
                }
            } else {
                Log.w(TAG, "⚠️ No standard fields found, using all data");
                for (Map.Entry<String, String> entry : data.entrySet()) {
                    payload.put(entry.getKey(), entry.getValue());
                }
            }

            String chatType   = payload.optString("chatType", "private");
            String roomId     = payload.optString("roomId");
            String senderPhone = payload.optString("senderPhone");
            String body       = payload.optString("body", "New message");
            String groupName  = payload.optString("groupName", "Group");

            // ✅ Community-specific fields
            String communityTitle = payload.optString("communityTitle", "");
            String channelLabel   = payload.optString("channelLabel", "");

            if (roomId == null || roomId.isEmpty()) {
                Log.e(TAG, "❌ Missing roomId in payload");
                return;
            }

            Log.d(TAG, "📨 Processing message for room: " + roomId);
            Log.d(TAG, "📨 Chat type: " + chatType);
            Log.d(TAG, "📨 Sender: " + senderPhone);
            Log.d(TAG, "📨 Message: " + body);

            // ✅ Resolve sender name from device contacts
            String senderName = resolveSenderName(senderPhone);

            // ✅ Build title based on chat type
            String title;
            if ("group".equals(chatType)) {
                // "Karan • MyGroup"
                title = senderName + " • " + groupName;

            } else if ("community".equals(chatType)) {
                // "Karan > Testing Again > Announcement"
                if (!communityTitle.isEmpty() && !channelLabel.isEmpty()) {
                    title = senderName + " • " + communityTitle + " • " + channelLabel;
                } else if (!communityTitle.isEmpty()) {
                    title = senderName + " • " + communityTitle;
                } else {
                    title = senderName;
                }

            } else {
                // Private: just sender name
                title = senderName;
            }

            Log.d(TAG, "📨 Notification title: " + title);

            List<String> messages = getStoredMessages(roomId);
            messages.add(0, body);
            if (messages.size() > MAX_LINES) {
                messages = messages.subList(0, MAX_LINES);
            }
            saveMessages(roomId, messages);

            showInboxNotification(title, roomId, messages, payload);

        } catch (Exception e) {
            Log.e(TAG, "❌ Error processing message data", e);
            e.printStackTrace();
        }
    }

    // =====================================================
    // 🔔 Notification Builder (InboxStyle)
    // =====================================================
    private void showInboxNotification(
            String title,
            String roomId,
            List<String> messages,
            JSONObject payload
    ) {
        Log.d(TAG, "🔔 showInboxNotification called for room: " + roomId);

        NotificationManager manager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            Log.e(TAG, "❌ NotificationManager is null");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Chat Notifications",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.enableVibration(true);
            channel.setShowBadge(true);
            channel.setDescription("Notifications for chat messages");
            manager.createNotificationChannel(channel);
        }

        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction("com.ekarigar.ekmessenger.NOTIFICATION_TAP");
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        Iterator<String> keys = payload.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            intent.putExtra(key, payload.optString(key));
        }

        intent.putExtra("google.message_id", "notif_" + System.currentTimeMillis());
        intent.putExtra("google.sent_time", System.currentTimeMillis());
        intent.putExtra("payload", payload.toString());

        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                roomId.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT |
                        (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                                ? PendingIntent.FLAG_IMMUTABLE
                                : 0)
        );

        String latestMessage =
                (messages != null && !messages.isEmpty())
                        ? messages.get(0)
                        : "New message";

        NotificationCompat.InboxStyle inboxStyle =
                new NotificationCompat.InboxStyle()
                        .setBigContentTitle(title)
                        .setSummaryText(messages.size() + " new message" + (messages.size() > 1 ? "s" : ""));

        for (int i = messages.size() - 1; i >= 0; i--) {
            inboxStyle.addLine(messages.get(i));
        }

        NotificationCompat.Builder builder =
                new NotificationCompat.Builder(this, CHANNEL_ID)
                        .setSmallIcon(getApplicationInfo().icon)
                        .setContentTitle(title)
                        .setContentText(latestMessage)
                        .setStyle(inboxStyle)
                        .setAutoCancel(true)
                        .setPriority(NotificationCompat.PRIORITY_HIGH)
                        .setDefaults(NotificationCompat.DEFAULT_ALL)
                        .setContentIntent(pendingIntent)
                        .setGroup(roomId);

        manager.notify(roomId, 0, builder.build());
        Log.d(TAG, "✅ Notification shown for room: " + roomId + " with " + messages.size() + " messages");
    }

    // =====================================================
    // 📞 Resolve sender name from contacts
    // =====================================================
    private String resolveSenderName(String phone) {
        String name = getContactName(phone);
        return (name != null && !name.isEmpty()) ? name : phone;
    }

    private String getContactName(String phone) {
        if (phone == null || phone.isEmpty()) return null;

        String clean = phone.replaceAll("[^0-9+]", "");

        Uri uri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(clean)
        );

        Cursor cursor = null;
        try {
            cursor = getContentResolver().query(
                    uri,
                    new String[]{ContactsContract.PhoneLookup.DISPLAY_NAME},
                    null,
                    null,
                    null
            );

            if (cursor != null && cursor.moveToFirst()) {
                return cursor.getString(0);
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) cursor.close();
        }
        return null;
    }

    // =====================================================
    // 💾 Local storage for messages (per room)
    // =====================================================
    private List<String> getStoredMessages(String roomId) {
        SharedPreferences prefs = getSharedPreferences(PREF_NAME, MODE_PRIVATE);
        String json = prefs.getString(roomId, "[]");

        List<String> list = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(json);
            for (int i = 0; i < arr.length(); i++) {
                list.add(arr.getString(i));
            }
        } catch (Exception e) {
            Log.e(TAG, "❌ Error parsing stored messages", e);
        }
        return list;
    }

    private void saveMessages(String roomId, List<String> messages) {
        SharedPreferences prefs = getSharedPreferences(PREF_NAME, MODE_PRIVATE);
        JSONArray arr = new JSONArray();
        for (String m : messages) arr.put(m);
        prefs.edit().putString(roomId, arr.toString()).commit();
    }

    // =====================================================
    // 🔑 Token refresh
    // =====================================================
    @Override
    public void onNewToken(String token) {
        Log.d(TAG, "🔑 New FCM Token: " + token);
    }

    // =====================================================
    // 🧹 Clear stored messages and notification
    // =====================================================
    public static void clearStoredMessages(Context context, String roomId) {
        try {
            if (roomId == null || roomId.isEmpty()) {
                Log.w("FCMService", "⚠️ clearStoredMessages: roomId is null or empty");
                return;
            }

            Log.d("FCMService", "🧹 ===== CLEARING ROOM: " + roomId + " =====");

            SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();
            editor.remove(roomId);
            editor.commit();

            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

            if (manager != null) {
                manager.cancel(roomId, 0);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    try {
                        StatusBarNotification[] activeNotifications = manager.getActiveNotifications();
                        for (StatusBarNotification sbn : activeNotifications) {
                            String tag = sbn.getTag();
                            int id = sbn.getId();
                            String group = sbn.getNotification().getGroup();

                            if (roomId.equals(tag) || roomId.equals(group)) {
                                if (tag != null && !tag.isEmpty()) {
                                    manager.cancel(tag, id);
                                } else {
                                    manager.cancel(id);
                                }
                            }
                        }
                    } catch (Exception e) {
                        Log.e("FCMService", "❌ Error scanning notifications", e);
                    }
                }
            }

            Log.d("FCMService", "🎉 ===== ROOM CLEARED: " + roomId + " =====");

        } catch (Exception e) {
            Log.e("FCMService", "❌ ERROR clearing room: " + roomId, e);
        }
    }
}