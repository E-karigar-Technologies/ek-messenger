import { Component, OnInit } from '@angular/core';
import { IonicModule, ModalController, LoadingController, ToastController, ActionSheetController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { ChannelService, ChannelDetails, Category, Region } from '../../services/channel';
import { Camera, CameraSource, CameraResultType } from '@capacitor/camera';

@Component({
  selector: 'app-edit-channel-modal',
  templateUrl: './edit-channel-modal.component.html',
  styleUrls: ['./edit-channel-modal.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class EditChannelModalComponent implements OnInit {
  channel!: ChannelDetails;
  
  // Form fields
  channel_name = '';
  description = '';
  category_id?: number | null = null;
  region_id?: number | null = null;
  
  // Image handling
  selectedFile?: File | null = null;
  previewUrl?: string | null = null;
  originalDpUrl?: string | null = null;

  // Metadata
  categories: Category[] = [];
  regions: Region[] = [];

  loading = false;

  constructor(
    private modalCtrl: ModalController,
    private channelService: ChannelService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private actionSheetCtrl: ActionSheetController
  ) {}

  ngOnInit(): void {
    // Initialize form with current channel data
    if (this.channel) {
      this.channel_name = this.channel.channel_name || '';
      this.description = this.channel.description || '';
      this.category_id = (this.channel as any).category_id ?? null;
      this.region_id = (this.channel as any).region_id ?? null;
      this.originalDpUrl = this.channel.channel_dp;
      this.previewUrl = this.channel.channel_dp || null;
    }

    this.loadMetadata();
  }

  /**
   * Load categories and regions for dropdowns
   */
  private loadMetadata() {
    this.channelService.getAllCategories().subscribe({
      next: (res) => this.categories = res?.categories || [],
      error: () => this.categories = []
    });

    this.channelService.getAllRegions().subscribe({
      next: (res) => this.regions = res?.regions || [],
      error: () => this.regions = []
    });
  }

  dismiss(result?: any) {
    this.modalCtrl.dismiss(result);
  }

  async presentToast(message: string, duration = 2000) {
    const t = await this.toastCtrl.create({ message, duration, position: 'bottom' });
    await t.present();
  }

  /**
   * Show action sheet for image selection (Camera or Gallery)
   */
  async selectImageSource() {
    const actionSheet = await this.actionSheetCtrl.create({
      header: 'Select Image Source',
      buttons: [
        {
          text: 'Camera',
          icon: 'camera-outline',
          handler: () => {
            this.selectImageFromCamera();
          }
        },
        {  
          text: 'Gallery',
          icon: 'images-outline',
          handler: () => {
            this.selectImageFromGallery();
          }
        },
        {
          text: 'Remove Photo',
          icon: 'trash-outline',
          role: 'destructive',
          handler: () => {
            this.removeImage();
          }
        },
        {
          text: 'Cancel',
          icon: 'close',
          role: 'cancel'
        }
      ]
    });

    await actionSheet.present();
  }

  /**
   * Select image from camera
   */
  private async selectImageFromCamera() {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        width: 1000,
        height: 1000
      });

      if (image.dataUrl) {
        // Convert data URL to File
        const response = await fetch(image.dataUrl);
        const blob = await response.blob();
        const file = new File([blob], `channel_dp_${Date.now()}.jpg`, { type: 'image/jpeg' });
        
        this.selectedFile = file;
        this.previewUrl = image.dataUrl;
      }
    } catch (error: any) {
      if (error.message && !error.message.includes('cancel')) {
        this.presentToast('Failed to capture photo', 2000);
      }
    }
  }

  /**
   * Select image from gallery
   */
  private async selectImageFromGallery() {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos,
        width: 1000,
        height: 1000
      });

      if (image.dataUrl) {
        // Convert data URL to File
        const response = await fetch(image.dataUrl);
        const blob = await response.blob();
        const file = new File([blob], `channel_dp_${Date.now()}.jpg`, { type: 'image/jpeg' });
        
        this.selectedFile = file;
        this.previewUrl = image.dataUrl;
      }
    } catch (error: any) {
      if (error.message && !error.message.includes('cancel')) {
        this.presentToast('Failed to select image', 2000);
      }
    }
  }

  /**
   * Remove selected image
   */
  private removeImage() {
    this.selectedFile = null;
    this.previewUrl = this.originalDpUrl || null;
  }

  /**
   * Handle file input (fallback for web)
   */
  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      const reader = new FileReader();
      reader.onload = () => {
        this.previewUrl = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  async saveChanges() {
    const name = (this.channel_name || '').trim();
    const desc = (this.description || '').trim();

    if (!name) {
      await this.presentToast('Channel name is required');
      return;
    }

    if (!desc) {
      await this.presentToast('Description is required');
      return;
    }

    this.loading = true;

    const loader = await this.loadingCtrl.create({
      message: 'Saving changes...'
    });
    await loader.present();

    try {
      const form = new FormData();
      form.append('channel_name', name);
      form.append('description', desc);

       // Optional: category & region
      if (this.category_id != null) {
        form.append('category_id', String(this.category_id));
      }

      if (this.region_id != null) {
        form.append('region_id', String(this.region_id));
      }

      // Only append image if a new one was selected
      if (this.selectedFile) {
        form.append('channel_dp', this.selectedFile, this.selectedFile.name);
      }

      this.channelService.updateChannel(this.channel.channel_id, form)
        .pipe(finalize(() => loader.dismiss()))
        .subscribe({
          next: async (res) => {
            this.loading = false;
            await this.presentToast('Channel updated successfully!');
            this.dismiss({ updated: true, channel: res.channel || res });
          },
          error: async (err) => {
            this.loading = false;
            console.error('Update error:', err);
            await this.presentToast(err?.error?.message || 'Failed to update channel');
          }
        });
    } catch (err) {
      this.loading = false;
      loader.dismiss();
      console.error(err);
      await this.presentToast('Unexpected error occurred');
    }
  }
}
