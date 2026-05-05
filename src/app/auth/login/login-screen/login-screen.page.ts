import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController, IonInputOtp } from '@ionic/angular';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/auth/auth.service';
import { Device, DeviceInfo } from '@capacitor/device';
import { VersionCheck } from 'src/app/services/version-check';
import { Capacitor } from '@capacitor/core';
import { firstValueFrom } from 'rxjs';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { Language } from 'src/app/services/language';
import { GlobalSettingsSyncService } from 'src/app/services/global-settings-sync.service';
// import { Language } from '@ngx-translate/core';



@Component({
  selector: 'app-login-screen',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './login-screen.page.html',
  styleUrls: ['./login-screen.page.scss'],
})
export class LoginScreenPage {
  phoneNumber = '';
  countryCode = '+91';
  showOtpPopup = false;
  showConfirmPopup = false;
  otpValue: string = '';
  timer: number = 60;
  timerInterval: any;
  email: string = '';

  countries = [
  { name: 'India', code: '+91', disabled: false },
  // { name: 'Pakistan', code: '+92', disabled: true },
  // { name: 'UK', code: '+44', disabled: true },
  // { name: 'UAE', code: '+971', disabled: true },
  // { name: 'USA', code: '+1', disabled: true },
  // { name: 'Canada', code: '+1', disabled: true },
  // { name: 'Germany', code: '+49', disabled: true },
  // { name: 'France', code: '+33', disabled: true },
  // { name: 'Brazil', code: '+55', disabled: true },
  // { name: 'South Africa', code: '+27', disabled: true },
  // { name: 'Russia', code: '+7', disabled: true },
  // { name: 'China', code: '+86', disabled: true },
  // { name: 'Japan', code: '+81', disabled: true },
  // { name: 'Singapore', code: '+65', disabled: true },
  // { name: 'New Zealand', code: '+64', disabled: true },
  // { name: 'Mexico', code: '+52', disabled: true },
  // { name: 'Italy', code: '+39', disabled: true },
  // { name: 'Spain', code: '+34', disabled: true },
  // { name: 'Netherlands', code: '+31', disabled: true },
  // { name: 'Sweden', code: '+46', disabled: true }
];

  @ViewChild('otpInput') otpInput!: IonInputOtp;
  isLoading: boolean = false;
  isSendingOtp: boolean = false;
  isVerifyingOtp: boolean = false;
  selectedCountry: string | null = null;


  constructor(
    private authService: AuthService,
    private router: Router,
    private toastController: ToastController,
    private versionCheck: VersionCheck,
     private languageService: Language,
    //  private authService: AuthService,
  private userService: FirebaseChatService,
    private globalSettingsSync: GlobalSettingsSyncService,
    // private secureStorage: SecureStorageService
  ) { }

  async showToast(message: string, color: 'danger' | 'primary' | 'dark' = 'dark') {
    const toast = await this.toastController.create({ message, duration: 2000, color });
    toast.present();
  }

  allowOnlyNumbers(event: KeyboardEvent) {
    if (!/^\d$/.test(event.key)) event.preventDefault();
  }

  isPhoneValid(): boolean {
    return /^\d{10}$/.test(this.phoneNumber.trim());
  }

  isEmailValid(): boolean {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailPattern.test(this.email.trim());
  }

  isOtpComplete(): boolean {
    return this.otpValue.length === 6;
  }

  getFormattedTime(): string {
    const minutes = Math.floor(this.timer / 60);
    const seconds = this.timer % 60;
    return `${('0' + minutes).slice(-2)} : ${('0' + seconds).slice(-2)}`;
  }

  startTimer() {
    this.timer = 60;
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.timer > 0) this.timer--;
      else clearInterval(this.timerInterval);
    }, 1000);
  }

  resendOtp() {
    if (this.timer === 0) {
      this.sendOtp();
    }
  }

  onCountryChange(event: any) {
  const selectedCountryName = event.target.value;
  const selected = this.countries.find(c => c.name === selectedCountryName);
  
  if (selected && !selected.disabled) {
    this.selectedCountry = selectedCountryName;
    this.countryCode = selected.code;
  } else if (selected && selected.disabled) {
    // Reset to India if disabled country selected
    this.selectedCountry = 'India';
    this.countryCode = '+91';
    this.showToast('This country is currently not supported', 'dark');
    
    // Reset dropdown to India
    setTimeout(() => {
      const selectElement = event.target;
      selectElement.value = 'India';
    }, 100);
  }
  
  //console.log(`✅ UI Country Code: ${this.countryCode}, Payload will use: +91`);
}

  onAgreeClick() {
    this.phoneNumber = this.phoneNumber.trim();
    if (!this.isPhoneValid() || !this.isEmailValid()) {
      this.showToast('Please enter a valid 10-digit mobile number and email address.', 'danger');
      return;
    }
    this.showConfirmPopup = true;
  }

  onEdit() {
    this.showConfirmPopup = false;
  }

  async onConfirm() {
    this.showConfirmPopup = false;
    this.isSendingOtp = true;
    await this.sendOtp();
    this.isSendingOtp = false;
  }

  async sendOtp() {
  const payload = {
    phone_number: this.phoneNumber.trim(),
    // country_code: this.countryCode,
    email:this.email
  };

  try {
    console.log('📨 Sending OTP payload:', payload);
    // return;
    // const res = await this.authService.sendOtp(payload);
    const res = await this.authService.sendOtpNew(payload);

    //console.log('📬 OTP API Response:', res);

    if (res.status) {
      this.showToast('OTP sent successfully.', 'primary');
      this.showOtpPopup = true;
      this.startTimer();
      // Clear previous OTP value
      this.otpValue = '';
      // Focus the OTP input after a short delay
      setTimeout(() => {
        if (this.otpInput) {
          this.otpInput.setFocus();
        }
      }, 300);
    } else {
      this.showToast(res.message || 'Failed to send OTP.', 'danger');
    }
  } catch (err) {
    console.error('❌ OTP API Error:', err);
    this.showToast('Failed to send OTP. Try again.', 'danger');
  }
}

  onOtpChange(event: any) {
    this.otpValue = event.detail.value;
  }

//   async goToHome() {
//   if (!this.isOtpComplete()) {
//     this.showToast('Please enter the complete 6-digit OTP.');
//     return;
//   }

//   this.isVerifyingOtp = true;

//   const payload = {
//     country_code: '+91',
//     phone_number: this.phoneNumber.trim(),
//     otp_code: this.otpValue
//   };

//   try {
//     //console.log('📨 Verifying OTP payload:', payload);
//     const result = await this.authService.verifyOtp(payload);
//     this.isVerifyingOtp = false;

//     if (result.success) {
//       this.showToast('Login successful!', 'primary');
      
//       this.router.navigateByUrl('/profile-setup', { replaceUrl: true });
//     } else {
//       this.showToast(result.message || 'Invalid OTP', 'danger');
//     }
//   } catch (err) {
//     this.isVerifyingOtp = false;
//     this.showToast('Verification failed. Please try again.', 'danger');
//     console.error(err);
//   }
// }
// async goToHome() {
//   if (!this.isOtpComplete()) {
//     this.showToast('Please enter the complete 6-digit OTP.');
//     return;
//   }

//   this.isVerifyingOtp = true;

//   try {
//     // 1️⃣ Get device info (with web fallback)
//     let info: any;
//     const platform = Capacitor.getPlatform();
//     if (platform === 'web') {
//       // Fallback for web platform
//       info = {
//         model: navigator.userAgent.includes('Mobile') ? 'Mobile Web' : 'Desktop Web',
//         operatingSystem: 'Web',
//         osVersion: 'N/A', // Or parse from navigator.userAgent if needed
//         uuid: localStorage.getItem('device_uuid') || crypto.randomUUID()
//       };
//       // Persist UUID if new
//       if (!localStorage.getItem('device_uuid')) {
//         localStorage.setItem('device_uuid', info.uuid);
//       }
//     } else {
//       info = await Device.getInfo();
//     }
//     //console.log('Device info:', info);

//     // 2️⃣ Get current app version from VersionCheck (with web fallback)
//     let appVersion = '00'; // Default fallback
//     if (platform !== 'web') {
//       try {
//         const versionResult = await this.versionCheck.checkVersion();
//         appVersion = versionResult.currentVersion || '00';
//       } catch (versionErr) {
//         console.warn('Version check failed:', versionErr);
//         appVersion = '00';
//       }
//     } else {
//       // For web, you could read from package.json or manifest.json
//       // Example: hardcode or use a service to get it
//       appVersion = 'web.1.0.0'; // Adjust as needed
//     }
//     //console.log('App version:', appVersion);

//     // 3️⃣ Use persistent UUID
//     let uuid = localStorage.getItem('device_uuid') || info.uuid || crypto.randomUUID();
//     if (!localStorage.getItem('device_uuid')) {
//       localStorage.setItem('device_uuid', uuid);
//     }

//     // 4️⃣ Create device payload
//     const devicePayload = {
//       device_uuid: uuid,
//       device_model: info.model,
//       os_name: info.operatingSystem,
//       os_version: info.osVersion,
//       app_version: appVersion
//     };

//     // 5️⃣ Prepare OTP verification payload
//     const payload = {
//       country_code: this.countryCode,
//       phone_number: this.phoneNumber.trim(),
//       otp_code: this.otpValue,
//       device_details: [devicePayload]
//     };

//     //console.log('📨 Verifying OTP payload:', payload);

//     // 6️⃣ Call backend API
//     const result = await this.authService.verifyOtp(payload);
//     this.isVerifyingOtp = false;

//     if (result.success) {
//       this.showToast('Login successful!', 'primary');
//       this.router.navigateByUrl('/profile-setup', { replaceUrl: true });
//     } else {
//       this.showToast(result.message || 'Invalid OTP', 'danger');
//     }
//   } catch (err) {
//     this.isVerifyingOtp = false;
//     console.error('Error in goToHome:', err); // Enhanced logging
//     this.showToast('Verification failed. Please try again.', 'danger');
//   }
// }

// -------------------- goToHome() method --------------------
async goToHome() {
  if (!this.isOtpComplete()) {
    this.showToast('Please enter the complete 6-digit OTP.');
    return;
  }

  this.isVerifyingOtp = true;

  try {
    // 1️⃣ Device info (web fallback)
    let info: any;
    const platform = Capacitor.getPlatform();
    if (platform === 'web') {
      info = {
        model: navigator.userAgent.includes('Mobile') ? 'Mobile Web' : 'Desktop Web',
        operatingSystem: 'Web',
        osVersion: 'N/A',
        uuid: localStorage.getItem('device_uuid') || crypto.randomUUID()
      };
      if (!localStorage.getItem('device_uuid')) {
        localStorage.setItem('device_uuid', info.uuid);
      }
    } else {
      // If your project supports default import: const dev = await Device.getInfo();
      // Some setups require Device.getInfo() from '@capacitor/device'
      info = await (Device as any).getInfo(); // cast if needed
    }

    // 2️⃣ App version (fallback for web)
    let appVersion = '00';
    if (platform !== 'web') {
      try {
        const versionResult: any = await this.versionCheck.checkVersion();
        appVersion = versionResult?.currentVersion || '00';
      } catch (versionErr) {
        console.warn('Version check failed:', versionErr);
        appVersion = '00';
      }
    } else {
      appVersion = 'web.1.0.0';
    }

    // 3️⃣ Ensure persistent UUID
    let uuid = localStorage.getItem('device_uuid') || info?.uuid || crypto.randomUUID();
    if (!localStorage.getItem('device_uuid')) {
      localStorage.setItem('device_uuid', uuid);
    }

    // 4️⃣ Device payload
    const devicePayload = {
      device_uuid: uuid,
      device_model: info?.model || 'Unknown',
      os_name: info?.operatingSystem || info?.os || 'Unknown',
      os_version: info?.osVersion || info?.osVersion || 'Unknown',
      app_version: appVersion
    };

    // 5️⃣ OTP payload
    const payload = {
     country_code: "+91",
      phone_number: this.phoneNumber?.trim(),
      otp_code: this.otpValue,
      device_details: [devicePayload]
    };

    // 6️⃣ Call backend API to verify OTP
    const result: any = await this.authService.verifyOtp(payload);
    this.isVerifyingOtp = false;

    if (result?.success) {
      this.showToast('Login successful!', 'primary');

      try {
        await this.globalSettingsSync.initialize(true);
      } catch (settingsErr) {
        console.warn('Global settings fetch after login failed:', settingsErr);
      }

      // -----------------------------
      // Get & apply user's language
      // -----------------------------
      const syncedLanguage = localStorage.getItem('app_language');
      if (syncedLanguage) {
        await this.languageService.useLanguage(syncedLanguage);
      } else {
        try {
          // Get userId from authService (ensure authData is populated after verifyOtp)
          const userId = Number(this.authService.authData?.userId || 0);
          if (userId > 0) {
            const res = await firstValueFrom(this.userService.getUserLanguage(userId));
            if (res?.language) {
              const normalized = this._normalizeLanguageCode(res.language);

              // Save to same key used by Language service
              try { localStorage.setItem('app_language', normalized); } catch (e) { /* ignore */ }

              // Apply via Language service (handles translate.use + RTL)
              await this.languageService.useLanguage(normalized);
            } else {
              console.warn('No language returned from API for user', userId);
            }
          } else {
            console.warn('No userId available after OTP verification');
          }
        } catch (langErr) {
          console.warn('getUserLanguage failed:', langErr);
        }
      }

      // Navigate after language applied
      await this.router.navigateByUrl('/profile-setup', { replaceUrl: true });
    } else {
      this.showToast(result?.message || 'Invalid OTP', 'danger');
    }
  } catch (err) {
    this.isVerifyingOtp = false;
    console.error('Error in goToHome:', err);
    this.showToast('Verification failed. Please try again.', 'danger');
  }
}


// ----------------------------------------------------------------------


// -------------------- helper: normalize language code --------------------
private _normalizeLanguageCode(code: string): string {
  if (!code) return 'en-GB';
  const c = code.trim().toLowerCase();

  const map: Record<string, string> = {
    en: 'en-GB',
    hi: 'hi-IN',
    ur: 'ur-PK',
    pa: 'pa-IN',
    gu: 'gu-IN',
    ta: 'ta-IN',
    te: 'te-IN',
    mr: 'mr-IN',
    bn: 'bn-BD',
    ar: 'ar-EG'
  };

  if (map[c]) return map[c];

  // If API sent a locale like 'hi-IN', try to match casing with available codes
  if (c.includes('-')) {
    const avail = this.languageService.getAvailableLanguageCodes();
    const match = avail.find(l => l.toLowerCase() === c);
    if (match) return match;
    return code; // let language service handle fallback
  }

  return 'en-GB';
}

}