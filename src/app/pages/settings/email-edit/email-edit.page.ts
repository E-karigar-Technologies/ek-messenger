import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { IonicModule, ToastController } from '@ionic/angular';
import { FormBuilder, FormGroup, Validators, FormControl, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from 'src/app/services/api/api.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuthService } from 'src/app/auth/auth.service';

@Component({
  selector: 'app-email-edit',
  templateUrl: './email-edit.page.html',
  styleUrls: ['./email-edit.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, ReactiveFormsModule, TranslateModule],
})
export class EmailEditPage implements OnInit, OnDestroy {
  @ViewChild('otpInput') otpInput: any;

  emailForm: FormGroup;
  isEditing = false;
  originalEmail = '';
  isEmailVerified = false;

  // OTP popup state
  showOtpPopup = false;
  otpValue = '';
  isSendingOtp = false;
  isVerifyingOtp = false;
  pendingEmail = '';

  // Countdown timer
  timer = 60;
  timerInterval: any;

  constructor(
    private fb: FormBuilder,
    private toastCtrl: ToastController,
    private router: Router,
    private userService: ApiService,
    private translate: TranslateService,
    private authService: AuthService
  ) {
    this.emailForm = this.fb.group({
      email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    });
  }

  ngOnInit() {
    this.loadEmail();
  }

  ngOnDestroy() {
    clearInterval(this.timerInterval);
  }

  get emailControl(): FormControl {
    return this.emailForm.get('email') as FormControl;
  }

  get isOtpComplete(): boolean {
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

  /** Load current email and verification status */
  loadEmail() {
    const uid = Number(this.authService.authData?.userId);
    this.userService.getUserEmail(uid).subscribe({
      next: (res) => {
        const email = res.email ?? '';
        this.originalEmail = email || 'you@example.com';
        this.emailForm.patchValue({ email: this.originalEmail });
      },
      error: async () => {
        const msg = await this.getTranslation('emailEdit.toast.loadFailed', 'Failed to load email');
        this.showToast(msg, 'danger');
      },
    });

    this.userService.checkEmailVerificationStatus().subscribe({
      next: (res) => {
        this.isEmailVerified = !!res.email_verified;
      },
      error: () => {
        this.isEmailVerified = false;
      },
    });
  }

  /** Switch to edit mode */
  editEmail() {
    this.isEditing = true;
    this.emailControl.markAsPristine();
    this.emailControl.markAsUntouched();
  }

  /** Send OTP to entered email */
  async saveEmail() {
    if (this.emailForm.invalid) return;
    this.pendingEmail = this.emailForm.value.email.trim();
    this.isSendingOtp = true;
    try {
      const res = await this.userService.sendEmailVerification(this.pendingEmail).toPromise();
      if (res?.status) {
        this.showOtpPopup = true;
        this.otpValue = '';
        this.startTimer();
        setTimeout(() => this.otpInput?.setFocus?.(), 300);
        this.showToast(`OTP sent to ${this.pendingEmail}`, 'success');
      } else {
        this.showToast(res?.message || 'Failed to send OTP', 'danger');
      }
    } catch (err: any) {
      this.showToast(err?.error?.message || 'Failed to send OTP. Try again.', 'danger');
    } finally {
      this.isSendingOtp = false;
    }
  }

  /** Verify OTP entered by user */
  async verifyOtp() {
    if (!this.isOtpComplete) return;
    this.isVerifyingOtp = true;
    try {
      const res = await this.userService.verifyEmailOtp(this.pendingEmail, this.otpValue).toPromise();
      if (res?.status) {
        // Save email on backend after successful verification
        const uid = Number(this.authService.authData?.userId);
        await this.userService.updateUserEmail(uid, this.pendingEmail).toPromise();

        this.originalEmail = this.pendingEmail;
        this.emailForm.patchValue({ email: this.pendingEmail });
        this.isEmailVerified = true;
        this.showOtpPopup = false;
        this.isEditing = false;
        clearInterval(this.timerInterval);
        this.showToast('Email verified successfully!', 'success');
      } else {
        this.showToast(res?.message || 'Invalid OTP', 'danger');
      }
    } catch (err: any) {
      this.showToast(err?.error?.message || 'Verification failed. Try again.', 'danger');
    } finally {
      this.isVerifyingOtp = false;
    }
  }

  /** Resend OTP (available after 60s) */
  async resendOtp() {
    if (this.timer > 0) return;
    try {
      const res = await this.userService.resendEmailVerification(this.pendingEmail).toPromise();
      if (res?.status) {
        this.otpValue = '';
        this.startTimer();
        this.showToast('OTP resent successfully', 'success');
      } else {
        // e.g. "already verified"
        this.showToast(res?.message || 'Could not resend OTP', 'warning');
      }
    } catch (err: any) {
      this.showToast(err?.error?.message || 'Failed to resend OTP', 'danger');
    }
  }

  onOtpChange(event: any) {
    this.otpValue = event.detail.value ?? '';
  }

  /** Dismiss OTP popup without verifying */
  dismissOtp() {
    this.showOtpPopup = false;
    this.otpValue = '';
    clearInterval(this.timerInterval);
  }

  /** Cancel edit mode */
  cancelEdit() {
    this.isEditing = false;
    this.emailForm.reset({ email: this.originalEmail });
  }

  private async getTranslation(key: string, fallback: string): Promise<string> {
    return new Promise((resolve) => {
      this.translate.get(key).subscribe({
        next: (v) => resolve(v || fallback),
        error: () => resolve(fallback),
      });
    });
  }

  private async showToast(message: string, color: string = 'primary') {
    const toast = await this.toastCtrl.create({
      message,
      color,
      duration: 2500,
      position: 'bottom',
    });
    toast.present();
  }
}

