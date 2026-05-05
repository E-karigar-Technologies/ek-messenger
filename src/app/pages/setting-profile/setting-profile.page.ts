import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController, LoadingController, ToastController, ActionSheetController, AlertController } from '@ionic/angular';
import { AuthService } from '../../auth/auth.service';
import { ApiService } from 'src/app/services/api/api.service';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { ImageCropperModalComponent } from '../../components/image-cropper-modal/image-cropper-modal.component';
import { Subject, takeUntil } from 'rxjs';
import { Router } from '@angular/router';
import { CropResult } from 'src/types';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ChatPouchDb } from 'src/app/services/chat-pouch-db'; // ✅ Import
import { NetworkService } from 'src/app/services/network-connection/network.service'; // ✅ Import

@Component({
  selector: 'app-setting-profile',
  templateUrl: './setting-profile.page.html',
  styleUrls: ['./setting-profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, TranslateModule],
})
export class SettingProfilePage implements OnInit, OnDestroy {
  profileImageUrl = 'assets/images/user.jfif';
  isLoadingProfile = false;
  isUpdatingImage = false;
  isOffline = false; // ✅ Track offline status

  user = { name: '', about: '', phone: '' };
  currentUserId: number | null = null;

  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024;
  private readonly ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  private destroy$ = new Subject<void>();

  constructor(
    private authService: AuthService,
    private service: ApiService,
    private modalController: ModalController,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private actionSheetController: ActionSheetController,
    private router: Router,
    private translate: TranslateService,
    private chatPouchDb: ChatPouchDb, // ✅ Inject
    private networkService: NetworkService, // ✅ Inject
    private alertController: AlertController, // ✅ Inject
    private cdr : ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.initializeProfile();
  }

  async ionViewWillEnter() {
    // ✅ Check network status
    this.isOffline = !this.networkService.isOnline.value;
    console.log(`📡 Network Status: ${this.isOffline ? 'OFFLINE 🔴' : 'ONLINE 🟢'}`);

    await this.initializeProfile();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * 🔥 UPDATED: Initialize profile with cache-first approach
   */
  private async initializeProfile() {
    try {
      await this.authService.hydrateAuth();
      const id = this.authService.authData?.userId;
      if (id) this.currentUserId = Number(id);

      if (this.authService.authData) {
        const auth = this.authService.authData;
        this.user = {
          name: auth.name || '',
          about: '.',
          phone: auth.phone_number || ''
        };

        // ✅ Load from cache first (instant)
        await this.loadFromCache();

        // ✅ If online, sync in background
        if (!this.isOffline) {
          await this.loadUserProfile();
        }
      }
    } catch (error) {
      console.error('Error initializing profile:', error);
      await this.showToast(this.translate.instant('profilePage.toast.loadFailed'), 'danger');
    }
  }

  /**
   * 🔥 NEW: Load profile from cache (FAST)
   */
  private async loadFromCache() {
    const userId = this.authService.authData?.userId;
    if (!userId) return;

    try {
      console.log('📦 Loading profile from cache...');
      const startTime = performance.now();

      const cachedProfile = await this.chatPouchDb.getCachedUserProfile(userId);

      if (cachedProfile) {
        this.profileImageUrl = cachedProfile.profile || cachedProfile.avatar || 'assets/images/user.jfif';
        this.user.name = cachedProfile.name || this.user.name;
        this.user.about = cachedProfile.dp_status || this.user.about;

        const loadTime = performance.now() - startTime;
        console.log(`✅ Profile loaded from cache in ${loadTime.toFixed(2)}ms`);
        console.log('📊 Cached profile:', {
          avatar: this.profileImageUrl,
          name: this.user.name,
          status: this.user.about
        });
      } else {
        console.warn('⚠️ No cached profile found');
      }
    } catch (error) {
      console.error('❌ Error loading from cache:', error);
    }
  }

  /**
   * 🔥 UPDATED: Load user profile (with caching)
   */
  async loadUserProfile() {
    const userId = this.authService.authData?.userId;
    if (!userId) return;

    try {
      this.isLoadingProfile = true;

      this.service.getUserProfilebyId(userId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: async (response: any) => {
            if (response?.profile || response?.image_url) {
              this.profileImageUrl = response.profile || response.image_url;
            }
            if (response?.name) this.user.name = response.name;
            if (response?.dp_status) this.user.about = response.dp_status;

            // ✅ Cache the updated profile
            await this.chatPouchDb.cacheUserProfile(userId, {
              profile: this.profileImageUrl,
              avatar: this.profileImageUrl,
              dp_status: this.user.about,
              dp_status_updated_on: response?.dp_status_updated_on || '',
              name: this.user.name,
              phone_number: this.user.phone
            });

            console.log('✅ Profile synced and cached');
            this.isLoadingProfile = false;
          },
          error: async () => {
            this.isLoadingProfile = false;
            
            // ✅ Fallback to cache on error
            await this.loadFromCache();
            
            if (this.isOffline) {
              await this.showToast('Using offline data', 'warning');
            } else {
              await this.showToast(this.translate.instant('profilePage.toast.imageLoadFailed'), 'danger');
            }
          }
        });
    } catch (error) {
      console.error('Error in loadUserProfile:', error);
      this.isLoadingProfile = false;
      
      // ✅ Fallback to cache on exception
      await this.loadFromCache();
    }
  }

  onImageError() {
    this.profileImageUrl = 'assets/images/user.jfif';
  }

  /**
   * 🔥 UPDATED: Edit profile image (with offline check)
   */
  async editProfileImage() {
    // ✅ Check if offline
    if (!(await this.checkNetworkBeforeAction('image'))) {
    return;
  }

    const actionSheet = await this.actionSheetController.create({
      header: this.translate.instant('profilePage.actions.source.header'),
      cssClass: 'custom-action-sheet',
      buttons: [
        {
          text: this.translate.instant('profilePage.actions.source.camera'),
          icon: 'camera',
          handler: () => this.selectImageFromSource(CameraSource.Camera)
        },
        {
          text: this.translate.instant('profilePage.actions.source.gallery'),
          icon: 'images',
          handler: () => this.selectImageFromSource(CameraSource.Photos)
        },
        {
          text: this.translate.instant('profilePage.actions.source.cancel'),
          icon: 'close',
          role: 'cancel'
        }
      ]
    });
    await actionSheet.present();
  }

  /**
   * 🔥 UPDATED: Navigate to update name (with offline check)
   */
  async goToUpdateName() {
    // ✅ Check if offline
    if (!(await this.checkNetworkBeforeAction('name'))) {
    return;
  }

    this.router.navigate(['/update-username']);
  }

  /**
   * 🔥 UPDATED: Navigate to update status (with offline check)
   */
  async goToUpdateStatus() {
    // ✅ Check if offline
    if (!(await this.checkNetworkBeforeAction('status'))) {
    return;
  }

    this.router.navigate(['/update-status']);
  }

  /**
   * 🔥 UPDATED: Add social media links (with offline check)
   */
  async addLinks() {
    // ✅ Check if offline
   if (!(await this.checkNetworkBeforeAction('links'))) {
    return;
  }

    this.router.navigate(['/social-media-links']);
  }

   private async checkNetworkBeforeAction(
 action: 'image' | 'name' | 'status' | 'links'
): Promise<boolean> {
  // 🔥 CRITICAL: Check network status RIGHT NOW (not cached)
  const currentStatus = this.networkService.isOnline.value;
  
  // Update local state immediately
  this.isOffline = !currentStatus;
  this.cdr.detectChanges();
  
  console.log(`🔍 Real-time network check for "${action}": ${currentStatus ? 'ONLINE' : 'OFFLINE'}`);
  
  // If offline, show alert and return false
  if (!currentStatus) {
    await this.showOfflineAlert(action);
    return false;
  }
  
  return true;
}

  /**
   * 🔥 NEW: Show offline alert with custom message (NO JSON NEEDED)
   */
 private async showOfflineAlert(
  action: 'image' | 'name' | 'status' | 'links'
) {
  const messages: Record<typeof action, string> = {
    image:
      'You are offline. Please connect to the internet to update your profile picture.',
    name:
      'You are offline. Please connect to the internet to update your name.',
    status:
      'You are offline. Please connect to the internet to update your status.',
    links:
      'You are offline. Please connect to the internet to add social media links.',
  };

  const alert = await this.alertController.create({
    header: "You're Offline",
    message:
      messages[action] ||
      'You are offline. Please connect to the internet to perform this action.',
    buttons: [
      {
        text: 'OK',
        role: 'cancel',
      },
    ],
  });

  await alert.present();
}


  private async selectImageFromSource(source: CameraSource) {
    try {
      const loading = await this.loadingController.create({
        message: this.translate.instant('profilePage.loading.openingCamera'),
        duration: 5000
      });
      await loading.present();

      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source,
        width: 1000,
        height: 1000
      });

      await loading.dismiss();
      if (image?.webPath) await this.processSelectedImage(image.webPath);
    } catch (error) {
      console.error('Error selecting image:', error);
      await this.showToast(this.translate.instant('profilePage.toast.selectFailed'), 'danger');
    }
  }

  private async processSelectedImage(imagePath: string) {
    try {
      const loading = await this.loadingController.create({
        message: this.translate.instant('profilePage.loading.processing'),
        duration: 10000
      });
      await loading.present();

      const response = await fetch(imagePath);
      const blob = await response.blob();

      await loading.dismiss();

      const validationError = this.validateImageBlob(blob);
      if (validationError) {
        await this.showToast(validationError, 'danger');
        return;
      }

      const dataUrl = await this.blobToDataURL(blob);
      await this.openImageCropper(dataUrl, blob);
    } catch (error) {
      console.error('Error processing image:', error);
      await this.showToast(this.translate.instant('profilePage.toast.processFailed'), 'danger');
    }
  }

  private validateImageBlob(blob: Blob): string | null {
    if (blob.size > this.MAX_FILE_SIZE) {
      return this.translate.instant('profilePage.validation.size');
    }
    if (!this.ALLOWED_IMAGE_TYPES.includes(blob.type)) {
      return this.translate.instant('profilePage.validation.type');
    }
    return null;
  }

  private blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to convert blob to data URL'));
      reader.readAsDataURL(blob);
    });
  }

  private async openImageCropper(imageUrl: string, originalBlob: Blob) {
    const modal = await this.modalController.create({
      component: ImageCropperModalComponent,
      componentProps: {
        imageUrl,
        aspectRatio: 1,
        cropQuality: 0.9
      },
      cssClass: 'image-cropper-modal',
      backdropDismiss: false
    });

    await modal.present();
    const { data } = await modal.onDidDismiss<CropResult>();

    if (data?.success && data.croppedImage && data.originalBlob) {
      await this.updateProfileImage(data.originalBlob, data.croppedImage);
    } else if (data?.error) {
      await this.showToast(data.error, 'danger');
    }
  }

  /**
   * 🔥 UPDATED: Update profile image (with cache update)
   */
  private async updateProfileImage(croppedBlob: Blob, croppedImageUrl: string) {
    if (!this.currentUserId) {
      await this.showToast(this.translate.instant('profilePage.toast.noUser'), 'danger');
      return;
    }

    try {
      this.isUpdatingImage = true;
      const loading = await this.loadingController.create({
        message: this.translate.instant('profilePage.loading.updating'),
        backdropDismiss: false
      });
      await loading.present();

      const file = new File([croppedBlob], `profile_${Date.now()}.jpg`, { type: croppedBlob.type });

      this.service.updateUserDp(this.currentUserId, file)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: async () => {
            this.profileImageUrl = croppedImageUrl;
            
            // ✅ Update cache with new image
            const userId = this.authService.authData?.userId;
            if (userId) {
              const cachedProfile = await this.chatPouchDb.getCachedUserProfile(userId) || {};
              
              await this.chatPouchDb.cacheUserProfile(userId, {
                ...cachedProfile,
                profile: croppedImageUrl,
                avatar: croppedImageUrl
              });
              
              console.log('✅ Updated cache with new profile image');
            }
            
            await loading.dismiss();
            await this.showToast(this.translate.instant('profilePage.toast.updated'), 'success');
            this.isUpdatingImage = false;
          },
          error: async () => {
            await loading.dismiss();
            await this.showToast(this.translate.instant('profilePage.toast.updateFailed'), 'danger');
            this.isUpdatingImage = false;
          }
        });
    } catch (error) {
      console.error('Error in updateProfileImage:', error);
      await this.showToast(this.translate.instant('profilePage.toast.updateFailed'), 'danger');
      this.isUpdatingImage = false;
    }
  }

  private async showToast(message: string, color: 'danger' | 'success' | 'dark' | 'warning' = 'dark') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
      buttons: [{ text: this.translate.instant('common.ok'), role: 'cancel' }]
    });
    await toast.present();
  }

  get displayImageUrl(): string {
    if (this.isLoadingProfile || this.isUpdatingImage) return 'assets/images/user.jfif';
    return this.profileImageUrl;
  }

  get isImageLoading(): boolean {
    return this.isLoadingProfile || this.isUpdatingImage;
  }
}