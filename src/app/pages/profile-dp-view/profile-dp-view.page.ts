import { Component, OnInit, OnDestroy } from '@angular/core';
import { IonicModule, NavController, ModalController, LoadingController, ToastController } from '@ionic/angular';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { ApiService } from 'src/app/services/api/api.service';
import { ImageCropperModalComponent } from '../../components/image-cropper-modal/image-cropper-modal.component';
import { Subject, takeUntil } from 'rxjs';
import { CropResult } from 'src/types';
import { get, getDatabase, ref, onValue } from 'firebase/database';
import { AuthService } from 'src/app/auth/auth.service';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';

@Component({
  selector: 'app-profile-dp-view',
  templateUrl: './profile-dp-view.page.html',
  styleUrls: ['./profile-dp-view.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class ProfileDpViewPage implements OnInit, OnDestroy {
  imageUrl: string = 'assets/images/user.jfif';
  isGroup: boolean = false;
  showEditModal: boolean = false;
  isUpdatingImage: boolean = false;

  // Group related properties
  groupId: number | null = null;
  firebaseGroupId: string | null = null;

  // ✅ True if group is a system group (Announcements / General) inside a community
  isSystemCommunityGroup: boolean = false;

  // Constants for validation
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  // Cleanup subject
  private destroy$ = new Subject<void>();

  canEditGroupSettings: boolean = true;
private adminIds: string[] = [];
private _permissionsUnsubscribe: (() => void) | null = null;

  constructor(
    private navCtrl: NavController,
    private route: ActivatedRoute,
    private modalController: ModalController,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private service: ApiService,
    private authService: AuthService,
  private firebaseChatService: FirebaseChatService
  ) {}

  ngOnInit() {
    this.initializePageData();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this._permissionsUnsubscribe) {
    this._permissionsUnsubscribe();
    this._permissionsUnsubscribe = null;
  }
  }

  /**
   * Initialize page data from route parameters
   */
  private initializePageData() {
  try {
    this.imageUrl = this.route.snapshot.queryParamMap.get('image') || this.imageUrl;
    const isGroupParam = this.route.snapshot.queryParamMap.get('isGroup');
    this.isGroup = isGroupParam === 'true';
    this.groupId = this.route.snapshot.queryParamMap.get('groupId')
      ? +this.route.snapshot.queryParamMap.get('groupId')!
      : null;
    this.firebaseGroupId = this.route.snapshot.queryParamMap.get('receiverId');

    if (this.isGroup && this.firebaseGroupId) {
      this.checkIfSystemCommunityGroup(this.firebaseGroupId);
      this.loadGroupPermissionsAndAdmins(this.firebaseGroupId); // ✅ ADD
    }
  } catch (error) {
    console.error('Error initializing page data:', error);
    this.showToast('Failed to load page data', 'danger');
  }
}

private async loadGroupPermissionsAndAdmins(groupId: string): Promise<void> {
  try {
    const db = getDatabase();

    // Load admin IDs once
    const adminSnap = await get(ref(db, `groups/${groupId}/adminIds`));
    if (adminSnap.exists()) {
      const val = adminSnap.val();
      this.adminIds = Array.isArray(val)
        ? val.map(String)
        : Object.values(val).map(String);
    }

    // ✅ Real-time listener for permissions
    const permRef = ref(db, `groups/${groupId}/permissions`);
    const unsubscribe = onValue(permRef, (snapshot) => {
      const data = snapshot.exists() ? snapshot.val() : null;
      const rawEdit = data?.editGroupSettings !== undefined
        ? data.editGroupSettings
        : true;

      const currentUserId = this.authService.authData?.userId || '';
      const isAdmin = this.adminIds.includes(String(currentUserId));

      // Admins always bypass
      this.canEditGroupSettings = isAdmin ? true : rawEdit;

      console.log(`🔄 DP view permissions updated: canEditGroupSettings=${this.canEditGroupSettings}, isAdmin=${isAdmin}`);
    });

    this._permissionsUnsubscribe = unsubscribe;
  } catch (err) {
    console.warn('loadGroupPermissionsAndAdmins error:', err);
    this.canEditGroupSettings = true; // fail open
  }
}

  /**
   * ✅ Check Firebase if this group is a system group (Announcements / General)
   * belonging to a community. If yes, hide the edit pencil icon.
   */
  private async checkIfSystemCommunityGroup(firebaseGroupId: string): Promise<void> {
    try {
      const db = getDatabase();
      const groupSnap = await get(ref(db, `groups/${firebaseGroupId}`));

      if (!groupSnap.exists()) {
        this.isSystemCommunityGroup = false;
        return;
      }

      const groupData = groupSnap.val();

      const belongsToCommunity = !!groupData?.communityId;
      const isSystemTitle =
        groupData?.title === 'Announcements' || groupData?.title === 'General';

      this.isSystemCommunityGroup = belongsToCommunity && isSystemTitle;

      console.log(
        `ℹ️ Group "${groupData?.title}" — communityId: ${groupData?.communityId} — isSystemGroup: ${this.isSystemCommunityGroup}`
      );
    } catch (err) {
      console.error('⚠️ Failed to check system group status:', err);
      // Safe default: allow edit if check fails
      this.isSystemCommunityGroup = false;
    }
  }

  /**
   * Edit profile picture - show modal for groups only (not system groups)
   */
  editProfileDp() {
  if (!this.isGroup) {
    this.showToast('Edit option only available for groups', 'warning');
    return;
  }

  if (this.isSystemCommunityGroup) {
    this.showToast('Cannot edit picture for Announcements or General groups', 'warning');
    return;
  }

  // ✅ ADD THIS BLOCK
  if (!this.canEditGroupSettings) {
    this.showToast('Only admins can change the group picture.', 'warning');
    return;
  }

  if (this.isUpdatingImage) {
    this.showToast('Please wait, image is being updated...', 'warning');
    return;
  }

  this.showEditModal = true;
}

  /**
   * Close the edit modal
   */
  closeEditModal() {
    this.showEditModal = false;
  }

  /**
   * Handle option selection from modal
   */
  async pickOption(option: string) {
    this.closeEditModal();

    switch (option) {
      case 'camera':
        await this.selectImageFromSource(CameraSource.Camera);
        break;

      case 'gallery':
        await this.selectImageFromSource(CameraSource.Photos);
        break;

      case 'emoji':
        await this.showToast('Emoji & Stickers option coming soon!', 'dark');
        break;

      case 'ai-images':
        await this.showToast('AI Images option coming soon!', 'dark');
        break;

      case 'search-web':
        await this.showToast('Search Web option coming soon!', 'dark');
        break;

      default:
        console.warn('Unknown option selected:', option);
        await this.showToast('Unknown option selected', 'warning');
    }
  }

  /**
   * Select image from camera or gallery
   */
  private async selectImageFromSource(source: CameraSource) {
    if (this.isUpdatingImage) {
      await this.showToast('Please wait for current operation to complete', 'warning');
      return;
    }

    try {
      const sourceText = source === CameraSource.Camera ? 'camera' : 'gallery';

      const loading = await this.loadingController.create({
        message: `Opening ${sourceText}...`,
        duration: 5000
      });
      await loading.present();

      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: source,
        width: 1000,
        height: 1000
      });

      await loading.dismiss();

      if (image?.webPath) {
        await this.processSelectedImage(image.webPath);
      } else {
        await this.showToast('No image selected', 'warning');
      }

    } catch (error) {
      console.error('Error selecting image:', error);

      if (error && typeof error === 'object' && 'message' in error) {
        const errorMessage = (error as any).message?.toLowerCase() || '';
        if (errorMessage.includes('cancelled') || errorMessage.includes('cancel')) {
          return;
        }
      }

      await this.showToast('Failed to select image. Please try again.', 'danger');
    }
  }

  /**
   * Process selected image and open cropper modal
   */
  private async processSelectedImage(imagePath: string) {
    try {
      const loading = await this.loadingController.create({
        message: 'Processing image...',
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
      await this.showToast('Error processing image. Please try again.', 'danger');
    }
  }

  /**
   * Validate image blob
   */
  private validateImageBlob(blob: Blob): string | null {
    if (blob.size > this.MAX_FILE_SIZE) {
      return 'Image size should be less than 5MB';
    }

    if (!this.ALLOWED_IMAGE_TYPES.includes(blob.type)) {
      return 'Please select a valid image file (JPEG, PNG, WebP)';
    }

    return null;
  }

  /**
   * Convert blob to data URL
   */
  private blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to convert image'));
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Open image cropper modal
   */
  private async openImageCropper(imageUrl: string, originalBlob: Blob) {
    const modal = await this.modalController.create({
      component: ImageCropperModalComponent,
      componentProps: {
        imageUrl: imageUrl,
        aspectRatio: 1,
        cropQuality: 0.9
      },
      cssClass: 'image-cropper-modal',
      backdropDismiss: false
    });

    await modal.present();

    const { data } = await modal.onDidDismiss<CropResult>();

    if (data?.success && data.croppedImage && data.originalBlob) {
      await this.updateGroupImage(data.originalBlob, data.croppedImage);
    } else if (data?.error) {
      await this.showToast(data.error, 'danger');
    }
  }

  /**
   * Update group image on server
   */
  private async updateGroupImage(croppedBlob: Blob, croppedImageUrl: string) {
    if (!this.firebaseGroupId) {
      await this.showToast('Group information missing', 'danger');
      return;
    }

    try {
      this.isUpdatingImage = true;

      const loading = await this.loadingController.create({
        message: 'Updating group picture...',
        backdropDismiss: false
      });
      await loading.present();

      const file = new File([croppedBlob], `group_dp_${Date.now()}.jpg`, {
        type: croppedBlob.type
      });

      this.service.updateGroupDp(this.groupId, this.firebaseGroupId, file)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: async (response) => {
            this.imageUrl = croppedImageUrl;
            await loading.dismiss();
            await this.showToast('Group picture updated successfully!', 'success');
            this.isUpdatingImage = false;
          },
          error: async (error) => {
            console.error('Error updating group picture:', error);
            await loading.dismiss();

            let errorMessage = 'Failed to update group picture';
            if (error?.error?.message) {
              errorMessage = error.error.message;
            }

            await this.showToast(errorMessage, 'danger');
            this.isUpdatingImage = false;
          }
        });

    } catch (error) {
      console.error('Error in updateGroupImage:', error);
      await this.showToast('Failed to update group picture', 'danger');
      this.isUpdatingImage = false;
    }
  }

  /**
   * Show toast notification
   */
  private async showToast(message: string, color: 'danger' | 'success' | 'warning' | 'dark' = 'dark') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
      buttons: [{ text: 'OK', role: 'cancel' }]
    });
    await toast.present();
  }

  /**
   * Handle image loading error
   */
  onImageError() {
    console.warn('Image failed to load, using fallback');
    this.imageUrl = 'assets/images/user.jfif';
  }

  /**
   * Navigate back to previous page
   */
  closePage() {
    this.navCtrl.back();
  }

  /**
   * Legacy method for backward compatibility
   */
  private dataURLtoFile(dataUrl: string, filename: string): File {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || '';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  }

  // ── Getters for template ──────────────────────────────────────────────────

  /** Pencil icon sirf tab dikhega jab group ho AND system community group NA ho */
  get canEditImage(): boolean {
    return this.isGroup && !this.isSystemCommunityGroup && !this.isUpdatingImage;
  }

  get isImageLoading(): boolean {
    return this.isUpdatingImage;
  }
}