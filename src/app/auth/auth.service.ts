import { Injectable } from '@angular/core';
import { ApiService } from '../services/api/api.service';
import { EncryptionService } from '../services/encryption.service';
import { SecureStorageService } from '../services/secure-storage/secure-storage.service';
import { Preferences } from '@capacitor/preferences';
import { Auth, signInWithCustomToken } from '@angular/fire/auth'; // ✅ signInAnonymously REMOVE, signInWithCustomToken ADD

interface AuthData {
  loggedIn: boolean;
  phone_number: string;
  userId: string;
  name?: string;
  app_token?: string;
  token_expires_in?: number;
  firebase_token?: string; // ✅ NEW FIELD
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private _isAuthenticated = false;
  private _authData: AuthData | null = null;

  constructor(
    private api: ApiService,
    private encryptionService: EncryptionService,
    private secureStorage: SecureStorageService,
    private firebaseAuth: Auth
  ) {}

  get isAuthenticated(): boolean {
    return this._isAuthenticated;
  }

  get authData(): AuthData | null {
    return this._authData;
  }

  get senderId(): string | null {
    return this._authData?.userId || null;
  }

  /** Send OTP */
  sendOtp(payload: { phone_number: string; country_code: string }): Promise<any> {
    return this.api.post('/api/auth/send-otp_mb_dev_new', payload).toPromise();
  }

  sendOtpDev(payload: { phone_number: string; country_code: string }): Promise<any> {
    return this.api.post('/api/auth/send-otp_mb_dev', payload).toPromise();
  }
  sendOtpNew(payload: { phone_number: string; email: string }): Promise<any> {
    return this.api.post('/api/auth/send-otp', payload).toPromise();
  }

  async verifyOtpNew(payload: {
    country_code: string;
    phone_number: string;
    otp_code: string;
    device_details?: Array<{
      device_uuid: string;
      device_model: string;
      os_name: string;
      os_version: string;
      app_version: string;
    }>;
  }): Promise<{ success: boolean; userId?: number; message?: string }> {
    try {
      const res: any = await this.api.post('/api/auth/verify-otp', payload).toPromise();

      if (!res.status) {
        return {
          success: false,
          message: res.message || 'Invalid or expired OTP'
        };
      }

      // ✅ STEP 1: Get Firebase Custom Token from backend
      let firebaseToken: string | undefined;
      try {
        const tokenRes: any = await this.api.getFirebaseToken(res.app_token).toPromise();
        if (tokenRes?.status && tokenRes?.firebase_token) {
          firebaseToken = tokenRes.firebase_token;
        }
      } catch (tokenErr) {
        console.warn('⚠️ Firebase token fetch failed:', tokenErr);
      }

      // // ✅ STEP 2: Sign in with Custom Token (fallback: skip Firebase auth if token missing)
      if (firebaseToken) {
        await signInWithCustomToken(this.firebaseAuth, firebaseToken);
        console.log('✅ Firebase custom token sign-in successful');
      } else {
        console.warn('⚠️ No firebase token — Firebase sign-in skipped');
      }

      // ✅ STEP 3: Save auth data including firebase_token
      const senderPhone = `${payload.country_code}${payload.phone_number}`;
      const authData: AuthData = {
        loggedIn: true,
        phone_number: senderPhone,
        userId: res.user_id.toString(),
        name: res.name || undefined,
        app_token: res.app_token,
        token_expires_in: res.token_expires_in,
        firebase_token: firebaseToken  // ✅ Save for hydrateAuth
      };

      await this.secureStorage.setItem('AUTH', JSON.stringify(authData));
      this._authData = authData;
      this._isAuthenticated = true;

      // ✅ STEP 4: Generate and upload ECC public key
      const publicKeyHex = await this.encryptionService.generateAndStoreECCKeys();
      await this.api.post('/api/users/update-public-key', {
        user_id: res.user_id,
        public_key: publicKeyHex
      }).toPromise();

      return {
        success: true,
        userId: res.user_id,
        message: res.message || 'OTP verified successfully'
      };

    } catch (error: any) {
      console.error('OTP verification failed:', error);
      const apiMessage = error?.error?.message || error?.message || 'OTP verification failed';
      return { success: false, message: apiMessage };
    }
  }

  /** Verify OTP & store in secure storage */
  async verifyOtp(payload: {
    country_code: string;
    phone_number: string;
    otp_code: string;
    device_details?: Array<{
      device_uuid: string;
      device_model: string;
      os_name: string;
      os_version: string;
      app_version: string;
    }>;
  }): Promise<{ success: boolean; userId?: number; message?: string }> {
    try {
      const res: any = await this.api.post('/api/auth/verify-otp_mb', payload).toPromise();

      if (!res.status) {
        return {
          success: false,
          message: res.message || 'Invalid or expired OTP'
        };
      }

      // ✅ STEP 1: Get Firebase Custom Token from backend
      let firebaseToken: string | undefined;
      try {
        const tokenRes: any = await this.api.getFirebaseToken(res.app_token).toPromise();
        if (tokenRes?.status && tokenRes?.firebase_token) {
          firebaseToken = tokenRes.firebase_token;
        }
      } catch (tokenErr) {
        console.warn('⚠️ Firebase token fetch failed:', tokenErr);
      }

      // ✅ STEP 2: Sign in with Custom Token (fallback: skip Firebase auth if token missing)
      if (firebaseToken) {
        await signInWithCustomToken(this.firebaseAuth, firebaseToken);
        console.log('✅ Firebase custom token sign-in successful');
      } else {
        console.warn('⚠️ No firebase token — Firebase sign-in skipped');
      }

      // ✅ STEP 3: Save auth data including firebase_token
      const senderPhone = `${payload.country_code}${payload.phone_number}`;
      const authData: AuthData = {
        loggedIn: true,
        phone_number: senderPhone,
        userId: res.user_id.toString(),
        name: res.name || undefined,
        app_token: res.app_token,
        token_expires_in: res.token_expires_in,
        firebase_token: firebaseToken  // ✅ Save for hydrateAuth
      };

      await this.secureStorage.setItem('AUTH', JSON.stringify(authData));
      this._authData = authData;
      this._isAuthenticated = true;

      // ✅ STEP 4: Generate and upload ECC public key
      const publicKeyHex = await this.encryptionService.generateAndStoreECCKeys();
      await this.api.post('/api/users/update-public-key', {
        user_id: res.user_id,
        public_key: publicKeyHex
      }).toPromise();

      return {
        success: true,
        userId: res.user_id,
        message: res.message || 'OTP verified successfully'
      };

    } catch (error: any) {
      console.error('OTP verification failed:', error);
      const apiMessage = error?.error?.message || error?.message || 'OTP verification failed';
      return { success: false, message: apiMessage };
    }
  }

  /** Verify device API */
  async verifyDevice(payload: any): Promise<any> {
    return this.api.post('/api/auth/verify-device', payload).toPromise();
  }

  /** Update user name in auth data */
  async updateUserName(name: string): Promise<void> {
    if (this._authData) {
      const updatedAuthData: AuthData = { ...this._authData, name };
      await this.secureStorage.setItem('AUTH', JSON.stringify(updatedAuthData));
      this._authData = updatedAuthData;
    }
  }

  /** Update complete auth data */
  async updateAuthData(updates: Partial<AuthData>): Promise<void> {
    if (this._authData) {
      const updatedAuthData: AuthData = { ...this._authData, ...updates };
      await this.secureStorage.setItem('AUTH', JSON.stringify(updatedAuthData));
      this._authData = updatedAuthData;
    }
  }

  /** Get user name */
  getUserName(): string | undefined {
    return this._authData?.name;
  }

  /** Hydrate auth data on app start */
  async hydrateAuth(): Promise<void> {
    try {
      const stored = await this.secureStorage.getItem('AUTH');
      if (stored) {
        const parsed: AuthData = JSON.parse(stored);

        if (parsed.loggedIn && parsed.phone_number && parsed.userId) {
          // ✅ Restore auth state immediately from secure storage.
          // This MUST happen before any network calls so that offline launches
          // still show cached data instead of routing to the login screen.
          this._authData = parsed;
          this._isAuthenticated = true;

          // ── Firebase re-auth (requires network) ──────────────────────────
          if (parsed.firebase_token) {
            try {
              await signInWithCustomToken(this.firebaseAuth, parsed.firebase_token);
              console.log('✅ Firebase re-authenticated with custom token on app start');
            } catch (firebaseErr: any) {
              // If we are offline (or get a network error from Firebase), keep the
              // user authenticated — PouchDB cache will serve the data.
              // Firebase will re-authenticate automatically when the device goes online.
              const isNetworkError =
                !navigator.onLine ||
                firebaseErr?.code === 'auth/network-request-failed';

              if (isNetworkError) {
                console.warn('⚠️ Offline — Firebase re-auth skipped, using cached auth');
                return; // ← keep _isAuthenticated = true
              }

              // Online but token expired → try to get a fresh token
              console.warn('⚠️ Saved firebase token expired, fetching fresh token...', firebaseErr);
              try {
                const tokenRes: any = await this.api.getFirebaseToken(parsed.app_token!).toPromise();
                if (tokenRes?.status && tokenRes?.firebase_token) {
                  await signInWithCustomToken(this.firebaseAuth, tokenRes.firebase_token);
                  await this.updateAuthData({ firebase_token: tokenRes.firebase_token });
                  console.log('✅ Firebase re-authenticated with fresh token');
                } else {
                  // app_token also invalid → force re-login
                  console.error('❌ Could not refresh firebase token → logging out');
                  await this.clearAuth();
                }
              } catch (refreshErr: any) {
                // If the refresh request itself failed due to network, keep auth intact
                const refreshIsNetworkError =
                  !navigator.onLine ||
                  refreshErr?.code === 'auth/network-request-failed';
                if (refreshIsNetworkError) {
                  console.warn('⚠️ Token refresh skipped (offline), keeping auth intact');
                  return; // ← keep _isAuthenticated = true
                }
                console.error('❌ Token refresh failed → logging out', refreshErr);
                await this.clearAuth();
              }
            }
            const currentUser = this.firebaseAuth.currentUser;
            console.log('Firebase UID:', currentUser?.uid);
            console.log('App userId:', parsed.userId);
            console.log('Match:', currentUser?.uid === parsed.userId);
          } else {
            console.warn('⚠️ No firebase_token in storage — Firebase auth skipped');
          }
          return;
        }
      }
      await this.clearAuth();
    } catch (err) {
      console.warn('Auth hydration failed:', err);
      await this.clearAuth();
    }
  }

  /** Logout & clear everything */
  async logout(): Promise<void> {
    await this.clearAuth();
  }

  /** Internal: Clear both secure storage & memory */
  private async clearAuth(): Promise<void> {
    await Preferences.clear();
    this._authData = null;
    this._isAuthenticated = false;
  }
}