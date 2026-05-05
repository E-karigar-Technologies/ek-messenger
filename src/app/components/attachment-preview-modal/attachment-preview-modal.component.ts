// import { CommonModule } from '@angular/common';
// import { Component, Input } from '@angular/core';
// import { IonicModule, ModalController } from '@ionic/angular';

// @Component({
//   selector: 'app-attachment-preview-modal',
//   templateUrl: './attachment-preview-modal.component.html',
//   styleUrls: ['./attachment-preview-modal.component.scss'],
//   standalone: true,
//   imports: [CommonModule, IonicModule],
// })
// export class AttachmentPreviewModalComponent {
//   @Input() attachment: any;

//   showUI: boolean = true;

//   constructor(private modalCtrl: ModalController) {}

//   closeModal() {
//     this.modalCtrl.dismiss();
//   }

//   toggleUI() {
//     this.showUI = !this.showUI;
//   }

// }


import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { SecureStorageService } from 'src/app/services/secure-storage/secure-storage.service';

@Component({
  selector: 'app-attachment-preview-modal',
  templateUrl: './attachment-preview-modal.component.html',
  styleUrls: ['./attachment-preview-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class AttachmentPreviewModalComponent {
  @Input() attachment: any;
  @Input() message: any;

  showUI: boolean = true;
  receiver_name: string = '';

  constructor(
    private modalCtrl: ModalController,
    private secureStorage: SecureStorageService
  ) {}

  async ngOnInit() {
    this.receiver_name = (await this.secureStorage.getItem('receiver_name')) || '';
  }

  closeModal() {
    this.modalCtrl.dismiss();
  }

  toggleUI() {
    this.showUI = !this.showUI;
  }

 
  onReply() {
    this.modalCtrl.dismiss({
      action: 'reply',
      message: this.message
    });
  }
}