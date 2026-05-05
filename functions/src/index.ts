import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { webcrypto } from 'crypto';

const { subtle } = webcrypto;

admin.initializeApp();

/**
 * AES Decrypt (same logic as frontend service)
 */
const secretKey = 'YourSuperSecretPassphrase';
let aesKey: any = null;

// derive AES key
async function importAESKey(passphrase: string): Promise<void> {
  const enc = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  aesKey = await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('your_salt_value'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function decryptText(cipherText: string): Promise<string> {
  if (!aesKey) {
    await importAESKey(secretKey);
  }

  if (!cipherText) return '';

  try {
    const data = Uint8Array.from(atob(cipherText), (c) => c.charCodeAt(0));

    if (data.length <= 12) {
      return cipherText; // fallback (maybe plain text)
    }

    const iv = data.slice(0, 12);
    const encrypted = data.slice(12);

    const decrypted = await subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey!,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error('❌ Decryption failed:', err);
    return cipherText;
  }
}

// ========================================
// � MUTE/UNMUTE EVENT LOGGER FUNCTION
// ========================================
/**
 * Logs mute/unmute events when users mute or unmute channel notifications
 * Trigger: /channels/{channelId}/muteEvents/{eventId}
 */
export const logChannelMuteEvent = functions.database.onValueCreated(
  '/channels/{channelId}/muteEvents/{eventId}',
  async (event) => {
    const eventData = event.data.val();
    const channelId = event.params.channelId;
    const eventId = event.params.eventId;

    try {

      if (!eventData || !eventData.userId || !eventData.action) {
        return null;
      }

      const userId = String(eventData.userId);
      const action = String(eventData.action); // 'muted' or 'unmuted'
      const timestamp = eventData.timestamp || Date.now();

      // Log for analytics/audit
      console.log(`📊 Mute event logged:`, {
        channel: channelId,
        user: userId,
        action: action,
        duration: eventData.duration || 'N/A',
        timestamp: new Date(timestamp).toISOString()
      });

      // Optional: Send summary to channel owner/admins
      await notifyChannelOwnersOfMuteEvent(channelId, userId, action, eventData);

    } catch (error) {
      console.error('❌ Error processing mute event:', error);
    }
    return null;
  }
);

// Helper: Notify channel owners/admins about mute events (optional)
async function notifyChannelOwnersOfMuteEvent(
  channelId: string,
  userId: string,
  action: string,
  eventData: any
): Promise<void> {
  try {
    // Fetch channel to get owner
    const channelSnapshot = await admin
      .database()
      .ref(`/channels/${channelId}`)
      .once('value');

    const channelData = channelSnapshot.val();
    if (!channelData) {
      console.log('❌ Channel not found for mute event:', channelId);
      return;
    }

    const ownerId = String(channelData.created_by);

    // Only notify if userId is not the owner (owners don't need notifications)
    if (String(userId) === ownerId) {
      console.log('⏭️ Owner action, no notification needed');
      return;
    }

    // Get owner's FCM token
    const tokenSnapshot = await admin
      .database()
      .ref(`/users/${ownerId}/fcmToken`)
      .once('value');

    const token = tokenSnapshot.val();
    if (!token) {
      console.log(`⚠️ No FCM token for channel owner: ${ownerId}`);
      return;
    }

    // Get owner's notification preference
    const permissionSnapshot = await admin
      .database()
      .ref(`/users/${ownerId}/notifyMuteEvents`)
      .once('value');

    const shouldNotify = permissionSnapshot.val() !== false; // Default to true
    if (!shouldNotify) {
      console.log(`🔕 Owner has disabled mute event notifications`);
      return;
    }

    // Build notification message
    let notificationTitle = '';
    let notificationBody = '';

    if (action === 'muted') {
      const duration = eventData.duration || 'temporarily';
      notificationTitle = '🔕 Follower muted notifications';
      notificationBody = `A follower muted ${duration} for "${channelData.channel_name}"`;
    } else if (action === 'unmuted') {
      notificationTitle = '🔔 Follower restored notifications';
      notificationBody = `A follower restored notifications for "${channelData.channel_name}"`;
    }

    // Send FCM notification
    const payloadData = {
      channelId: String(channelId),
      channelName: String(channelData.channel_name || 'Channel'),
      userId: String(userId),
      action: action,
      eventType: 'mute_event',
      timestamp: String(eventData.timestamp || Date.now()),
      route: `/channel-detail?channelId=${channelId}`,
    };

    await admin.messaging().send({
      token,
      notification: {
        title: notificationTitle,
        body: notificationBody,
      },
      android: { priority: 'normal' },
      data: {
        ...payloadData,
        payload: JSON.stringify(payloadData),
      },
    });

    console.log(`✅ Mute event notification sent to owner ${ownerId}`);

  } catch (error) {
    console.error('❌ Error notifying owner of mute event:', error);
    // Don't throw - this is non-critical
  }
}

// ========================================
// �🔕 CHECK IF CHANNEL IS MUTED
// ========================================
async function isChannelMuted(userId: string, channelId: string): Promise<boolean> {
  try {
    const mutedChannelsSnapshot = await admin
      .database()
      .ref(`/users/${userId}/mutedChatsUntil/channel_${channelId}`)
      .once('value');

    const muteUntil = mutedChannelsSnapshot.val();

    if (muteUntil === null || muteUntil === undefined) {
      return false; // Not muted
    }

    if (muteUntil === 0) {
      return true; // Always muted
    }

    // Check if mute has expired
    const now = Date.now();
    if (now > muteUntil) {
      // Mute has expired, clean it up
      await admin.database().ref(`/users/${userId}/mutedChatsUntil/channel_${channelId}`).set(null);
      return false;
    }

    console.log(`🔕 Channel ${channelId} is muted for user ${userId} until ${new Date(muteUntil).toISOString()}`);
    return true;
  } catch (error) {
    console.error('Error checking channel mute status:', error);
    return false;
  }
}

// ========================================
// 🔕 CHECK IF CHAT IS MUTED
// ========================================
async function isChatMuted(userId: string, roomId: string): Promise<boolean> {
  try {
    const mutedChatsSnapshot = await admin
      .database()
      .ref(`/users/${userId}/mutedChats`)
      .once('value');

    const mutedChats = mutedChatsSnapshot.val();

    if (!mutedChats || !Array.isArray(mutedChats)) {
      return false;
    }

    const isMuted = mutedChats.includes(roomId);

    if (isMuted) {
      console.log(`🔕 Chat ${roomId} is muted for user ${userId}`);
    }

    return isMuted;
  } catch (error) {
    console.error('❌ Error checking mute status:', error);
    return false;
  }
}

// ========================================
// 🏘️ PARSE ROOM ID HELPER
// ========================================
/**
 * Parses roomId to detect chat type
 * 
 * Examples:
 *   "group_12345"                          → { type: 'group' }
 *   "community_1770622339750_announcement" → { type: 'community', communityId: 'community_1770622339750', channelType: 'announcement' }
 *   "community_1770622339750_general"      → { type: 'community', communityId: 'community_1770622339750', channelType: 'general' }
 *   "76_78"                                → { type: 'private' }
 */
function parseRoomId(roomId: string): {
  type: 'private' | 'group' | 'community';
  communityId?: string;
  channelType?: string;
} {
  if (roomId.startsWith('group_')) {
    return { type: 'group' };
  }

  // community_<id>_<channelType>
  // We match: starts with "community_" AND has at least one more underscore after the community timestamp
  const communityMatch = roomId.match(/^(community_\d+)_(.+)$/);
  if (communityMatch) {
    return {
      type: 'community',
      communityId: communityMatch[1],   // e.g. "community_1770622339750"
      channelType: communityMatch[2],   // e.g. "announcement" or "general"
    };
  }

  return { type: 'private' };
}

// 🔥 UNIFIED NOTIFICATION FUNCTION (Private + Group + Community)
export const sendNotificationOnNewMessage = functions.database.onValueCreated(
  '/chats/{roomId}/{messageId}',
  async (event) => {
    const messageData = event.data.val();
    const roomId = event.params.roomId;
    const messageId = event.params.messageId;

        // ✅ System messages skip karo (disappearing, etc.)
      if (messageId.startsWith('system_')) {
        console.log(`⏭️ System message skipped: ${messageId}`);
        return null;
      }

      // ✅ check in messageData also
      if (
        messageData?.isSystemMessage === true ||
        messageData?.type === 'system' ||
        messageData?.sender === 'system'
      ) {
        console.log(`⏭️ System message (by data) skipped: ${messageId}`);
        return null;
      }

      try {
        const parsed = parseRoomId(roomId);

        if (parsed.type === 'group') {
          console.log('👥 Group chat message detected:', { roomId, messageId });
          await handleGroupNotification(messageData, roomId, messageId);

        } else if (parsed.type === 'community') {
          console.log('🏘️ Community chat message detected:', {
            roomId,
            messageId,
            communityId: parsed.communityId,
            channelType: parsed.channelType,
          });
          await handleCommunityNotification(
            messageData,
            roomId,
            messageId,
            parsed.communityId!,
            parsed.channelType!
          );

        } else {
          console.log('📱 Private chat message detected:', { roomId, messageId });
          await handlePrivateNotification(messageData, roomId, messageId);
        }
      } catch (error) {
        console.error('❌ Error in notification function:', error);
      }
      return null;
    }
  );

// � CHANNEL POST NOTIFICATION FUNCTION
export const sendNotificationOnChannelPost = functions.database.onValueCreated(
  '/channels/{channelId}/posts/{postId}',
  async (event) => {
    const postData = event.data.val();
    const channelId = event.params.channelId;
    const postId = event.params.postId;

    try {
      console.log('📢 Channel post detected:', { channelId, postId, postData });

      // Skip if this is a system post or has no content
      if (!postData || !postData.created_by) {
        console.log('⏭️ Skipping invalid post');
        return null;
      }

      await handleChannelPostNotification(postData, channelId, postId);
    } catch (error) {
      console.error('❌ Error in channel post notification function:', error);
    }
    return null;
  }
);

// 📢 Channel Post Notification Handler
async function handleChannelPostNotification(
  postData: any,
  channelId: string,
  postId: string
) {
  try {
    const senderId = postData.created_by;
    console.log('📢 Processing channel post notification:', { senderId, channelId, postId });

    // 1️⃣ Get channel information
    const channelSnapshot = await admin
      .database()
      .ref(`/channels/${channelId}`)
      .once('value');

    const channelData = channelSnapshot.val();
    if (!channelData) {
      console.log('❌ Channel not found:', channelId);
      return;
    }

    // 2️⃣ Check if sender is owner or admin
    const isOwner = String(channelData.created_by) === String(senderId);
    const isAdmin = channelData.admins && channelData.admins[senderId];

    if (!isOwner && !isAdmin) {
      console.log('⏭️ Sender is not owner or admin, skipping notification');
      return;
    }

    console.log('👑 Sender is authorized (owner/admin):', { isOwner, isAdmin });

    // 3️⃣ Get all followers
    const followersSnapshot = await admin
      .database()
      .ref(`/channels/${channelId}/followers`)
      .once('value');

    const followers = followersSnapshot.val() || {};
    const followerIds = Object.keys(followers).filter(id => String(id) !== String(senderId));

    if (followerIds.length === 0) {
      console.log('📭 No followers to notify');
      return;
    }

    console.log(`📤 Notifying ${followerIds.length} followers`);

    // 4️⃣ Build notification message
    let messageBody = 'New post in channel';
    if (postData.body && postData.body.trim()) {
      const decrypted = await decryptText(postData.body);
      messageBody = decrypted.length > 60 ? decrypted.substring(0, 60) + '…' : decrypted;
    }

    if (postData.media_id) {
      messageBody = '📷 New image post';
    }

    // 5️⃣ Send notifications to all followers
    const sendTasks = followerIds.map(async (followerId) => {
      try {
        // Check notification permissions
        const permissionSnapshot = await admin
          .database()
          .ref(`/users/${followerId}/isPermission`)
          .once('value');

        if (permissionSnapshot.val() === false) {
          console.log(`🚫 Notification permission disabled for: ${followerId}`);
          return;
        }

        // Check if user is muted for this channel
        const isMuted = await isChannelMuted(followerId, channelId);
        if (isMuted) {
          console.log(`🔕 Channel muted by ${followerId}, skipping`);
          return;
        }

        // Check if user has this channel open
        const activeChatSnapshot = await admin
          .database()
          .ref(`/activeChats/${followerId}`)
          .once('value');

        if (activeChatSnapshot.val() === `channel_${channelId}`) {
          console.log(`⏭️ User ${followerId} has channel open, skipping`);
          return;
        }

        // Get FCM token
        const tokenSnapshot = await admin
          .database()
          .ref(`/users/${followerId}/fcmToken`)
          .once('value');

        const token = tokenSnapshot.val();
        if (!token) {
          console.log(`⚠️ No FCM token for follower: ${followerId}`);
          return;
        }

        const payloadData = {
          channelId: String(channelId),
          channelName: String(channelData.name || 'Channel'),
          senderId: String(senderId),
          postId: String(postId),
          chatType: 'channel',
          body: messageBody,
          timestamp: String(postData.timestamp || Date.now()),
          route: `/channel-feed?channelId=${channelId}`,
        };

        await admin.messaging().send({
          token,
          android: { priority: 'high' },
          notification: {
            title: String(channelData.name || 'Channel'),
            body: messageBody,
          },
          data: {
            ...payloadData,
            payload: JSON.stringify(payloadData),
          },
        });

        console.log(`✅ Channel notification sent to follower ${followerId}`);
      } catch (err) {
        console.error(`❌ Failed to send to follower ${followerId}:`, err);
      }
    });

    await Promise.all(sendTasks);
    console.log('✅ All channel post notifications sent');

  } catch (error) {
    console.error('❌ Error sending channel post notification:', error);
  }
}

// �📱 Private Chat Notification Handler
async function handlePrivateNotification(
  messageData: any,
  roomId: string,
  messageId: string
) {
  console.log('message Data is', messageData);
  try {
    const receiverId = messageData.receiver_id;
    const senderId = messageData.sender;

    // ✅ 1. Check if message is flagged as blocked by sender side
    if (messageData.blockedSend === true) {
      console.log(`🚫 Notification skipped: Message flagged as blockedSend (Sender: ${senderId}, Receiver: ${receiverId})`);
      return;
    }

    // ✅ 2. Double-check blocking in RTDB (Receiver side check)
    const blockSnapshot = await admin
      .database()
      .ref(`/usersBlocks/${receiverId}/${senderId}`)
      .once('value');

    if (blockSnapshot.exists()) {
      console.log(`🚫 Notification skipped: Receiver ${receiverId} has blocked Sender ${senderId}`);
      return;
    }

    const isMuted = await isChatMuted(receiverId, roomId);

    if (isMuted) {
      console.log(
       `🔕 Chat ${roomId} is muted by receiver ${receiverId}, notification skipped`
      );
      return;
    }

    const permissionSnapshot = await admin
      .database()
     .ref(`/users/${receiverId}/isPermission`)
      .once('value');

    const isPermission = permissionSnapshot.val();
    console.log({ isPermission });

    if (isPermission === false) {
      console.log(
       `🚫 Notification permission disabled for receiver: ${receiverId}`
      );
      return;
    }

    const receiverTokenSnapshot = await admin
      .database()
      .ref(`/users/${receiverId}/fcmToken`)
      .once('value');

    const receiverToken = receiverTokenSnapshot.val();

    if (!receiverToken) {
    console.log('Receiver FCM token not found for:', receiverId);
      return;
    }

    if (senderId === receiverId) {
      console.log('Self message, notification not sent');
      return;
    }

    const activeChatSnapshot = await admin
      .database()
      .ref(`/activeChats/${receiverId}`)
      .once('value');

    const activeChatId = activeChatSnapshot.val();

    if (activeChatId) {
      const participants = String(activeChatId).split('_');
      if (participants.includes(String(senderId))) {
        console.log(
         `Receiver ${receiverId} is currently chatting with sender ${senderId}, notification not sent`
        );
        return;
      }
    }

    let messageBody = 'New message';

    if (messageData.type === 'channel_invite' && messageData.channel_invite) {
      const channelName = messageData.channel_invite.channelName || 'a channel';
      const isAdminInvite = messageData.channel_invite.isFollowerInvite === false;
      messageBody = isAdminInvite ? `👑 Admin invite: ${channelName}` : `📢 Channel invite: ${channelName}`;
    } else if (messageData.type === 'channel_updated') {
      messageBody = '📝 Channel updated';
    } else if (messageData.type === 'admin_accepted') {
      messageBody = '✅ Admin role accepted';
    } else if (messageData.type === 'admin_revoked') {
      messageBody = '🚫 You have been removed as admin';
    } else if (messageData.text && (await decryptText(messageData.text)) === 'You are no longer an admin') {
      messageBody = '🚫 You have been removed as admin';
    } else if (messageData.text) {
      messageBody = await decryptText(messageData.text);
    }

    if (messageData.attachment) {
      switch (messageData.attachment.type) {
        case 'image':   messageBody = '📷 Image';    break;
        case 'video':   messageBody = '🎥 Video';    break;
        case 'audio':   messageBody = '🎵 Audio';    break;
        case 'document':messageBody = '📄 Document'; break;
        default:        messageBody = '📎 Attachment';
      }
    }

    const payloadData = {
      roomId: String(roomId),
      senderId: String(senderId),
      senderPhone: String(messageData.sender_phone),
      receiverId: String(receiverId),
      messageId: String(messageId),
      chatType: 'private',
      body: messageBody,
      timestamp: String(messageData.timestamp),
       route: `/chatting-screen?receiverId=${senderId}`,
    };

    const response = await admin.messaging().send({
      token: receiverToken,
      android: { priority: 'high' },
      notification: {
        title: messageData.sender_name || 'New message',
        body: messageBody,
      },
      data: {
        ...payloadData,
        payload: JSON.stringify(payloadData),
      },
    });

    console.log('✅ Private notification sent successfully:', response);
  } catch (error) {
    console.error('❌ Error sending private notification:', error);
  }
}

// 👥 Group Chat Notification Handler
async function handleGroupNotification(
  messageData: any,
  roomId: string,
  messageId: string
) {
  try {
    const groupId = roomId;

    const groupSnapshot = await admin
      .database()
      .ref(`/groups/${groupId}`)
      .once('value');

    const groupData = groupSnapshot.val();
    if (!groupData) {
      console.log('❌ Group not found:', groupId);
      return;
    }

    const membersSnapshot = await admin
      .database()
      .ref(`/groups/${groupId}/members`)
      .once('value');

    const members = membersSnapshot.val() || {};

    const memberIds = Object.keys(members).filter(
      (memberId) => memberId !== messageData.sender
    );

    if (memberIds.length === 0) {
      console.log('📭 No members to notify in group:', groupId);
      return;
    }

    console.log(`🔍 Members to notify: ${JSON.stringify(memberIds)}`);

    const memberTokens: Array<{ memberId: string; token: string }> = [];

    const tokenPromises = memberIds.map(async (memberId) => {
      try {
        const isMuted = await isChatMuted(memberId, groupId);
        if (isMuted) {
          console.log(`🔕 Group ${groupId} is muted by member ${memberId}, skipping`);
          return;
        }

        const permissionSnapshot = await admin
          .database()
          .ref(`/users/${memberId}/isPermission`)
          .once('value');

        if (permissionSnapshot.val() === false) {
          console.log(`🚫 Notification permission disabled for member: ${memberId}`);
          return;
        }

        const activeChatSnapshot = await admin
          .database()
          .ref(`/activeChats/${memberId}`)
          .once('value');

        if (activeChatSnapshot.val() === groupId) {
          console.log(`⏭️ Member ${memberId} is in group ${groupId}, skipping`);
          return;
        }

        const tokenSnapshot = await admin
          .database()
          .ref(`/users/${memberId}/fcmToken`)
          .once('value');

        const token = tokenSnapshot.val();
        if (token) {
          memberTokens.push({ memberId, token });
        } else {
          console.log(`⚠️ Member has no token: ${memberId}`);
        }
      } catch (err) {
        console.error(`❌ Error fetching token for ${memberId}:`, err);
      }
    });

    await Promise.all(tokenPromises);

    if (memberTokens.length === 0) {
      console.log('📭 No valid FCM tokens found for group');
      return;
    }

    const groupName = groupData.title || 'Group Chat';

    let messageBody = 'New message';
    if (messageData.type === 'channel_invite' && messageData.channel_invite) {
      const channelName = messageData.channel_invite.channelName || 'a channel';
      const isAdminInvite = messageData.channel_invite.isFollowerInvite === false;
      messageBody = isAdminInvite ? `👑 Admin invite: ${channelName}` : `📢 Channel invite: ${channelName}`;
    } else if (messageData.type === 'channel_updated') {
      messageBody = '📝 Channel updated';
    } else if (messageData.type === 'emoji_settings_changed') {
      messageBody = '⚙️ Reaction settings changed';
    } else if (messageData.type === 'admin_accepted') {
      messageBody = '✅ Admin role accepted';
    } else if (messageData.type === 'admin_revoked') {
      messageBody = '🚫 Admin role revoked';
    } else if (messageData.text && (await decryptText(messageData.text)) === 'You are no longer an admin') {
      messageBody = '🚫 Admin role revoked';
    } else if (messageData.text) {
      const decrypted = await decryptText(messageData.text);
      messageBody = decrypted.length > 60 ? decrypted.substring(0, 60) + '…' : decrypted;
    }
    if (messageData.attachment) {
      switch (messageData.attachment.type) {
        case 'image':   messageBody = '📷 sent an image';    break;
        case 'video':   messageBody = '🎥 sent a video';     break;
        case 'audio':   messageBody = '🎵 sent an audio';    break;
        case 'document':messageBody = '📄 sent a document';  break;
        default:        messageBody = '📎 sent an attachment';
      }
    }

    const sendTasks = memberTokens.map(async ({ memberId, token }) => {
      const payloadData = {
        roomId: String(groupId),
        chatType: 'group',
        senderId: String(messageData.sender),
        senderPhone: String(messageData.sender_phone),
        groupId: String(groupId),
        groupName: String(groupName),
        messageId: String(messageId),
        body: messageBody,
        timestamp: String(messageData.timestamp),
      };

      await admin.messaging().send({
        token,
        android: { priority: 'high' },
        data: {
          ...payloadData,
          payload: JSON.stringify(payloadData),
        },
      });

      console.log(`✅ Group notification sent to ${memberId}`);
    });

    await Promise.all(sendTasks);

    await admin
      .database()
      .ref(`/chats/${groupId}/${messageId}/notified`)
      .set(true);

    console.log('🎉 Group notifications completed.');
  } catch (error) {
    console.error('❌ Error sending group notification:', error);
  }
}

// ========================================
// 🏘️ Community Chat Notification Handler
// ========================================
/**
 * Handles notifications for community channels (announcement, general, etc.)
 * 
 * Flow:
 * 1. Extract communityId from roomId  (e.g. "community_1770622339750")
 * 2. Fetch community data from /communities/{communityId}
 * 3. Fetch all members from /communities/{communityId}/members
 * 4. Exclude sender, check mute/permission/activeChat per member
 * 5. Send FCM notification to eligible members
 */
async function handleCommunityNotification(
  messageData: any,
  roomId: string,
  messageId: string,
  communityId: string,
  channelType: string
) {
  try {
    console.log(`🏘️ handleCommunityNotification: communityId=${communityId}, channel=${channelType}`);

    // ✅ Fetch community data
    const communitySnapshot = await admin
      .database()
      .ref(`/communities/${communityId}`)
      .once('value');

    const communityData = communitySnapshot.val();

    if (!communityData) {
      console.log(`❌ Community not found at /communities/${communityId}`);
      return;
    }

    const communityTitle = communityData.title || 'Community';

    // ✅ Fetch members from /communities/{communityId}/members
    const membersSnapshot = await admin
      .database()
      .ref(`/communities/${communityId}/members`)
      .once('value');

    const members = membersSnapshot.val() || {};
    const memberIds = Object.keys(members).filter(
      (memberId) => String(memberId) !== String(messageData.sender)
    );

    if (memberIds.length === 0) {
      console.log('📭 No members to notify in community:', communityId);
      return;
    }

    console.log(`🔍 Community members to notify (${memberIds.length}): ${JSON.stringify(memberIds)}`);

    // ✅ Build message body
    let messageBody = 'New message';
    if (messageData.type === 'channel_invite' && messageData.channel_invite) {
      const channelName = messageData.channel_invite.channelName || 'a channel';
      const isAdminInvite = messageData.channel_invite.isFollowerInvite === false;
      messageBody = isAdminInvite ? `👑 Admin invite: ${channelName}` : `📢 Channel invite: ${channelName}`;
    } else if (messageData.type === 'channel_updated') {
      messageBody = '📝 Channel updated';
    } else if (messageData.type === 'emoji_settings_changed') {
      messageBody = '⚙️ Reaction settings changed';
    } else if (messageData.type === 'admin_accepted') {
      messageBody = '✅ Admin role accepted';
    } else if (messageData.type === 'admin_revoked') {
      messageBody = '🚫 Admin role revoked';
    } else if (messageData.text && (await decryptText(messageData.text)) === 'You are no longer an admin') {
      messageBody = '🚫 Admin role revoked';
    } else if (messageData.text) {
      const decrypted = await decryptText(messageData.text);
      messageBody = decrypted.length > 60 ? decrypted.substring(0, 60) + '…' : decrypted;
    }
    if (messageData.attachment) {
      switch (messageData.attachment.type) {
        case 'image':   messageBody = '📷 sent an image';    break;
        case 'video':   messageBody = '🎥 sent a video';     break;
        case 'audio':   messageBody = '🎵 sent an audio';    break;
        case 'document':messageBody = '📄 sent a document';  break;
        default:        messageBody = '📎 sent an attachment';
      }
    }

    // ✅ Channel label for notification title
    const channelLabel = channelType.charAt(0).toUpperCase() + channelType.slice(1); // "Announcement" / "General"

    // ✅ Notification title: "Testing Again > Announcement"
    const notificationTitle = `${communityTitle} > ${channelLabel}`;

    // ✅ Collect eligible tokens
    const memberTokens: Array<{ memberId: string; token: string }> = [];

    const tokenPromises = memberIds.map(async (memberId) => {
      try {
        // 🔕 Check mute — use roomId so user can mute specific community channel
        const isMuted = await isChatMuted(memberId, roomId);
        if (isMuted) {
          console.log(`🔕 Community channel ${roomId} is muted by ${memberId}, skipping`);
          return;
        }

        // 🚫 Check notification permission
        const permissionSnapshot = await admin
          .database()
          .ref(`/users/${memberId}/isPermission`)
          .once('value');

        if (permissionSnapshot.val() === false) {
          console.log(`🚫 Notification permission disabled for: ${memberId}`);
          return;
        }

        // ⏭️ Check if member has this community channel open
        const activeChatSnapshot = await admin
          .database()
          .ref(`/activeChats/${memberId}`)
          .once('value');

        if (activeChatSnapshot.val() === roomId) {
          console.log(`⏭️ Member ${memberId} has ${roomId} open, skipping`);
          return;
        }

        // 📲 Get FCM token
        const tokenSnapshot = await admin
          .database()
          .ref(`/users/${memberId}/fcmToken`)
          .once('value');

        const token = tokenSnapshot.val();
        if (token) {
          memberTokens.push({ memberId, token });
        } else {
          console.log(`⚠️ No FCM token for member: ${memberId}`);
        }
      } catch (err) {
        console.error(`❌ Error processing member ${memberId}:`, err);
      }
    });

    await Promise.all(tokenPromises);

    if (memberTokens.length === 0) {
      console.log('📭 No eligible members for community notification');
      return;
    }

    console.log(`📤 Sending community notifications to ${memberTokens.length} members`);

    // ✅ Send notifications
    const sendTasks = memberTokens.map(async ({ memberId, token }) => {
      const payloadData = {
        roomId: String(roomId),
        chatType: 'community',
        senderId: String(messageData.sender),
        senderPhone: String(messageData.sender_phone || ''),
        senderName: String(messageData.sender_name || ''),
        communityId: String(communityId),
        communityTitle: String(communityTitle),
        channelType: String(channelType),
        channelLabel: String(channelLabel),
        title: notificationTitle,                              // ✅ "Karan | Testing Again > Announcement"
        messageId: String(messageId),
        body: messageBody,
        timestamp: String(messageData.timestamp),
        route: `/community-chat?roomId=${roomId}&communityId=${communityId}`,
      };

      try {
        await admin.messaging().send({
          token,
          android: { priority: 'high' },
          data: {
            ...payloadData,
            payload: JSON.stringify(payloadData),
          },
        });
        console.log(`✅ Community notification sent to member ${memberId}`);
      } catch (err) {
        console.error(`❌ Failed to send to ${memberId}:`, err);
      }
    });

    await Promise.all(sendTasks);

    // ✅ Mark as notified
    await admin
      .database()
      .ref(`/chats/${roomId}/${messageId}/notified`)
      .set(true);

    console.log('🎉 Community notifications completed.');
  } catch (error) {
    console.error('❌ Error in handleCommunityNotification:', error);
  }
}