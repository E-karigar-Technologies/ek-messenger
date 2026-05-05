// // import { Injectable } from '@angular/core';
// // import {
// //   PushNotifications,
// //   Token,
// //   PushNotificationSchema,
// //   ActionPerformed,
// // } from '@capacitor/push-notifications';
// // import {
// //   LocalNotifications,
// //   LocalNotificationActionPerformed,
// // } from '@capacitor/local-notifications';
// // import { getDatabase, ref, remove, set, update } from 'firebase/database';
// // import { Router } from '@angular/router';
// // import { Platform, ToastController } from '@ionic/angular';
// // import { App } from '@capacitor/app';
// // import { AuthService } from '../auth/auth.service';
// // import { Capacitor, PluginListenerHandle } from '@capacitor/core';
// // import { ApiService } from './api/api.service';
// // import { FirebaseChatService } from './firebase-chat.service';
// // import { NativeSettings, AndroidSettings, IOSSettings } from 'capacitor-native-settings';
// // import { Contacts } from '@capacitor-community/contacts';


// // @Injectable({
// //   providedIn: 'root',
// // })
// // export class FcmService {
// //   private fcmToken: string = '';
// //   // ✅ Track active notifications by roomId
// //   private activeNotifications = new Map<string, number>();

// //   constructor(
// //     private router: Router,
// //     private platform: Platform,
// //     private toastController: ToastController,
// //     private authService: AuthService,
// //     private service: ApiService,
// //     private firebaseChatService: FirebaseChatService
// //   ) {}

// //   // Helper to actively request a fresh token and return it (one-time listener)
// //   private async getFreshToken(timeoutMs = 10000): Promise<string> {
// //     return new Promise<string>(async (resolve, reject) => {
// //       let timeoutId: any = null;
// //       let listener: PluginListenerHandle | null = null;

// //       const cleanup = () => {
// //         if (timeoutId) {
// //           clearTimeout(timeoutId);
// //           timeoutId = null;
// //         }
// //         if (listener && typeof listener.remove === 'function') {
// //           listener.remove();
// //           listener = null;
// //         }
// //       };

// //       try {
// //         // Check and request permissions
// //         let permStatus = await PushNotifications.checkPermissions();
// //         if (permStatus.receive !== 'granted') {
// //           permStatus = await PushNotifications.requestPermissions();
// //         }
// //         if (permStatus.receive !== 'granted') {
// //           cleanup();
// //           return reject(new Error('Push notification permission denied'));
// //         }

// //         // Set up one-time registration listener
// //         listener = await PushNotifications.addListener(
// //           'registration',
// //           (token: Token) => {
// //             console.log(
// //               '📱 Registration token received:',
// //               token.value.substring(0, 20) + '...'
// //             );
// //             this.fcmToken = token.value;
// //             cleanup();
// //             resolve(token.value);
// //           }
// //         );

// //         // Set up timeout
// //         timeoutId = setTimeout(() => {
// //           console.warn('⏱️ Token request timed out');
// //           cleanup();
// //           if (this.fcmToken) {
// //             resolve(this.fcmToken);
// //           } else {
// //             reject(new Error('Timed out waiting for registration token'));
// //           }
// //         }, timeoutMs);

// //         // Trigger registration
// //         console.log('📲 Triggering push notification registration...');
// //         await PushNotifications.register();
// //       } catch (err) {
// //         cleanup();
// //         reject(err);
// //       }
// //     });
// //   }

// //   async initializePushNotifications(): Promise<boolean> {
// //     try {
// //       // ✅ Request push notification permissions
// //       let permStatus = await PushNotifications.checkPermissions();
// //       if (permStatus.receive !== 'granted') {
// //         permStatus = await PushNotifications.requestPermissions();
// //       }
// //       if (permStatus.receive !== 'granted') {
// //         console.warn('Push notification permission denied');
// //         return false;
// //       }

// //       // ✅ Register for push notifications & try to get token
// //       await PushNotifications.register();

// //       // Try to populate token (if registration listener in initialize isn't fired, use getFreshToken)
// //       // but avoid double-listening — use getFreshToken only if this.fcmToken is not already set
// //       if (!this.fcmToken) {
// //         try {
// //           const token = await this.getFreshToken(8000).catch(() => '');
// //           if (token) {
// //             this.fcmToken = token;
// //             //console.log('Initial FCM token obtained during init:', token);
// //           }
// //         } catch (e) {
// //           console.warn('Could not get initial token via getFreshToken:', e);
// //         }
// //       }

// //       // ✅ Request local notification permissions
// //       const localPerm = await LocalNotifications.requestPermissions();
// //       if (localPerm.display !== 'granted') {
// //         console.warn('Local notification permission not granted');
// //       }

// //       // 📌 Token registration (persistent listener for normal registration events)
// //       PushNotifications.addListener('registration', (token: Token) => {
// //         //console.log('✅ FCM Token (registration listener):', token.value);
// //         this.fcmToken = token.value;
// //       });

// //       // ❌ Registration error
// //       PushNotifications.addListener('registrationError', (error: any) => {
// //         console.error('❌ FCM registration error:', error);
// //       });

// //       // 📩 Foreground push - UPDATED with notification tracking
// //       // PushNotifications.addListener(
// //       //   'pushNotificationReceived',
// //       //   async (notification: PushNotificationSchema) => {
// //       //     console.log('📩 Foreground push received:', notification);
          
// //       //     // ✅ Extract roomId and store notification ID
// //       //     let payload = notification.data?.payload;
// //       //     if (payload) {
// //       //       try {
// //       //         const data = JSON.parse(payload);
// //       //         if (data.roomId) {
// //       //           // Store this notification ID for later removal
// //       //           const notifId = Math.floor(Math.random() * 1000000);
// //       //           this.activeNotifications.set(data.roomId, notifId);
// //       //           console.log(`📌 Stored notification ID ${notifId} for room ${data.roomId}`);
                
// //       //           // Pass notification ID to local notification
// //       //           await this.showLocalNotification(notification, notifId, data.roomId);
// //       //           return;
// //       //         }
// //       //       } catch (e) {
// //       //         console.error('Error parsing notification payload:', e);
// //       //       }
// //       //     }
          
// //       //     // Fallback if no roomId
// //       //     await this.showLocalNotification(notification);
// //       //   }
// //       // );
// //       PushNotifications.addListener(
// //         'pushNotificationReceived',
// //         async (notification: PushNotificationSchema) => {
// //           console.log('📩 Foreground push received:', notification);
          
// //           // ✅ Extract sender phone and match with contacts
// //           let displayTitle = notification.title || 'New Message';
          
// //           try {
// //             let payload = notification.data?.payload;
// //             if (payload) {
// //               const data = JSON.parse(payload);
              
// //               if (data.senderPhone) {
// //                 // ✅ Match with saved contacts
// //                 const contactName = await this.getContactNameByPhone(data.senderPhone);
                
// //                 if (contactName) {
// //                   displayTitle = contactName; // ✅ Use saved contact name
// //                   console.log(`📇 Found saved contact: ${contactName} for ${data.senderPhone}`);
// //                 } else {
// //                   displayTitle = data.senderPhone; // ✅ Use phone number if not saved
// //                   console.log(`📱 Contact not saved, using phone: ${data.senderPhone}`);
// //                 }
// //               }
              
// //               // Store notification ID
// //               if (data.roomId) {
// //                 const notifId = Math.floor(Math.random() * 1000000);
// //                 this.activeNotifications.set(data.roomId, notifId);
                
// //                 // ✅ Pass modified title
// //                 await this.showLocalNotification(
// //                   notification, 
// //                   notifId, 
// //                   data.roomId,
// //                   displayTitle // ✅ Custom title
// //                 );
// //                 return;
// //               }
// //             }
// //           } catch (e) {
// //             console.error('Error processing notification:', e);
// //           }          
// //           await this.showLocalNotification(notification);
// //         }
// //       );

// //       // 👉 CRITICAL: Background notification tapped
// //       // PushNotifications.addListener(
// //       //   'pushNotificationActionPerformed',
// //       //   (notification: ActionPerformed) => {
// //       //     console.log('👉 Raw notification tap:', notification);

// //       //     let payload = notification.notification?.data?.payload;
// //       //     let data: any = {};

// //       //     try {
// //       //       if (payload) data = JSON.parse(payload);
// //       //     } catch (e) {
// //       //       console.error('❌ JSON parse error:', e);
// //       //     }

// //       //     console.log('👉 Parsed tap data:', data);

// //       //     this.handleNotificationTap(data);
// //       //   }
// //       // );

// //        PushNotifications.addListener(
// //         'pushNotificationActionPerformed',
// //         async (notification: ActionPerformed) => {
// //           console.log('👉 Background notification tap:', notification);

// //           let payload = notification.notification?.data?.payload;
// //           let data: any = {};

// //           try {
// //             if (payload) data = JSON.parse(payload);
// //           } catch (e) {
// //             console.error('❌ JSON parse error:', e);
// //           }

// //           console.log('👉 Parsed tap data:', data);

// //           // ✅ Match contact and update notification display (for next time)
// //           if (data.senderPhone) {
// //             const contactName = await this.getContactNameByPhone(data.senderPhone);
// //             if (contactName) {
// //               console.log(`📇 Contact matched in background: ${contactName}`);
// //               // Store for future use if needed
// //               data.displayName = contactName;
// //             }
// //           }

// //           this.handleNotificationTap(data);
// //         }
// //       );

// //       // 👉 Local notification tapped (when shown in foreground)
// //       LocalNotifications.addListener(
// //         'localNotificationActionPerformed',
// //         (evt: LocalNotificationActionPerformed) => {
// //           console.log('👉 Local tap event:', evt);

// //           let payload = evt.notification?.extra?.payload;
// //           let data: any = {};

// //           try {
// //             if (payload) data = JSON.parse(payload);
// //           } catch (e) {
// //             console.error('❌ JSON parse error:', e);
// //           }

// //           console.log('👉 Parsed Local tap data:', data);
// //           this.handleNotificationTap(data);
// //         }
// //       );

// //       App.addListener('appStateChange', ({ isActive }) => {
// //         if (isActive) {
// //           this.checkForPendingNotifications();
// //         }
// //       });

// //       window.addEventListener('notificationTapped', (event: any) => {
// //         try {
// //           const data = JSON.parse(event.detail);
// //           this.handleNotificationTap(data);
// //         } catch (e) {
// //           console.error('Error parsing notification data:', e);
// //         }
// //       });

// //       return true;
// //     } catch (error) {
// //       console.error('❌ Error initializing push notifications:', error);
// //       return false;
// //     }
// //   }

// //   private async getContactNameByPhone(phoneNumber: string): Promise<string | null> {
// //     try {
// //       // Normalize phone number (remove spaces, dashes, etc.)
// //       const normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
      
// //       // Check permission
// //       const permission = await Contacts.checkPermissions();
      
// //       if (permission.contacts !== 'granted') {
// //         console.warn('⚠️ Contacts permission not granted');
// //         return null;
// //       }

// //       // Get all contacts
// //       const result = await Contacts.getContacts({
// //         projection: {
// //           name: true,
// //           phones: true,
// //         }
// //       });

// //       if (!result.contacts || result.contacts.length === 0) {
// //         return null;
// //       }

// //       // Search for matching contact
// //       for (const contact of result.contacts) {
// //         if (contact.phones && contact.phones.length > 0) {
// //           for (const phone of contact.phones) {
// //             // Normalize contact phone
// //             const normalizedContactPhone = phone.number?.replace(/[\s\-\(\)]/g, '') || '';
            
// //             // Check if numbers match (last 10 digits for flexibility)
// //             const last10Digits = normalizedPhone.slice(-10);
// //             const contactLast10 = normalizedContactPhone.slice(-10);
            
// //             if (last10Digits === contactLast10 && contactLast10.length === 10) {
// //               const displayName = contact.name?.display || 
// //                                  contact.name?.given || 
// //                                  contact.name?.family || 
// //                                  null;
              
// //               if (displayName) {
// //                 return displayName;
// //               }
// //             }
// //           }
// //         }
// //       }

// //       return null;
// //     } catch (error) {
// //       console.error('❌ Error matching contact:', error);
// //       return null;
// //     }
// //   }

// //   async clearNativeStoredMessages(roomId: string) {
// //   if (!roomId) return;

// //   if (Capacitor.getPlatform() === 'android') {
// //     try {
// //       // @ts-ignore
// //       await Capacitor.Plugins.ChatNotification.clearRoom({
// //         roomId,
// //       });

// //       console.log('🧹 Native stored messages cleared for room', roomId);
// //     } catch (e) {
// //       console.error('❌ Failed to clear native messages', e);
// //     }
// //   }
// // }

// //   private async handleNotificationTap(data: any) {
// //     console.log('🎯 Final Tap Data Received:', data);

// //     const receiverId = data?.receiverId;
// //     const roomId = data?.roomId;

// //     if (receiverId && roomId) {
// //       console.log({ receiverId, roomId });
// //       console.log('Opening chat with roomId:', roomId);

// //       try {
// //         await this.firebaseChatService.openChat({ roomId });

// //         // await this.firebaseChatService.loadMessages(20, true);

// //         // await this.firebaseChatService.syncMessagesWithServer();

// //         // ✅ Clear notification when chat opens
// //         await this.clearNotificationForRoom(roomId);
// //         await this.clearNativeStoredMessages(roomId);

// //         this.router.navigate(['/chatting-screen'], {
// //           queryParams: { receiverId },
// //           state: { fromNotification: true },
// //         });

// //         localStorage.setItem('fromNotification', 'true');

// //         console.log('✅ Chat opened and messages loaded successfully');
// //         return;
// //       } catch (error) {
// //         console.error('❌ Error opening chat from notification:', error);
// //         // Fallback to home if there's an error
// //         this.router.navigate(['/home-screen']);
// //         return;
// //       }
// //     }
// //     this.router.navigate(['/home-screen']);
// //   }

// //   // ⭐ UPDATED: Track pending notifications when app resumes
// //   private async checkForPendingNotifications() {
// //     try {
// //       console.log('🔍 Checking for pending notifications on app resume...');
      
// //       // Track pending notifications when app opens from background
// //       await this.trackPendingNotifications();
      
// //       const delivered = await PushNotifications.getDeliveredNotifications?.();
// //       console.log(`📬 App resumed with ${delivered?.notifications?.length || 0} push notifications`);
// //     } catch (error) {
// //       console.error('Error checking delivered notifications:', error);
// //     }
// //   }

// //   // ⭐ NEW: Track all pending notifications
// //   async trackPendingNotifications(): Promise<void> {
// //     try {
// //       console.log('📊 Tracking pending notifications...');
      
// //       // Get all delivered push notifications
// //       const pushDelivered = await PushNotifications.getDeliveredNotifications();
// //       console.log(`📬 Found ${pushDelivered.notifications.length} pending push notifications`);
      
// //       if (pushDelivered.notifications.length > 0) {
// //         console.log('📋 Pending notifications by room:');
        
// //         for (const notif of pushDelivered.notifications) {
// //           try {
// //             let payload = notif.data?.payload;
// //             if (payload) {
// //               const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
// //               if (data.roomId) {
// //                 console.log(`  📌 Room ${data.roomId}: ${notif.title || 'New message'}`);
// //               }
// //             }
// //           } catch (e) {
// //             console.error('Error parsing notification:', e);
// //           }
// //         }
// //       } else {
// //         console.log('✅ No pending notifications');
// //       }
// //     } catch (error) {
// //       console.error('❌ Error tracking notifications:', error);
// //     }
// //   }

// //   // ✅ UPDATED: Accept notification ID and roomId
// //   // private async showLocalNotification(
// //   //   notification: PushNotificationSchema,
// //   //   notificationId?: number,
// //   //   roomId?: string
// //   // ) {
// //   //   try {
// //   //     const notificationData = notification.data || {};
// //   //     const title =
// //   //       notificationData.title || notification.title || 'New Message';
// //   //     const body =
// //   //       notificationData.body || notification.body || 'You have a new message';

// //   //     const finalNotificationId = notificationId || Math.floor(Math.random() * 1000000);

// //   //     // ✅ Store notification ID if roomId is available
// //   //     if (roomId && !this.activeNotifications.has(roomId)) {
// //   //       this.activeNotifications.set(roomId, finalNotificationId);
// //   //     }

// //   //     await LocalNotifications.schedule({
// //   //       notifications: [
// //   //         {
// //   //           id: finalNotificationId,
// //   //           title,
// //   //           body,
// //   //           extra: notificationData,
// //   //           smallIcon: 'ic_notification',
// //   //           sound: 'default',
// //   //           schedule: { at: new Date(Date.now() + 500) },
// //   //         },
// //   //       ],
// //   //     });

// //   //     const toast = await this.toastController.create({
// //   //       message: body,
// //   //       duration: 3000,
// //   //       position: 'top',
// //   //       cssClass: 'custom-toast',
// //   //       buttons: [
// //   //         {
// //   //           text: '',
// //   //           handler: () => {
// //   //             this.handleNotificationTap(notificationData);
// //   //           },
// //   //         },
// //   //       ],
// //   //     });

// //   //     await toast.present();
// //   //   } catch (error) {
// //   //     console.error('❌ Error scheduling local notification or toast:', error);
// //   //   }
// //   // }

// //    private async showLocalNotification(
// //     notification: PushNotificationSchema,
// //     notificationId?: number,
// //     roomId?: string,
// //     customTitle?: string
// //   ) {
// //     try {
// //       const notificationData = notification.data || {};
      
// //       // ✅ Use custom title if provided
// //       const title = customTitle || 
// //                     notificationData.title || 
// //                     notification.title || 
// //                     'New Message';
      
// //       const body = notificationData.body || 
// //                    notification.body || 
// //                    'You have a new message';

// //       const finalNotificationId = notificationId || Math.floor(Math.random() * 1000000);

// //       // Store notification ID
// //       if (roomId && !this.activeNotifications.has(roomId)) {
// //         this.activeNotifications.set(roomId, finalNotificationId);
// //       }

// //       await LocalNotifications.schedule({
// //         notifications: [
// //           {
// //             id: finalNotificationId,
// //             title, // ✅ Use matched contact name or phone
// //             body,
// //             extra: notificationData,
// //             smallIcon: 'ic_notification',
// //             sound: 'default',
// //             schedule: { at: new Date(Date.now() + 500) },
// //           },
// //         ],
// //       });

// //       const toast = await this.toastController.create({
// //         message: `${title}: ${body}`,
// //         duration: 3000,
// //         position: 'top',
// //         cssClass: 'custom-toast',
// //         buttons: [
// //           {
// //             text: '',
// //             handler: () => {
// //               this.handleNotificationTap(notificationData);
// //             },
// //           },
// //         ],
// //       });

// //       await toast.present();
// //     } catch (error) {
// //       console.error('❌ Error scheduling local notification or toast:', error);
// //     }
// //   }

// //   // ✅ Clear notifications ONLY for specific roomId
// //   async clearNotificationForRoom(roomId: string): Promise<void> {
// //     try {
// //       // console.log(`🧹 Attempting to clear notifications for room: ${roomId}`);
      
// //       // 1️⃣ Clear stored local notification ID (foreground notifications)
// //       const storedNotificationId = this.activeNotifications.get(roomId);
      
// //       if (storedNotificationId) {
// //         // console.log(`📌 Clearing stored local notification ${storedNotificationId} for room ${roomId}`);
        
// //         try {
// //           await LocalNotifications.cancel({
// //             notifications: [{ id: storedNotificationId }]
// //           });
          
// //           this.activeNotifications.delete(roomId);
// //           console.log(`✅ Stored local notification cleared for room ${roomId}`);
// //         } catch (e) {
// //           console.error('Error clearing stored notification:', e);
// //         }
// //       } else {
// //         console.log(`⚠️ No stored notification ID for room ${roomId}`);
// //       }
      
// //       // 2️⃣ Clear ALL delivered local notifications matching this roomId
// //       try {
// //         const delivered = await LocalNotifications.getDeliveredNotifications();
// //         // console.log(`📬 Found ${delivered.notifications.length} total delivered local notifications`);
        
// //         if (delivered.notifications.length > 0) {
// //           const notificationsToCancel: number[] = [];
          
// //           for (const notif of delivered.notifications) {
// //             try {
// //               let payload = notif.extra?.payload;
              
// //               if (payload) {
// //                 const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
                
// //                 if (data.roomId === roomId) {
// //                   notificationsToCancel.push(notif.id);
// //                   // console.log(`📍 Found local notification ${notif.id} matching room ${roomId}`);
// //                 }
// //               }
// //             } catch (e) {
// //               console.error(`Error parsing notification ${notif.id}:`, e);
// //             }
// //           }
          
// //           if (notificationsToCancel.length > 0) {
// //             await LocalNotifications.cancel({
// //               notifications: notificationsToCancel.map(id => ({ id }))
// //             });
// //             console.log(`✅ Cleared ${notificationsToCancel.length} local notifications for room ${roomId}`);
// //           } else {
// //             console.log(`⚠️ No local notifications found matching room ${roomId}`);
// //           }
// //         }
// //       } catch (e) {
// //         console.error('❌ Error checking/clearing local notifications:', e);
// //       }

// //       try {
// //         // Get all delivered push notifications
// //         const pushDelivered = await PushNotifications.getDeliveredNotifications();
// //         // console.log(`📬 Found ${pushDelivered.notifications.length} delivered push notifications`);
        
// //         if (pushDelivered.notifications.length > 0) {
// //           const pushesToRemove: any[] = [];
          
// //           for (const notif of pushDelivered.notifications) {
// //             // console.log("🔍 Full notification object:", notif);
// //             // console.log("🔍 Notification data:", notif.data);
// //             // console.log("🔍 Notification tag:", notif.tag);
            
// //             try {
// //               let data: any = null;
              
// //               if (notif.data?.payload) {
// //                 const payload = notif.data.payload;
// //                 data = typeof payload === 'string' ? JSON.parse(payload) : payload;
// //                 // console.log("✅ Found payload in notif.data.payload:", data);
// //               }
// //               else if (notif.data) {
// //                 data = notif.data;
// //                 // console.log("✅ Using notif.data directly:", data);
// //               }
// //               else if (notif.tag && notif.tag.includes('FCM-Notification')) {
// //                 console.log("⚠️ No data found, using tag-based matching");
// //               }
              
// //               // Check if we found roomId
// //               if (notif.tag) {
// //                 // console.log(`🔍 Checking push notification:`, {
// //                 //   id: notif.id,
// //                 //   tag: notif.tag,
// //                 //   roomId: data.roomId,
// //                 //   targetRoomId: roomId,
// //                 //   matches: data.roomId === roomId
// //                 // });
                
// //                 if (notif.tag === roomId) {
// //                   pushesToRemove.push({
// //                     id: notif.id,
// //                     tag: notif.tag || '',
// //                     data: notif.data || {}
// //                   });
// //                   console.log(`📍 Found push notification matching room ${roomId}`, notif.id);
// //                 }
// //               } else {
// //                 console.log(`⚠️ No roomId found in notification ${notif.id}, skipping`);
// //               }
// //             } catch (e) {
// //               console.error(`❌ Error parsing push notification ${notif.id}:`, e);
// //             }
// //           }
          
// //           // Remove only matching push notifications
// //           if (pushesToRemove.length > 0) {
// //             try {
// //               // console.log(`🗑️ Attempting to remove ${pushesToRemove.length} notifications:`, pushesToRemove);
// //               await PushNotifications.removeDeliveredNotifications({
// //                 notifications: pushesToRemove
// //               });
// //               // console.log(`✅ Cleared ${pushesToRemove.length} push notifications for room ${roomId}`);
// //             } catch (e) {
// //               console.error(`❌ Error removing push notifications:`, e);
// //             }
// //           } else {
// //             console.log(`⚠️ No push notifications found matching room ${roomId}`);
// //           }
// //         }
// //       } catch (e) {
// //         console.error('❌ Error checking/clearing push notifications:', e);
// //         console.warn('⚠️ Could not selectively clear push notifications - keeping all to avoid data loss');
// //       }
      
// //       console.log(`✅ Notification clearing completed for room ${roomId}`);
      
// //     } catch (error) {
// //       console.error('❌ Error in clearNotificationForRoom:', error);
// //     }
// //   }

// //   // Clear ALL notifications (for logout or app reset)
// //   async clearAllNotifications(): Promise<void> {
// //     try {
// //       console.log('🧹 Clearing ALL notifications');
      
// //       // Clear all stored notification IDs
// //       this.activeNotifications.clear();
      
// //       // Clear all local notifications
// //       const delivered = await LocalNotifications.getDeliveredNotifications();
// //       if (delivered.notifications.length > 0) {
// //         await LocalNotifications.cancel({
// //           notifications: delivered.notifications.map(n => ({ id: n.id }))
// //         });
// //       }
      
// //       // Clear all push notifications
// //       await PushNotifications.removeAllDeliveredNotifications();
      
// //       console.log('✅ All notifications cleared');
// //     } catch (error) {
// //       console.error('❌ Error clearing all notifications:', error);
// //     }
// //   }

// //   // Expose method to get stored notification ID (if needed)
// //   getNotificationIdForRoom(roomId: string): number | undefined {
// //     return this.activeNotifications.get(roomId);
// //   }

// //   // When user turns ON from toggle: ask permission + register FCM
// //   async askNotificationPermissionAndRegister(): Promise<boolean> {
// //     try {
// //       let permStatus = await PushNotifications.checkPermissions();
// //       if (permStatus.receive !== 'granted') {
// //         permStatus = await PushNotifications.requestPermissions();
// //       }

// //       if (permStatus.receive !== 'granted') {
// //         console.warn('Push notification permission denied by user');
// //         return false;
// //       }

// //       await PushNotifications.register();

// //       // Local notifications (optional)
// //       try {
// //         const localPerm = await LocalNotifications.requestPermissions();
// //         if (localPerm.display !== 'granted') {
// //           console.warn('Local notification permission not granted');
// //         }
// //       } catch (e) {
// //         console.warn('Local notification permission check failed', e);
// //       }

// //       return true;
// //     } catch (error) {
// //       console.error('❌ Error while asking notification permission:', error);
// //       return false;
// //     }
// //   }

// //   // native app settings so user can turn notification OFF/ON there
// //   async openAppSettingsForNotifications(): Promise<void> {
// //     try {
// //       await NativeSettings.open({
// //         optionAndroid: AndroidSettings.ApplicationDetails,
// //         optionIOS: IOSSettings.AppNotification,
// //       });
// //     } catch (error) {
// //       console.error('❌ Error opening native settings:', error);
// //     }
// //   }

// //   // Save FCM token with isPermission flag set to TRUE
// //   async saveFcmTokenToDatabase(
// //     userId: string,
// //     userName: string,
// //     userPhone: string
// //   ) {
// //     try {
// //       if (!this.fcmToken) {
// //         setTimeout(
// //           () => this.saveFcmTokenToDatabase(userId, userName, userPhone),
// //           2000
// //         );
// //         return;
// //       }

// //       const db = getDatabase();
// //       const userRef = ref(db, `users/${userId}`);

// //       const userData = {
// //         name: userName,
// //         phone: userPhone,
// //         fcmToken: this.fcmToken,
// //         platform: this.isIos() ? 'ios' : 'android',
// //         lastActive: new Date().toISOString(),
// //         isPermission: true, // ✅ Set to TRUE when token is saved
// //       };

// //       await set(userRef, userData);
// //       console.log('✅ FCM token saved with isPermission: true');
// //     } catch (error) {
// //       console.error('❌ Error saving FCM token:', error);
// //     }
// //   }

// //   getFcmToken(): string {
// //     return this.fcmToken;
// //   }

// //   // Update FCM token with isPermission flag set to TRUE
// //   async updateFcmToken(userId: string): Promise<string | null> {
// //     try {
// //       if (!userId) {
// //         console.warn('⚠️ updateFcmToken: userId is required');
// //         return null;
// //       }

// //       console.log('🔄 Requesting fresh FCM token for user:', userId);
// //       this.fcmToken = '';
// //       try {
// //         const freshToken = await this.getFreshToken(10000);

// //         if (freshToken) {
// //           this.fcmToken = freshToken;
// //           console.log(
// //             '✅ Fresh token obtained:',
// //             freshToken.substring(0, 20) + '...'
// //           );

// //           // Update in Firebase
// //           const db = getDatabase();
// //           const userRef = ref(db, `users/${userId}`);
          
// //           await update(userRef, {
// //             fcmToken: this.fcmToken,
// //             platform: this.isIos() ? 'ios' : 'android',
// //             lastActive: new Date().toISOString(),
// //             isPermission: true, // ✅ Set to TRUE when token is updated
// //           });

// //           console.log('✅ FCM token updated in Firebase with isPermission: true');
// //           return this.fcmToken;
// //         } else {
// //           console.warn('⚠️ No fresh token received');
// //           return null;
// //         }
// //       } catch (err) {
// //         console.error('❌ Failed to get fresh token:', err);
// //         return null;
// //       }
// //     } catch (error) {
// //       console.error('❌ Error in updateFcmToken:', error);
// //       return null;
// //     }
// //   }

// //   // ✅ UPDATED: Delete FCM token and set isPermission flag to FALSE
// //   async deleteFcmToken(userId: string) {
// //     try {
// //       if (!userId) {
// //         console.warn('⚠️ deleteFcmToken: userId is required');
// //         return;
// //       }

// //       const db = getDatabase();
// //       const userRef = ref(db, `users/${userId}`);

// //       await update(userRef, {
// //         fcmToken: null,
// //         isPermission: false,
// //         lastActive: new Date().toISOString(),
// //       });

// //       console.log('✅ FCM token deleted and isPermission set to false');

// //       const UserId = Number(userId);
// //       if (!Number.isNaN(UserId)) {
// //         this.service.logoutUser(UserId).subscribe({
// //           next: (res) => {
// //             console.log('✅ Backend logout successful');
// //           },
// //           error: (err) => {
// //             console.error('❌ Backend logout failed:', err);
// //           },
// //         });
// //       } else {
// //         console.warn(
// //           '⚠️ Provided userId is not numeric — skipping backend logout API call'
// //         );
// //       }
// //     } catch (error) {
// //       console.error('❌ Error deleting user token:', error);
// //     }
// //   }

// //   // new Method to update only isPermission flag (useful for toggle changes)
// //   async updatePermissionStatus(userId: string, isPermission: boolean): Promise<void> {
// //     try {
// //       if (!userId) {
// //         console.warn('⚠️ updatePermissionStatus: userId is required');
// //         return;
// //       }

// //       const db = getDatabase();
// //       const userRef = ref(db, `users/${userId}`);

// //       await update(userRef, {
// //         isPermission: isPermission,
// //         lastActive: new Date().toISOString(),
// //       });

// //       console.log(`✅ isPermission updated to ${isPermission} for user ${userId}`);
// //     } catch (error) {
// //       console.error('❌ Error updating permission status:', error);
// //     }
// //   }

// //   async setUserOffline(userId: string) {
// //     try {
// //       const db = getDatabase();
// //       const userRef = ref(db, `users/${userId}/isOnline`);
// //       await set(userRef, false);
// //     } catch (error) {
// //       console.error('❌ Error setting user offline:', error);
// //     }
// //   }

// //   private isIos(): boolean {
// //     return /iPad|iPhone|iPod/.test(navigator.userAgent);
// //   }
// // }


// import { Injectable } from '@angular/core';
// import {
//   PushNotifications,
//   Token,
//   PushNotificationSchema,
//   ActionPerformed,
// } from '@capacitor/push-notifications';
// import {
//   LocalNotifications,
//   LocalNotificationActionPerformed,
// } from '@capacitor/local-notifications';
// import { getDatabase, ref, remove, set, update } from 'firebase/database';
// import { Router } from '@angular/router';
// import { Platform, ToastController } from '@ionic/angular';
// import { App } from '@capacitor/app';
// import { AuthService } from '../auth/auth.service';
// import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';
// import { ApiService } from './api/api.service';
// import { FirebaseChatService } from './firebase-chat.service';
// import { NativeSettings, AndroidSettings, IOSSettings } from 'capacitor-native-settings';
// import { Contacts } from '@capacitor-community/contacts';

// // ✅ Inline plugin interface definition
// interface ChatNotificationPlugin {
//   clearRoom(options: { roomId: string }): Promise<{ success: boolean; roomId: string }>;
//   clearAllRooms(): Promise<{ success: boolean }>;
// }

// // ✅ Register the native plugin
// const ChatNotification = registerPlugin<ChatNotificationPlugin>('ChatNotification');

// @Injectable({
//   providedIn: 'root',
// })
// export class FcmService {
//   private fcmToken: string = '';
//   // ✅ Track active notifications by roomId
//   private activeNotifications = new Map<string, number>();

//   constructor(
//     private router: Router,
//     private platform: Platform,
//     private toastController: ToastController,
//     private authService: AuthService,
//     private service: ApiService,
//     private firebaseChatService: FirebaseChatService
//   ) {}

//   // Helper to actively request a fresh token and return it (one-time listener)
//   private async getFreshToken(timeoutMs = 10000): Promise<string> {
//     return new Promise<string>(async (resolve, reject) => {
//       let timeoutId: any = null;
//       let listener: PluginListenerHandle | null = null;

//       const cleanup = () => {
//         if (timeoutId) {
//           clearTimeout(timeoutId);
//           timeoutId = null;
//         }
//         if (listener && typeof listener.remove === 'function') {
//           listener.remove();
//           listener = null;
//         }
//       };

//       try {
//         // Check and request permissions
//         let permStatus = await PushNotifications.checkPermissions();
//         if (permStatus.receive !== 'granted') {
//           permStatus = await PushNotifications.requestPermissions();
//         }
//         if (permStatus.receive !== 'granted') {
//           cleanup();
//           return reject(new Error('Push notification permission denied'));
//         }

//         // Set up one-time registration listener
//         listener = await PushNotifications.addListener(
//           'registration',
//           (token: Token) => {
//             console.log(
//               '📱 Registration token received:',
//               token.value.substring(0, 20) + '...'
//             );
//             this.fcmToken = token.value;
//             cleanup();
//             resolve(token.value);
//           }
//         );

//         // Set up timeout
//         timeoutId = setTimeout(() => {
//           console.warn('⏱️ Token request timed out');
//           cleanup();
//           if (this.fcmToken) {
//             resolve(this.fcmToken);
//           } else {
//             reject(new Error('Timed out waiting for registration token'));
//           }
//         }, timeoutMs);

//         // Trigger registration
//         console.log('📲 Triggering push notification registration...');
//         await PushNotifications.register();
//       } catch (err) {
//         cleanup();
//         reject(err);
//       }
//     });
//   }

//   async initializePushNotifications(): Promise<boolean> {
//     try {
//       // ✅ Request push notification permissions
//       let permStatus = await PushNotifications.checkPermissions();
//       if (permStatus.receive !== 'granted') {
//         permStatus = await PushNotifications.requestPermissions();
//       }
//       if (permStatus.receive !== 'granted') {
//         console.warn('Push notification permission denied');
//         return false;
//       }

//       // ✅ Register for push notifications & try to get token
//       await PushNotifications.register();

//       // Try to populate token (if registration listener in initialize isn't fired, use getFreshToken)
//       // but avoid double-listening — use getFreshToken only if this.fcmToken is not already set
//       if (!this.fcmToken) {
//         try {
//           const token = await this.getFreshToken(8000).catch(() => '');
//           if (token) {
//             this.fcmToken = token;
//           }
//         } catch (e) {
//           console.warn('Could not get initial token via getFreshToken:', e);
//         }
//       }

//       // ✅ Request local notification permissions
//       const localPerm = await LocalNotifications.requestPermissions();
//       if (localPerm.display !== 'granted') {
//         console.warn('Local notification permission not granted');
//       }

//       // 📌 Token registration (persistent listener for normal registration events)
//       PushNotifications.addListener('registration', (token: Token) => {
//         this.fcmToken = token.value;
//       });

//       // ❌ Registration error
//       PushNotifications.addListener('registrationError', (error: any) => {
//         console.error('❌ FCM registration error:', error);
//       });

//       // 📩 Foreground push - UPDATED with notification tracking
//       PushNotifications.addListener(
//         'pushNotificationReceived',
//         async (notification: PushNotificationSchema) => {
//           console.log('📩 Foreground push received:', notification);
          
//           // ✅ Extract sender phone and match with contacts
//           let displayTitle = notification.title || 'New Message';
          
//           try {
//             let payload = notification.data?.payload;
//             if (payload) {
//               const data = JSON.parse(payload);
              
//               if (data.senderPhone) {
//                 // ✅ Match with saved contacts
//                 const contactName = await this.getContactNameByPhone(data.senderPhone);
                
//                 if (contactName) {
//                   displayTitle = contactName; // ✅ Use saved contact name
//                   console.log(`📇 Found saved contact: ${contactName} for ${data.senderPhone}`);
//                 } else {
//                   displayTitle = data.senderPhone; // ✅ Use phone number if not saved
//                   console.log(`📱 Contact not saved, using phone: ${data.senderPhone}`);
//                 }
//               }
              
//               // Store notification ID
//               if (data.roomId) {
//                 const notifId = Math.floor(Math.random() * 1000000);
//                 this.activeNotifications.set(data.roomId, notifId);
                
//                 // ✅ Pass modified title
//                 await this.showLocalNotification(
//                   notification, 
//                   notifId, 
//                   data.roomId,
//                   displayTitle // ✅ Custom title
//                 );
//                 return;
//               }
//             }
//           } catch (e) {
//             console.error('Error processing notification:', e);
//           }          
//           await this.showLocalNotification(notification);
//         }
//       );

//       // 👉 CRITICAL: Background notification tapped
//        PushNotifications.addListener(
//         'pushNotificationActionPerformed',
//         async (notification: ActionPerformed) => {
//           console.log('👉 Background notification tap:', notification);

//           let payload = notification.notification?.data?.payload;
//           let data: any = {};

//           try {
//             if (payload) data = JSON.parse(payload);
//           } catch (e) {
//             console.error('❌ JSON parse error:', e);
//           }

//           console.log('👉 Parsed tap data:', data);

//           // ✅ Match contact and update notification display (for next time)
//           if (data.senderPhone) {
//             const contactName = await this.getContactNameByPhone(data.senderPhone);
//             if (contactName) {
//               console.log(`📇 Contact matched in background: ${contactName}`);
//               // Store for future use if needed
//               data.displayName = contactName;
//             }
//           }

//           this.handleNotificationTap(data);
//         }
//       );

//       // 👉 Local notification tapped (when shown in foreground)
//       LocalNotifications.addListener(
//         'localNotificationActionPerformed',
//         (evt: LocalNotificationActionPerformed) => {
//           console.log('👉 Local tap event:', evt);

//           let payload = evt.notification?.extra?.payload;
//           let data: any = {};

//           try {
//             if (payload) data = JSON.parse(payload);
//           } catch (e) {
//             console.error('❌ JSON parse error:', e);
//           }

//           console.log('👉 Parsed Local tap data:', data);
//           this.handleNotificationTap(data);
//         }
//       );

//       App.addListener('appStateChange', ({ isActive }) => {
//         if (isActive) {
//           this.checkForPendingNotifications();
//         }
//       });

//       window.addEventListener('notificationTapped', (event: any) => {
//         try {
//           const data = JSON.parse(event.detail);
//           this.handleNotificationTap(data);
//         } catch (e) {
//           console.error('Error parsing notification data:', e);
//         }
//       });

//       return true;
//     } catch (error) {
//       console.error('❌ Error initializing push notifications:', error);
//       return false;
//     }
//   }

//   private async getContactNameByPhone(phoneNumber: string): Promise<string | null> {
//     try {
//       // Normalize phone number (remove spaces, dashes, etc.)
//       const normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
      
//       // Check permission
//       const permission = await Contacts.checkPermissions();
      
//       if (permission.contacts !== 'granted') {
//         console.warn('⚠️ Contacts permission not granted');
//         return null;
//       }

//       // Get all contacts
//       const result = await Contacts.getContacts({
//         projection: {
//           name: true,
//           phones: true,
//         }
//       });

//       if (!result.contacts || result.contacts.length === 0) {
//         return null;
//       }

//       // Search for matching contact
//       for (const contact of result.contacts) {
//         if (contact.phones && contact.phones.length > 0) {
//           for (const phone of contact.phones) {
//             // Normalize contact phone
//             const normalizedContactPhone = phone.number?.replace(/[\s\-\(\)]/g, '') || '';
            
//             // Check if numbers match (last 10 digits for flexibility)
//             const last10Digits = normalizedPhone.slice(-10);
//             const contactLast10 = normalizedContactPhone.slice(-10);
            
//             if (last10Digits === contactLast10 && contactLast10.length === 10) {
//               const displayName = contact.name?.display || 
//                                  contact.name?.given || 
//                                  contact.name?.family || 
//                                  null;
              
//               if (displayName) {
//                 return displayName;
//               }
//             }
//           }
//         }
//       }

//       return null;
//     } catch (error) {
//       console.error('❌ Error matching contact:', error);
//       return null;
//     }
//   }

//   // ✅ UPDATED: Use native plugin to clear stored messages
//   async clearNativeStoredMessages(roomId: string) {
//     if (!roomId) {
//       console.warn('⚠️ clearNativeStoredMessages: roomId is required');
//       return;
//     }

//     if (Capacitor.getPlatform() === 'android') {
//       try {
//         console.log(`🧹 Clearing native stored messages for room: ${roomId}`);
        
//         const result = await ChatNotification.clearRoom({ roomId });
        
//         if (result.success) {
//           console.log(`✅ Native stored messages cleared successfully for room: ${roomId}`);
//         } else {
//           console.warn(`⚠️ Native clear returned false for room: ${roomId}`);
//         }
//       } catch (e) {
//         console.error('❌ Failed to clear native messages:', e);
//       }
//     } else {
//       console.log('ℹ️ Native message clearing only available on Android');
//     }
//   }

//   private async handleNotificationTap(data: any) {
//     console.log('🎯 Final Tap Data Received:', data);

//     const receiverId = data?.receiverId;
//     const roomId = data?.roomId;

//     if (receiverId && roomId) {
//       console.log({ receiverId, roomId });
//       console.log('Opening chat with roomId:', roomId);

//       try {
//         await this.firebaseChatService.openChat({ roomId });

//         // ✅ Clear BOTH notification and native stored messages
//         await this.clearNotificationForRoom(roomId);
//         await this.clearNativeStoredMessages(roomId);

//         this.router.navigate(['/chatting-screen'], {
//           queryParams: { receiverId },
//           state: { fromNotification: true },
//         });

//         localStorage.setItem('fromNotification', 'true');

//         console.log('✅ Chat opened, notifications cleared, and messages loaded successfully');
//         return;
//       } catch (error) {
//         console.error('❌ Error opening chat from notification:', error);
//         // Fallback to home if there's an error
//         this.router.navigate(['/home-screen']);
//         return;
//       }
//     }
//     this.router.navigate(['/home-screen']);
//   }

//   // ⭐ UPDATED: Track pending notifications when app resumes
//   private async checkForPendingNotifications() {
//     try {
//       console.log('🔍 Checking for pending notifications on app resume...');
      
//       // Track pending notifications when app opens from background
//       await this.trackPendingNotifications();
      
//       const delivered = await PushNotifications.getDeliveredNotifications?.();
//       console.log(`📬 App resumed with ${delivered?.notifications?.length || 0} push notifications`);
//     } catch (error) {
//       console.error('Error checking delivered notifications:', error);
//     }
//   }

//   // ⭐ NEW: Track all pending notifications
//   async trackPendingNotifications(): Promise<void> {
//     try {
//       console.log('📊 Tracking pending notifications...');
      
//       // Get all delivered push notifications
//       const pushDelivered = await PushNotifications.getDeliveredNotifications();
//       console.log(`📬 Found ${pushDelivered.notifications.length} pending push notifications`);
      
//       if (pushDelivered.notifications.length > 0) {
//         console.log('📋 Pending notifications by room:');
        
//         for (const notif of pushDelivered.notifications) {
//           try {
//             let payload = notif.data?.payload;
//             if (payload) {
//               const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
//               if (data.roomId) {
//                 console.log(`  📌 Room ${data.roomId}: ${notif.title || 'New message'}`);
//               }
//             }
//           } catch (e) {
//             console.error('Error parsing notification:', e);
//           }
//         }
//       } else {
//         console.log('✅ No pending notifications');
//       }
//     } catch (error) {
//       console.error('❌ Error tracking notifications:', error);
//     }
//   }

//   // ✅ UPDATED: Accept notification ID and roomId
//    private async showLocalNotification(
//     notification: PushNotificationSchema,
//     notificationId?: number,
//     roomId?: string,
//     customTitle?: string
//   ) {
//     try {
//       const notificationData = notification.data || {};
      
//       // ✅ Use custom title if provided
//       const title = customTitle || 
//                     notificationData.title || 
//                     notification.title || 
//                     'New Message';
      
//       const body = notificationData.body || 
//                    notification.body || 
//                    'You have a new message';

//       const finalNotificationId = notificationId || Math.floor(Math.random() * 1000000);

//       // Store notification ID
//       if (roomId && !this.activeNotifications.has(roomId)) {
//         this.activeNotifications.set(roomId, finalNotificationId);
//       }

//       await LocalNotifications.schedule({
//         notifications: [
//           {
//             id: finalNotificationId,
//             title, // ✅ Use matched contact name or phone
//             body,
//             extra: notificationData,
//             smallIcon: 'ic_notification',
//             sound: 'default',
//             schedule: { at: new Date(Date.now() + 500) },
//           },
//         ],
//       });

//       const toast = await this.toastController.create({
//         message: `${title}: ${body}`,
//         duration: 3000,
//         position: 'top',
//         cssClass: 'custom-toast',
//         buttons: [
//           {
//             text: '',
//             handler: () => {
//               this.handleNotificationTap(notificationData);
//             },
//           },
//         ],
//       });

//       await toast.present();
//     } catch (error) {
//       console.error('❌ Error scheduling local notification or toast:', error);
//     }
//   }

//   // ✅ Clear notifications ONLY for specific roomId
//   async clearNotificationForRoom(roomId: string): Promise<void> {
//     try {
//       console.log(`🧹 Attempting to clear notifications for room: ${roomId}`);
      
//       // 1️⃣ Clear stored local notification ID (foreground notifications)
//       const storedNotificationId = this.activeNotifications.get(roomId);
      
//       if (storedNotificationId) {
//         try {
//           await LocalNotifications.cancel({
//             notifications: [{ id: storedNotificationId }]
//           });
          
//           this.activeNotifications.delete(roomId);
//           console.log(`✅ Stored local notification cleared for room ${roomId}`);
//         } catch (e) {
//           console.error('Error clearing stored notification:', e);
//         }
//       }
      
//       // 2️⃣ Clear ALL delivered local notifications matching this roomId
//       try {
//         const delivered = await LocalNotifications.getDeliveredNotifications();
        
//         if (delivered.notifications.length > 0) {
//           const notificationsToCancel: number[] = [];
          
//           for (const notif of delivered.notifications) {
//             try {
//               let payload = notif.extra?.payload;
              
//               if (payload) {
//                 const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
                
//                 if (data.roomId === roomId) {
//                   notificationsToCancel.push(notif.id);
//                 }
//               }
//             } catch (e) {
//               console.error(`Error parsing notification ${notif.id}:`, e);
//             }
//           }
          
//           if (notificationsToCancel.length > 0) {
//             await LocalNotifications.cancel({
//               notifications: notificationsToCancel.map(id => ({ id }))
//             });
//             console.log(`✅ Cleared ${notificationsToCancel.length} local notifications for room ${roomId}`);
//           }
//         }
//       } catch (e) {
//         console.error('❌ Error checking/clearing local notifications:', e);
//       }

//       // 3️⃣ Clear push notifications
//       try {
//         const pushDelivered = await PushNotifications.getDeliveredNotifications();
        
//         if (pushDelivered.notifications.length > 0) {
//           const pushesToRemove: any[] = [];
          
//           for (const notif of pushDelivered.notifications) {
//             try {
//               let data: any = null;
              
//               if (notif.data?.payload) {
//                 const payload = notif.data.payload;
//                 data = typeof payload === 'string' ? JSON.parse(payload) : payload;
//               }
//               else if (notif.data) {
//                 data = notif.data;
//               }
              
//               if (notif.tag) {
//                 if (notif.tag === roomId) {
//                   pushesToRemove.push({
//                     id: notif.id,
//                     tag: notif.tag || '',
//                     data: notif.data || {}
//                   });
//                   console.log(`📍 Found push notification matching room ${roomId}`, notif.id);
//                 }
//               }
//             } catch (e) {
//               console.error(`❌ Error parsing push notification ${notif.id}:`, e);
//             }
//           }
          
//           if (pushesToRemove.length > 0) {
//             try {
//               await PushNotifications.removeDeliveredNotifications({
//                 notifications: pushesToRemove
//               });
//               console.log(`✅ Cleared ${pushesToRemove.length} push notifications for room ${roomId}`);
//             } catch (e) {
//               console.error(`❌ Error removing push notifications:`, e);
//             }
//           }
//         }
//       } catch (e) {
//         console.error('❌ Error checking/clearing push notifications:', e);
//       }
      
//       console.log(`✅ Notification clearing completed for room ${roomId}`);
      
//     } catch (error) {
//       console.error('❌ Error in clearNotificationForRoom:', error);
//     }
//   }

//   // Clear ALL notifications (for logout or app reset)
//   async clearAllNotifications(): Promise<void> {
//     try {
//       console.log('🧹 Clearing ALL notifications');
      
//       // Clear all stored notification IDs
//       this.activeNotifications.clear();
      
//       // Clear all local notifications
//       const delivered = await LocalNotifications.getDeliveredNotifications();
//       if (delivered.notifications.length > 0) {
//         await LocalNotifications.cancel({
//           notifications: delivered.notifications.map(n => ({ id: n.id }))
//         });
//       }
      
//       // Clear all push notifications
//       await PushNotifications.removeAllDeliveredNotifications();
      
//       console.log('✅ All notifications cleared');
//     } catch (error) {
//       console.error('❌ Error clearing all notifications:', error);
//     }
//   }

//   // Expose method to get stored notification ID (if needed)
//   getNotificationIdForRoom(roomId: string): number | undefined {
//     return this.activeNotifications.get(roomId);
//   }

//   // When user turns ON from toggle: ask permission + register FCM
//   async askNotificationPermissionAndRegister(): Promise<boolean> {
//     try {
//       let permStatus = await PushNotifications.checkPermissions();
//       if (permStatus.receive !== 'granted') {
//         permStatus = await PushNotifications.requestPermissions();
//       }

//       if (permStatus.receive !== 'granted') {
//         console.warn('Push notification permission denied by user');
//         return false;
//       }

//       await PushNotifications.register();

//       // Local notifications (optional)
//       try {
//         const localPerm = await LocalNotifications.requestPermissions();
//         if (localPerm.display !== 'granted') {
//           console.warn('Local notification permission not granted');
//         }
//       } catch (e) {
//         console.warn('Local notification permission check failed', e);
//       }

//       return true;
//     } catch (error) {
//       console.error('❌ Error while asking notification permission:', error);
//       return false;
//     }
//   }

//   // native app settings so user can turn notification OFF/ON there
//   async openAppSettingsForNotifications(): Promise<void> {
//     try {
//       await NativeSettings.open({
//         optionAndroid: AndroidSettings.ApplicationDetails,
//         optionIOS: IOSSettings.AppNotification,
//       });
//     } catch (error) {
//       console.error('❌ Error opening native settings:', error);
//     }
//   }

//   // Save FCM token with isPermission flag set to TRUE
//   async saveFcmTokenToDatabase(
//     userId: string,
//     userName: string,
//     userPhone: string
//   ) {
//     try {
//       if (!this.fcmToken) {
//         setTimeout(
//           () => this.saveFcmTokenToDatabase(userId, userName, userPhone),
//           2000
//         );
//         return;
//       }

//       const db = getDatabase();
//       const userRef = ref(db, `users/${userId}`);

//       const userData = {
//         name: userName,
//         phone: userPhone,
//         fcmToken: this.fcmToken,
//         platform: this.isIos() ? 'ios' : 'android',
//         lastActive: new Date().toISOString(),
//         isPermission: true,
//       };

//       await set(userRef, userData);
//       console.log('✅ FCM token saved with isPermission: true');
//     } catch (error) {
//       console.error('❌ Error saving FCM token:', error);
//     }
//   }

//   getFcmToken(): string {
//     return this.fcmToken;
//   }

//   // Update FCM token with isPermission flag set to TRUE
//   async updateFcmToken(userId: string): Promise<string | null> {
//     try {
//       if (!userId) {
//         console.warn('⚠️ updateFcmToken: userId is required');
//         return null;
//       }

//       console.log('🔄 Requesting fresh FCM token for user:', userId);
//       this.fcmToken = '';
//       try {
//         const freshToken = await this.getFreshToken(10000);

//         if (freshToken) {
//           this.fcmToken = freshToken;
//           console.log(
//             '✅ Fresh token obtained:',
//             freshToken.substring(0, 20) + '...'
//           );

//           // Update in Firebase
//           const db = getDatabase();
//           const userRef = ref(db, `users/${userId}`);
          
//           await update(userRef, {
//             fcmToken: this.fcmToken,
//             platform: this.isIos() ? 'ios' : 'android',
//             lastActive: new Date().toISOString(),
//             isPermission: true,
//           });

//           console.log('✅ FCM token updated in Firebase with isPermission: true');
//           return this.fcmToken;
//         } else {
//           console.warn('⚠️ No fresh token received');
//           return null;
//         }
//       } catch (err) {
//         console.error('❌ Failed to get fresh token:', err);
//         return null;
//       }
//     } catch (error) {
//       console.error('❌ Error in updateFcmToken:', error);
//       return null;
//     }
//   }

//   // ✅ UPDATED: Delete FCM token and set isPermission flag to FALSE
//   async deleteFcmToken(userId: string) {
//     try {
//       if (!userId) {
//         console.warn('⚠️ deleteFcmToken: userId is required');
//         return;
//       }

//       const db = getDatabase();
//       const userRef = ref(db, `users/${userId}`);

//       await update(userRef, {
//         fcmToken: null,
//         isPermission: false,
//         lastActive: new Date().toISOString(),
//       });

//       console.log('✅ FCM token deleted and isPermission set to false');

//       const UserId = Number(userId);
//       if (!Number.isNaN(UserId)) {
//         this.service.logoutUser(UserId).subscribe({
//           next: (res) => {
//             console.log('✅ Backend logout successful');
//           },
//           error: (err) => {
//             console.error('❌ Backend logout failed:', err);
//           },
//         });
//       } else {
//         console.warn(
//           '⚠️ Provided userId is not numeric — skipping backend logout API call'
//         );
//       }
//     } catch (error) {
//       console.error('❌ Error deleting user token:', error);
//     }
//   }

//   // new Method to update only isPermission flag (useful for toggle changes)
//   async updatePermissionStatus(userId: string, isPermission: boolean): Promise<void> {
//     try {
//       if (!userId) {
//         console.warn('⚠️ updatePermissionStatus: userId is required');
//         return;
//       }

//       const db = getDatabase();
//       const userRef = ref(db, `users/${userId}`);

//       await update(userRef, {
//         isPermission: isPermission,
//         lastActive: new Date().toISOString(),
//       });

//       console.log(`✅ isPermission updated to ${isPermission} for user ${userId}`);
//     } catch (error) {
//       console.error('❌ Error updating permission status:', error);
//     }
//   }

//   async setUserOffline(userId: string) {
//     try {
//       const db = getDatabase();
//       const userRef = ref(db, `users/${userId}/isOnline`);
//       await set(userRef, false);
//     } catch (error) {
//       console.error('❌ Error setting user offline:', error);
//     }
//   }

//   private isIos(): boolean {
//     return /iPad|iPhone|iPod/.test(navigator.userAgent);
//   }
// }


import { Injectable } from '@angular/core';
import {
  PushNotifications,
  Token,
  PushNotificationSchema,
  ActionPerformed,
} from '@capacitor/push-notifications';
import {
  LocalNotifications,
  LocalNotificationActionPerformed,
} from '@capacitor/local-notifications';
import { getDatabase, ref, remove, set, update } from 'firebase/database';
import { Router } from '@angular/router';
import { Platform, ToastController } from '@ionic/angular';
import { App } from '@capacitor/app';
import { AuthService } from '../auth/auth.service';
import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';
import { ApiService } from './api/api.service';
import { FirebaseChatService } from './firebase-chat.service';
import { ChatBackendSocketService } from './chat-backend-socket.service';
import { NativeSettings, AndroidSettings, IOSSettings } from 'capacitor-native-settings';
import { Contacts } from '@capacitor-community/contacts';

// ✅ Plugin interface definition
interface ChatNotificationPlugin {
  clearRoom(options: { roomId: string }): Promise<{ success: boolean; roomId: string }>;
  clearAllRooms(): Promise<{ success: boolean }>;
}

// ✅ Register the native plugin
const ChatNotification = registerPlugin<ChatNotificationPlugin>('ChatNotification');

@Injectable({
  providedIn: 'root',
})
export class FcmService {
  private fcmToken: string = '';
  private activeNotifications = new Map<string, number>();

  constructor(
    private router: Router,
    private platform: Platform,
    private toastController: ToastController,
    private authService: AuthService,
    private service: ApiService,
    private firebaseChatService: FirebaseChatService,
    private chatBackendSocket: ChatBackendSocketService
  ) {}

  private async getFreshToken(timeoutMs = 10000): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
      let timeoutId: any = null;
      let listener: PluginListenerHandle | null = null;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (listener && typeof listener.remove === 'function') {
          listener.remove();
          listener = null;
        }
      };

      try {
        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive !== 'granted') {
          permStatus = await PushNotifications.requestPermissions();
        }
        if (permStatus.receive !== 'granted') {
          cleanup();
          return reject(new Error('Push notification permission denied'));
        }

        listener = await PushNotifications.addListener(
          'registration',
          (token: Token) => {
            console.log(
              '📱 Registration token received:',
              token.value.substring(0, 20) + '...'
            );
            this.fcmToken = token.value;
            cleanup();
            resolve(token.value);
          }
        );

        timeoutId = setTimeout(() => {
          console.warn('⏱️ Token request timed out');
          cleanup();
          if (this.fcmToken) {
            resolve(this.fcmToken);
          } else {
            reject(new Error('Timed out waiting for registration token'));
          }
        }, timeoutMs);

        console.log('📲 Triggering push notification registration...');
        await PushNotifications.register();
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }

  async initializePushNotifications(): Promise<boolean> {
    try {
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive !== 'granted') {
        permStatus = await PushNotifications.requestPermissions();
      }
      if (permStatus.receive !== 'granted') {
        console.warn('Push notification permission denied');
        return false;
      }

      await PushNotifications.register();

      if (!this.fcmToken) {
        try {
          const token = await this.getFreshToken(8000).catch(() => '');
          if (token) {
            this.fcmToken = token;
          }
        } catch (e) {
          console.warn('Could not get initial token via getFreshToken:', e);
        }
      }

      const localPerm = await LocalNotifications.requestPermissions();
      if (localPerm.display !== 'granted') {
        console.warn('Local notification permission not granted');
      }

      PushNotifications.addListener('registration', (token: Token) => {
        this.fcmToken = token.value;
      });

      PushNotifications.addListener('registrationError', (error: any) => {
        console.error('❌ FCM registration error:', error);
      });

      // PushNotifications.addListener(
      //   'pushNotificationReceived',
      //   async (notification: PushNotificationSchema) => {
      //     console.log('📩 Foreground push received:', notification);
          
      //     let displayTitle = notification.title || 'New Message';
          
      //     try {
      //       let payload = notification.data?.payload;
      //       if (payload) {
      //         const data = JSON.parse(payload);
              
      //         if (data.senderPhone) {
      //           const contactName = await this.getContactNameByPhone(data.senderPhone);
                
      //           if (contactName) {
      //             displayTitle = contactName;
      //             console.log(`📇 Found saved contact: ${contactName} for ${data.senderPhone}`);
      //           } else {
      //             displayTitle = data.senderPhone;
      //             console.log(`📱 Contact not saved, using phone: ${data.senderPhone}`);
      //           }
      //         }
              
      //         if (data.roomId) {
      //           const notifId = Math.floor(Math.random() * 1000000);
      //           this.activeNotifications.set(data.roomId, notifId);
                
      //           await this.showLocalNotification(
      //             notification, 
      //             notifId, 
      //             data.roomId,
      //             displayTitle
      //           );
      //           return;
      //         }
      //       }
      //     } catch (e) {
      //       console.error('Error processing notification:', e);
      //     }          
      //     await this.showLocalNotification(notification);
      //   }
      // );

      PushNotifications.addListener(
  'pushNotificationReceived',
  async (notification: PushNotificationSchema) => {
    console.log('📩 Foreground push received:', notification);

    let displayTitle = notification.title || 'New Message';

    try {
      let payload = notification.data?.payload;
      if (payload) {
        const data = JSON.parse(payload);

        const chatType      = data.chatType || 'private';
        const communityTitle = data.communityTitle || '';
        const channelLabel   = data.channelLabel || '';
        const groupName      = data.groupName || '';

        if (data.senderPhone) {
          const contactName = await this.getContactNameByPhone(data.senderPhone);
          const senderDisplay = contactName || data.senderPhone;

          if (chatType === 'group') {
            // "Karan • MyGroup"
            displayTitle = groupName
              ? `${senderDisplay} • ${groupName}`
              : senderDisplay;

          } else if (chatType === 'community') {
            // "Karan > Testing Again > Announcement"
            if (communityTitle && channelLabel) {
              displayTitle = `${senderDisplay} • ${communityTitle} • ${channelLabel}`;
            } else if (communityTitle) {
              displayTitle = `${senderDisplay} • ${communityTitle}`;
            } else {
              displayTitle = senderDisplay;
            }

          } else {
            // Private
            displayTitle = senderDisplay;
          }

          console.log(`📇 Resolved title: ${displayTitle} (chatType: ${chatType})`);
        }

        if (data.roomId) {
          const notifId = Math.floor(Math.random() * 1000000);
          this.activeNotifications.set(data.roomId, notifId);

          await this.showLocalNotification(
            notification,
            notifId,
            data.roomId,
            displayTitle
          );
          return;
        }
      }
    } catch (e) {
      console.error('Error processing notification:', e);
    }

    await this.showLocalNotification(notification);
  }
);

       PushNotifications.addListener(
        'pushNotificationActionPerformed',
        async (notification: ActionPerformed) => {
          console.log('👉 Background notification tap:', notification);

          let payload = notification.notification?.data?.payload;
          let data: any = {};

          try {
            if (payload) data = JSON.parse(payload);
          } catch (e) {
            console.error('❌ JSON parse error:', e);
          }

          console.log('👉 Parsed tap data:', data);

          if (data.senderPhone) {
            const contactName = await this.getContactNameByPhone(data.senderPhone);
            if (contactName) {
              console.log(`📇 Contact matched in background: ${contactName}`);
              data.displayName = contactName;
            }
          }

          this.handleNotificationTap(data);
        }
      );

      LocalNotifications.addListener(
        'localNotificationActionPerformed',
        (evt: LocalNotificationActionPerformed) => {
          console.log('👉 Local tap event:', evt);

          let payload = evt.notification?.extra?.payload;
          let data: any = {};

          try {
            if (payload) data = JSON.parse(payload);
          } catch (e) {
            console.error('❌ JSON parse error:', e);
          }

          console.log('👉 Parsed Local tap data:', data);
          this.handleNotificationTap(data);
        }
      );

      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          this.checkForPendingNotifications();
        }
      });

      window.addEventListener('notificationTapped', (event: any) => {
        try {
          const data = JSON.parse(event.detail);
          this.handleNotificationTap(data);
        } catch (e) {
          console.error('Error parsing notification data:', e);
        }
      });

      return true;
    } catch (error) {
      console.error('❌ Error initializing push notifications:', error);
      return false;
    }
  }

  private async getContactNameByPhone(phoneNumber: string): Promise<string | null> {
    try {
      const normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
      
      const permission = await Contacts.checkPermissions();
      
      if (permission.contacts !== 'granted') {
        console.warn('⚠️ Contacts permission not granted');
        return null;
      }

      const result = await Contacts.getContacts({
        projection: {
          name: true,
          phones: true,
        }
      });

      if (!result.contacts || result.contacts.length === 0) {
        return null;
      }

      for (const contact of result.contacts) {
        if (contact.phones && contact.phones.length > 0) {
          for (const phone of contact.phones) {
            const normalizedContactPhone = phone.number?.replace(/[\s\-\(\)]/g, '') || '';
            
            const last10Digits = normalizedPhone.slice(-10);
            const contactLast10 = normalizedContactPhone.slice(-10);
            
            if (last10Digits === contactLast10 && contactLast10.length === 10) {
              const displayName = contact.name?.display || 
                                 contact.name?.given || 
                                 contact.name?.family || 
                                 null;
              
              if (displayName) {
                return displayName;
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error('❌ Error matching contact:', error);
      return null;
    }
  }

  // ✅ CRITICAL: Clear native stored messages
  async clearNativeStoredMessages(roomId: string) {
    if (!roomId) {
      console.warn('⚠️ clearNativeStoredMessages: roomId is required');
      return;
    }

    if (Capacitor.getPlatform() === 'android') {
      try {
        console.log(`🧹 [TS] Calling native clearRoom for: ${roomId}`);
        
        const result = await ChatNotification.clearRoom({ roomId });
        
        console.log('🎉 [TS] Native clear result:', result);
        
        if (result.success) {
          console.log(`✅ [TS] Native messages CLEARED successfully for room: ${roomId}`);
        } else {
          console.error(`❌ [TS] Native clear returned false for room: ${roomId}`);
        }
      } catch (e) {
        console.error('❌ [TS] Exception calling native clearRoom:', e);
      }
    } else {
      console.log('ℹ️ Native message clearing only available on Android');
    }
  }

  // private async handleNotificationTap(data: any) {
  //   console.log('🎯 Final Tap Data Received:', data);

  //   const receiverId = data?.receiverId;
  //   const roomId = data?.roomId;

  //   if (receiverId && roomId) {
  //     console.log({ receiverId, roomId });
  //     console.log('Opening chat with roomId:', roomId);

  //     try {
  //       // ✅ CRITICAL: Open chat first
  //       await this.firebaseChatService.openChat({ roomId });

  //       // ✅ CRITICAL: Clear BOTH notifications AND native storage IN ORDER
  //       console.log('🧹 Clearing notifications for room:', roomId);
  //       await this.clearNotificationForRoom(roomId);
        
  //       console.log('🧹 Clearing native storage for room:', roomId);
  //       await this.clearNativeStoredMessages(roomId);

  //       // ✅ Then navigate
  //       this.router.navigate(['/chatting-screen'], {
  //         queryParams: { receiverId },
  //         state: { fromNotification: true },
  //       });

  //       localStorage.setItem('fromNotification', 'true');

  //       console.log('✅ Chat opened, notifications cleared, and messages loaded successfully');
  //       return;
  //     } catch (error) {
  //       console.error('❌ Error opening chat from notification:', error);
  //       this.router.navigate(['/home-screen']);
  //       return;
  //     }
  //   }
  //   this.router.navigate(['/home-screen']);
  // }


// private async handleNotificationTap(data: any) {
//   console.log('🎯 Final Tap Data Received:', data);

//   // ✅ CRITICAL: Use senderId (the person who sent you the message)
//   // receiverId in payload = you (the notification recipient)
//   // senderId in payload = the person you want to chat with
//   const chatWithUserId = data?.senderId; // ✅ This is who you're chatting with
//   const roomId = data?.roomId;
//   const route = data?.route; // ✅ Get the route from payload

//   if (chatWithUserId && roomId) {
//     console.log({ chatWithUserId, roomId, route });
//     console.log('Opening chat with senderId:', chatWithUserId);

//     try {
//       // ✅ CRITICAL: Open chat first
//       await this.firebaseChatService.openChat({ roomId });

//       // ✅ CRITICAL: Clear BOTH notifications AND native storage IN ORDER
//       console.log('🧹 Clearing notifications for room:', roomId);
//       await this.clearNotificationForRoom(roomId);
      
//       console.log('🧹 Clearing native storage for room:', roomId);
//       await this.clearNativeStoredMessages(roomId);

//       // ✅ Navigate to chat with the sender
//       this.router.navigate(['/chatting-screen'], {
//         queryParams: { 
//           receiverId: chatWithUserId, // ✅ Chat with the person who sent the message
//           from: 'home'
//         },
//         state: { fromNotification: true },
//       });

//       localStorage.setItem('fromNotification', 'true');

//       console.log('✅ Chat opened, notifications cleared, and messages loaded successfully');
//       return;
//     } catch (error) {
//       console.error('❌ Error opening chat from notification:', error);
//       this.router.navigate(['/home-screen']);
//       return;
//     }
//   }
  
//   console.warn('⚠️ Missing chatWithUserId or roomId, navigating to home');
//   this.router.navigate(['/home-screen']);
// }

private async handleNotificationTap(data: any) {
  console.log('🎯 Final Tap Data Received:', data);

  // ✅ CRITICAL: Use senderId (the person who sent you the message)
  // receiverId in payload = you (the notification recipient)
  // senderId in payload = the person you want to chat with
  const chatWithUserId = data?.senderId; // ✅ This is who you're chatting with
  const roomId = data?.roomId;
  const route = data?.route; // ✅ Get the route from payload

  if (chatWithUserId && roomId) {
    console.log({ chatWithUserId, roomId, route });
    console.log('Opening chat with senderId:', chatWithUserId);

    try {
      // ✅ CRITICAL: Open chat first
      await this.firebaseChatService.openChat({ roomId });

      // ✅ CRITICAL: Clear BOTH notifications AND native storage IN ORDER
      console.log('🧹 Clearing notifications for room:', roomId);
      await this.clearNotificationForRoom(roomId);
      
      console.log('🧹 Clearing native storage for room:', roomId);
      await this.clearNativeStoredMessages(roomId);

      // ✅ Navigate using route from payload
      if (route) {
        // Parse the route: "/chatting-screen?receiverId=4"
        const [path, queryString] = route.split('?');
        
        // Build query params with 'from' parameter
        const queryParams: any = { from: 'home' };
        
        if (queryString) {
          // Parse existing query params from route
          queryString.split('&').forEach((param: { split: (arg0: string) => [any, any]; }) => {
            const [key, value] = param.split('=');
            if (key && value) {
              queryParams[key] = value;
            }
          });
        }
        
        console.log('📍 Navigating to:', path, 'with params:', queryParams);
        
        this.router.navigate([path], {
          queryParams,
          state: { fromNotification: true },
        });
      } else {
        // ✅ Fallback if no route in payload
        console.log('⚠️ No route in payload, using fallback navigation');
        this.router.navigate(['/chatting-screen'], {
          queryParams: { 
            receiverId: chatWithUserId,
            from: 'home'
          },
          state: { fromNotification: true },
        });
      }

      localStorage.setItem('fromNotification', 'true');

      console.log('✅ Chat opened, notifications cleared, and messages loaded successfully');
      return;
    } catch (error) {
      console.error('❌ Error opening chat from notification:', error);
      this.router.navigate(['/home-screen']);
      return;
    }
  }
  
  console.warn('⚠️ Missing chatWithUserId or roomId, navigating to home');
  this.router.navigate(['/home-screen']);
}
  private async checkForPendingNotifications() {
    try {
      console.log('🔍 Checking for pending notifications on app resume...');
      
      await this.trackPendingNotifications();
      
      const delivered = await PushNotifications.getDeliveredNotifications?.();
      console.log(`📬 App resumed with ${delivered?.notifications?.length || 0} push notifications`);
    } catch (error) {
      console.error('Error checking delivered notifications:', error);
    }
  }

  async trackPendingNotifications(): Promise<void> {
    try {
      console.log('📊 Tracking pending notifications...');
      
      const pushDelivered = await PushNotifications.getDeliveredNotifications();
      console.log(`📬 Found ${pushDelivered.notifications.length} pending push notifications`);
      
      if (pushDelivered.notifications.length > 0) {
        console.log('📋 Pending notifications by room:');
        
        for (const notif of pushDelivered.notifications) {
          try {
            let payload = notif.data?.payload;
            if (payload) {
              const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
              if (data.roomId) {
                console.log(`  📌 Room ${data.roomId}: ${notif.title || 'New message'}`);
              }
            }
          } catch (e) {
            console.error('Error parsing notification:', e);
          }
        }
      } else {
        console.log('✅ No pending notifications');
      }
    } catch (error) {
      console.error('❌ Error tracking notifications:', error);
    }
  }

   private async showLocalNotification(
    notification: PushNotificationSchema,
    notificationId?: number,
    roomId?: string,
    customTitle?: string
  ) {
    try {
      const notificationData = notification.data || {};
      
      const title = customTitle || 
                    notificationData.title || 
                    notification.title || 
                    'New Message';
      
      const body = notificationData.body || 
                   notification.body || 
                   'You have a new message';

      const finalNotificationId = notificationId || Math.floor(Math.random() * 1000000);

      if (roomId && !this.activeNotifications.has(roomId)) {
        this.activeNotifications.set(roomId, finalNotificationId);
      }

      await LocalNotifications.schedule({
        notifications: [
          {
            id: finalNotificationId,
            title,
            body,
            extra: notificationData,
            smallIcon: 'ic_notification',
            sound: 'default',
            schedule: { at: new Date(Date.now() + 500) },
          },
        ],
      });

      const toast = await this.toastController.create({
        message: `${title}: ${body}`,
        duration: 3000,
        position: 'top',
        cssClass: 'custom-toast',
        buttons: [
          {
            text: '',
            handler: () => {
              this.handleNotificationTap(notificationData);
            },
          },
        ],
      });

      await toast.present();
    } catch (error) {
      console.error('❌ Error scheduling local notification or toast:', error);
    }
  }

  async clearNotificationForRoom(roomId: string): Promise<void> {
    try {
      console.log(`🧹 [TS] Attempting to clear notifications for room: ${roomId}`);
      
      const storedNotificationId = this.activeNotifications.get(roomId);
      
      if (storedNotificationId) {
        try {
          await LocalNotifications.cancel({
            notifications: [{ id: storedNotificationId }]
          });
          
          this.activeNotifications.delete(roomId);
          console.log(`✅ [TS] Stored local notification cleared for room ${roomId}`);
        } catch (e) {
          console.error('Error clearing stored notification:', e);
        }
      }
      
      try {
        const delivered = await LocalNotifications.getDeliveredNotifications();
        
        if (delivered.notifications.length > 0) {
          const notificationsToCancel: number[] = [];
          
          for (const notif of delivered.notifications) {
            try {
              let payload = notif.extra?.payload;
              
              if (payload) {
                const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
                
                if (data.roomId === roomId) {
                  notificationsToCancel.push(notif.id);
                }
              }
            } catch (e) {
              console.error(`Error parsing notification ${notif.id}:`, e);
            }
          }
          
          if (notificationsToCancel.length > 0) {
            await LocalNotifications.cancel({
              notifications: notificationsToCancel.map(id => ({ id }))
            });
            console.log(`✅ [TS] Cleared ${notificationsToCancel.length} local notifications for room ${roomId}`);
          }
        }
      } catch (e) {
        console.error('❌ Error checking/clearing local notifications:', e);
      }

      try {
        const pushDelivered = await PushNotifications.getDeliveredNotifications();
        
        if (pushDelivered.notifications.length > 0) {
          const pushesToRemove: any[] = [];
          
          for (const notif of pushDelivered.notifications) {
            try {
              let data: any = null;
              
              if (notif.data?.payload) {
                const payload = notif.data.payload;
                data = typeof payload === 'string' ? JSON.parse(payload) : payload;
              }
              else if (notif.data) {
                data = notif.data;
              }
              
              if (notif.tag) {
                if (notif.tag === roomId) {
                  pushesToRemove.push({
                    id: notif.id,
                    tag: notif.tag || '',
                    data: notif.data || {}
                  });
                  console.log(`📍 [TS] Found push notification matching room ${roomId}`, notif.id);
                }
              }
            } catch (e) {
              console.error(`❌ Error parsing push notification ${notif.id}:`, e);
            }
          }
          
          if (pushesToRemove.length > 0) {
            try {
              await PushNotifications.removeDeliveredNotifications({
                notifications: pushesToRemove
              });
              console.log(`✅ [TS] Cleared ${pushesToRemove.length} push notifications for room ${roomId}`);
            } catch (e) {
              console.error(`❌ Error removing push notifications:`, e);
            }
          }
        }
      } catch (e) {
        console.error('❌ Error checking/clearing push notifications:', e);
      }
      
      console.log(`✅ [TS] Notification clearing completed for room ${roomId}`);
      
    } catch (error) {
      console.error('❌ Error in clearNotificationForRoom:', error);
    }
  }

  async clearAllNotifications(): Promise<void> {
    try {
      console.log('🧹 Clearing ALL notifications');
      
      this.activeNotifications.clear();
      
      const delivered = await LocalNotifications.getDeliveredNotifications();
      if (delivered.notifications.length > 0) {
        await LocalNotifications.cancel({
          notifications: delivered.notifications.map(n => ({ id: n.id }))
        });
      }
      
      await PushNotifications.removeAllDeliveredNotifications();
      
      console.log('✅ All notifications cleared');
    } catch (error) {
      console.error('❌ Error clearing all notifications:', error);
    }
  }

  getNotificationIdForRoom(roomId: string): number | undefined {
    return this.activeNotifications.get(roomId);
  }

  async askNotificationPermissionAndRegister(): Promise<boolean> {
    try {
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive !== 'granted') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        console.warn('Push notification permission denied by user');
        return false;
      }

      await PushNotifications.register();

      try {
        const localPerm = await LocalNotifications.requestPermissions();
        if (localPerm.display !== 'granted') {
          console.warn('Local notification permission not granted');
        }
      } catch (e) {
        console.warn('Local notification permission check failed', e);
      }

      return true;
    } catch (error) {
      console.error('❌ Error while asking notification permission:', error);
      return false;
    }
  }

  async openAppSettingsForNotifications(): Promise<void> {
    try {
      await NativeSettings.open({
        optionAndroid: AndroidSettings.ApplicationDetails,
        optionIOS: IOSSettings.AppNotification,
      });
    } catch (error) {
      console.error('❌ Error opening native settings:', error);
    }
  }

  async saveFcmTokenToDatabase(
    userId: string,
    userName: string,
    userPhone: string
  ) {
    try {
      if (!this.fcmToken) {
        setTimeout(
          () => this.saveFcmTokenToDatabase(userId, userName, userPhone),
          2000
        );
        return;
      }

      await this.chatBackendSocket.applySecuredBatchUpdates({
        updates: {
          [`users/${userId}`]: {
            name: userName,
            phone: userPhone,
            fcmToken: this.fcmToken,
            platform: this.isIos() ? 'ios' : 'android',
            lastActive: new Date().toISOString(),
            isPermission: true,
          }
        }
      });
      console.log('✅ FCM token saved with isPermission: true');
    } catch (error) {
      console.error('❌ Error saving FCM token:', error);
    }
  }

  getFcmToken(): string {
    return this.fcmToken;
  }

  async updateFcmToken(userId: string): Promise<string | null> {
    try {
      if (!userId) {
        console.warn('⚠️ updateFcmToken: userId is required');
        return null;
      }

      console.log('🔄 Requesting fresh FCM token for user:', userId);
      this.fcmToken = '';
      try {
        const freshToken = await this.getFreshToken(10000);

        if (freshToken) {
          this.fcmToken = freshToken;
          console.log(
            '✅ Fresh token obtained:',
            freshToken.substring(0, 20) + '...'
          );

          await this.chatBackendSocket.applySecuredBatchUpdates({
            updates: {
              [`users/${userId}/fcmToken`]: this.fcmToken,
              [`users/${userId}/platform`]: this.isIos() ? 'ios' : 'android',
              [`users/${userId}/lastActive`]: new Date().toISOString(),
              [`users/${userId}/isPermission`]: true,
            }
          });

          console.log('✅ FCM token updated via backend socket');
          return this.fcmToken;
        } else {
          console.warn('⚠️ No fresh token received');
          return null;
        }
      } catch (err) {
        console.error('❌ Failed to get fresh token:', err);
        return null;
      }
    } catch (error) {
      console.error('❌ Error in updateFcmToken:', error);
      return null;
    }
  }

  async deleteFcmToken(userId: string) {
    try {
      if (!userId) {
        console.warn('⚠️ deleteFcmToken: userId is required');
        return;
      }

      await this.chatBackendSocket.applySecuredBatchUpdates({
        updates: {
          [`users/${userId}/fcmToken`]: null,
          [`users/${userId}/isPermission`]: false,
          [`users/${userId}/lastActive`]: new Date().toISOString(),
        }
      });

      console.log('✅ FCM token deleted and isPermission set to false');

      const UserId = Number(userId);
      if (!Number.isNaN(UserId)) {
        this.service.logoutUser(UserId).subscribe({
          next: (res) => {
            console.log('✅ Backend logout successful');
          },
          error: (err) => {
            console.error('❌ Backend logout failed:', err);
          },
        });
      } else {
        console.warn(
          '⚠️ Provided userId is not numeric — skipping backend logout API call'
        );
      }
    } catch (error) {
      console.error('❌ Error deleting user token:', error);
    }
  }

  async updatePermissionStatus(userId: string, isPermission: boolean): Promise<void> {
    try {
      if (!userId) {
        console.warn('⚠️ updatePermissionStatus: userId is required');
        return;
      }

      await this.chatBackendSocket.applySecuredBatchUpdates({
        updates: {
          [`users/${userId}/isPermission`]: isPermission,
          [`users/${userId}/lastActive`]: new Date().toISOString(),
        }
      });

      console.log(`✅ isPermission updated to ${isPermission} for user ${userId}`);
    } catch (error) {
      console.error('❌ Error updating permission status:', error);
    }
  }

  async setUserOffline(userId: string) {
    try {
      await this.chatBackendSocket.applySecuredBatchUpdates({
        updates: { [`users/${userId}/isOnline`]: false }
      });
    } catch (error) {
      console.error('❌ Error setting user offline:', error);
    }
  }

  private isIos(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }
}