import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, NavController, ToastController, LoadingController } from '@ionic/angular';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from 'src/app/services/api/api.service';
import { AuthService } from 'src/app/auth/auth.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-add-instagram',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule],
  templateUrl: './add-instagram.page.html',
  styleUrls: ['./add-instagram.page.scss']
})
export class AddInstagramPage implements OnInit {
  username: string = '';

  constructor(
    private router: Router,
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private apiService: ApiService,
    private authService: AuthService,
    private translate: TranslateService
  ) {}

  async ngOnInit() {
    await this.loadInstagramUsername();
  }

  private async loadInstagramUsername() {
    const userId = Number(this.authService.authData?.userId || 0);
    if (!userId) return;

    const loading = await this.loadingCtrl.create({
      message: this.translate.instant('addInstagram.loading'),
      backdropDismiss: false,
      cssClass:'custom-loading'
    });
    await loading.present();

    this.apiService.getSocialMedia(userId).subscribe({
      next: async (res) => {
        await loading.dismiss();
        if (res?.success && Array.isArray(res.data)) {
          const insta = res.data.find((item) => item.platform?.toLowerCase() === 'instagram');
          if (insta?.profile_url) {
            this.username = insta.profile_url
              .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
              .replace(/\/$/, '');
          }
        }
      },
      error: async (err) => {
        await loading.dismiss();
        console.error('Failed to load social media', err);
        const t = await this.toastCtrl.create({
          message: this.translate.instant('addInstagram.toast.fetchFailed'),
          duration: 2000,
          color: 'danger'
        });
        await t.present();
      }
    });
  }

  async save() {
    const trimmed = (this.username || '').trim();
    if (!trimmed) {
      const t = await this.toastCtrl.create({
        message: this.translate.instant('addInstagram.validation.required'),
        duration: 1600,
        color: 'danger'
      });
      await t.present();
      return;
    }

    if (/\s/.test(trimmed) || trimmed.length > 30) {
      const t = await this.toastCtrl.create({
        message: this.translate.instant('addInstagram.validation.invalid'),
        duration: 1600,
        color: 'danger'
      });
      await t.present();
      return;
    }

    const profileUrl = `https://instagram.com/${trimmed}`;

    const loading = await this.loadingCtrl.create({
      message: this.translate.instant('addInstagram.saving'),
      backdropDismiss: false
    });
    await loading.present();

    try {
      const userId = Number(this.authService.authData?.userId || 0);
      if (!userId) throw new Error('User ID not found');

      // 1 = Instagram (social_media_id)
      await this.apiService.updateSocialMedia(userId, 1, profileUrl).toPromise();

      await loading.dismiss();
      const t = await this.toastCtrl.create({
        message: this.translate.instant('addInstagram.toast.saved'),
        duration: 1500,
        color: 'success'
      });
      await t.present();

      this.navCtrl.back();
    } catch (err) {
      console.error('Failed to save Instagram', err);
      await loading.dismiss();
      const t = await this.toastCtrl.create({
        message: this.translate.instant('addInstagram.toast.saveFailed'),
        duration: 2000,
        color: 'danger'
      });
      await t.present();
    }
  }

  cancel() {
    this.navCtrl.back();
  }
}
