import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/auth/auth.service';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root',
})
export class FirebasePushService {
  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private router: Router
  ) {}

  private apiUrl = `${environment.backendApiUrl}/notification`;

  async initPush() {
    const platform = Capacitor.getPlatform();

    if (platform === 'android' || platform === 'ios') {
      try {
        const permStatus = await PushNotifications.requestPermissions();

        if (permStatus.receive === 'granted') {
          await PushNotifications.register();
        } else {
          console.warn('Push permission not granted:', permStatus);
          return;
        }

        // ── Request local notification permission (needed for foreground display) ──
        const localPerm = await LocalNotifications.requestPermissions();
        if (localPerm.display !== 'granted') {
          console.warn('Local notification permission not granted');
        }

        // ── Token registration (unchanged) ──
        PushNotifications.addListener('registration', async (token) => {
          const userId = this.authService.authData?.userId;
          this.http.post(`${this.apiUrl}/save_fcm_token`, {
            user_id: userId,
            fcm_token: token.value
          }).subscribe({
            next: (response) => console.log('Token saved:', response),
            error: (err) => console.error('Error saving token:', err)
          });
        });

        PushNotifications.addListener('registrationError', (error) => {
          console.error('Push registration error:', error);
        });

        // ── FOREGROUND handler — app is open ──
        // OS won't show anything automatically, we must show a local notification
        // PushNotifications.addListener('pushNotificationReceived', async (notification) => {
        //   console.log('Foreground push received:', notification);

        //   let data: any = {};
        //   try {
        //     data = JSON.parse(notification.data?.payload || '{}');
        //   } catch {
        //     data = notification.data || {};
        //   }

        //   const title = notification.title || data.title || 'New Message';
        //   const body  = notification.body  || data.body  || '';

        //   // Show local notification so it appears in the drawer even in foreground
        //   try {
        //     await LocalNotifications.schedule({
        //       notifications: [{
        //         id: Date.now(),                        // unique id per notification
        //         title,
        //         body,
        //         extra: data,                           // passed back on tap
        //         threadIdentifier: data.roomId || '',   // iOS grouping
        //         group: data.roomId || '',              // Android grouping
        //         groupSummary: false,
        //         smallIcon: 'ic_stat_icon_config_sample',
        //       }]
        //     });
        //   } catch (e) {
        //     console.error('Error scheduling local notification:', e);
        //   }
        // });
// ── FOREGROUND handler — app is open ──
PushNotifications.addListener('pushNotificationReceived', async (notification) => {
  console.log('Foreground push received:', notification);

  let data: any = {};
  try {
    data = JSON.parse(notification.data?.payload || '{}');
  } catch {
    data = notification.data || {};
  }

  // ✅ Use notifTitle/notifBody from data payload (sent by backend)
  // fallback to notification fields if backend still sends notification block
  const title = data.notifTitle || notification.title || data.title || 'New Message';
  const body  = data.notifBody  || notification.body  || data.body  || '';

  // ✅ Unique ID per message so notifications STACK instead of replace
  const notifId   = this.hashCode(data.notifTag   || String(Date.now()));
  // ✅ Stable ID per room for the group summary
  const summaryId = this.hashCode((data.notifGroup || data.roomId || 'default') + '_summary');
  const groupKey  = data.notifGroup || data.roomId || '';

  try {
    await LocalNotifications.schedule({
      notifications: [
        // Individual message notification
        {
          id: notifId,
          title,
          body,
          extra: data,
          threadIdentifier: groupKey,   // iOS: groups by conversation
          group: groupKey,              // Android: groups under same room
          groupSummary: false,          // this is NOT the summary
          smallIcon: 'ic_stat_icon_config_sample',
        },
        // Android group summary (the stack header)
        {
          id: summaryId,
          title,
          body: 'New messages',
          extra: data,
          threadIdentifier: groupKey,
          group: groupKey,
          groupSummary: true,           // ✅ this is the collapsed stack header
          smallIcon: 'ic_stat_icon_config_sample',
        }
      ]
    });
  } catch (e) {
    console.error('Error scheduling local notification:', e);
  }
});
        // ── TAP handler — user taps notification (foreground or background) ──
        PushNotifications.addListener('pushNotificationActionPerformed', async (action) => {
          console.log('Notification tapped:', action);

          let data: any = {};
          try {
            data = JSON.parse(action.notification?.data?.payload || '{}');
          } catch {
            data = action.notification?.data || {};
          }

          // Navigate to the chat route carried in the payload
          // Falls back to home if route is missing
          const route = data.route || '/home-screen';
          try {
            await this.router.navigateByUrl(route);
          } catch (e) {
            console.error('Navigation error:', e);
            await this.router.navigateByUrl('/home-screen');
          }
        });

        // ── LOCAL notification tap (when scheduled above is tapped) ──
        // Handles the case where user taps the local notification we fired in foreground
        LocalNotifications.addListener('localNotificationActionPerformed', async (action) => {
          console.log('Local notification tapped:', action);
          const data = action.notification?.extra || {};
          const route = data.route || '/home-screen';
          try {
            await this.router.navigateByUrl(route);
          } catch (e) {
            await this.router.navigateByUrl('/home-screen');
          }
        });

      } catch (e) {
        console.error('Error initializing push notifications:', e);
      }
    } else {
      console.log('Push notifications not supported on platform:', platform);
    }
  }


  private hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 2147483647; // keep within Android int range
}
}