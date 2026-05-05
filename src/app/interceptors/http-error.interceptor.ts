

import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpErrorResponse,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ToastController } from '@ionic/angular';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class ServerErrorInterceptor implements HttpInterceptor {

  private isToastVisible = false;

  constructor(
    private toastCtrl: ToastController,
    private authService: AuthService
  ) {}

  private async showToast(message: string) {
    if (this.isToastVisible) return;

    this.isToastVisible = true;

    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      color: 'danger',
      position: 'bottom',
    });

    await toast.present();

    toast.onDidDismiss().then(() => {
      this.isToastVisible = false;
    });
  }

intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {

  const token = this.authService.authData?.app_token;

  // excluding login api's
  const excludedUrls = [
    '/api/auth/send-otp',
    '/api/auth/send-otp_mb',
    '/api/auth/send-otp_mb_dev',
    '/api/auth/send-otp_mb_dev_new',
    '/api/auth/verify-otp_mb',
    '/api/auth/verify-device',
    '/api/auth/verify-otp',
    '/api/auth/send-otp'

  ];

  const isExcluded = excludedUrls.some(url => req.url.includes(url));

  // ✅ Exclude Google Translation API and S3 uploads
  const isGoogleScriptApi = req.url.includes('script.google.com');
  const isS3Url = req.url.includes('amazonaws.com');

  let modifiedReq = req;

 // ✅ Attach JWT only if NOT login API, NOT Google API, and NOT S3
  if (token && !isExcluded && !isGoogleScriptApi && !isS3Url) {
    modifiedReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next.handle(modifiedReq).pipe(
    catchError((error: HttpErrorResponse) => {

      // 🔴 NO INTERNET
      if (!navigator.onLine) {
        this.showToast('No internet connection. Please check your network.');
        return throwError(() => error);
      }

      // 🔴 SERVER DOWN (ignore Google API)
      if (error.status === 0 && !isGoogleScriptApi) {
        this.showToast('Server is unreachable. Please try again later.');
        return throwError(() => error);
      }

      // 🔴 UNAUTHORIZED only from your backend
      if (error.status === 401 && !isGoogleScriptApi) {
        this.showToast('Session expired. Please login again.');
        this.authService.logout();
        return throwError(() => error);
      }

      return throwError(() => error);
    })
  );
}
}
