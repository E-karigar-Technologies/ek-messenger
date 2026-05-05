import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule, ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { ApiService } from 'src/app/services/api/api.service';
import { AuthService } from 'src/app/auth/auth.service';
import { SecureStorageService } from 'src/app/services/secure-storage/secure-storage.service';

@Component({
  selector: 'app-update-username',
  templateUrl: './update-username.page.html',
  styleUrls: ['./update-username.page.scss'],
  standalone: true,
  imports: [IonicModule, FormsModule, CommonModule],
})
export class UpdateUsernamePage implements OnInit {
  name: string = '';
  userId: string | number = '';

  constructor(
    private service: ApiService,
    private toastCtrl: ToastController,
    private router: Router,
    private authservice: AuthService,
    private secureStorage: SecureStorageService,
    private authService : AuthService
  ) {}

  ngOnInit() {
    this.userId = this.authservice.authData?.userId || '';
    this.name = this.authservice.authData?.name || '';
  }

  async ionViewWillEnter(){
    this.userId = this.authservice.authData?.userId || '';
    this.name = this.authservice.authData?.name || '';
  }

  async saveName() {
    const updatedName = (this.name || '').trim();
    if (!updatedName) {
      const t = await this.toastCtrl.create({
        message: 'Please enter a valid name',
        color: 'danger',
        duration: 1800
      });
      await t.present();
      return;
    }

    if (!this.userId) {
      const t = await this.toastCtrl.create({
        message: 'User not available',
        color: 'danger',
        duration: 1800
      });
      await t.present();
      return;
    }

    try {
      // //console.log("trimmed", trimmed);
      await firstValueFrom(this.service.updateUserName(this.userId as any, updatedName));

      // Update local auth data immediately so UI reflects the new name
      if (this.authservice && this.authservice.authData) {
        this.authservice.authData.name = updatedName;
      }
      await this.authService.updateUserName(updatedName);

      // Optionally persist to secure storage so it's available across app restarts
      try {
        await this.secureStorage.setItem('user_name', updatedName);
      } catch (err) {
        // ignore persistence failures but log
        console.warn('Could not persist user name to secure storage', err);
      }

      const toast = await this.toastCtrl.create({
        message: 'Name updated successfully!',
        color: 'success',
        duration: 1500
      });
      await toast.present();

      this.router.navigate(['/setting-profile']);

    } catch (error) {
      console.error('Failed to update name', error);
      const toast = await this.toastCtrl.create({
        message: 'Failed to update name. Please try again.',
        color: 'danger',
        duration: 2000
      });
      await toast.present();
    }
  }
}
