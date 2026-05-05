import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonicModule,
  ModalController,
} from '@ionic/angular';
import {
  StatusContactOption,
  StatusPrivacyMode,
} from '../../models/status.model';

@Component({
  selector: 'app-status-privacy-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './status-privacy-modal.component.html',
  styleUrls: ['./status-privacy-modal.component.scss'],
})
export class StatusPrivacyModalComponent {
  @Input() title = 'Status Privacy';
  @Input() mode: StatusPrivacyMode = 'my_contacts';
  @Input() users: Record<string, true> = {};
  @Input() contacts: StatusContactOption[] = [];
  @Input() onSelectionChange?: (selection: {
    privacyMode: StatusPrivacyMode;
    privacyUsers: Record<string, true>;
  }) => void | Promise<void>;

  selectedMode: StatusPrivacyMode = 'my_contacts';
  selectedUsers = new Set<string>();

  constructor(private modalCtrl: ModalController) {}

  ngOnInit(): void {
    this.selectedMode = this.mode;
    this.selectedUsers = new Set(Object.keys(this.users || {}));
  }

  get showsContactPicker(): boolean {
    return (
      this.selectedMode === 'my_contacts_except' ||
      this.selectedMode === 'only_share_with'
    );
  }

  setMode(mode: StatusPrivacyMode): void {
    this.selectedMode = mode;
    this.emitSelectionChange();
  }

  onContactChange(uid: string, checked: boolean): void {
    if (checked) {
      this.selectedUsers.add(uid);
      this.emitSelectionChange();
      return;
    }
    this.selectedUsers.delete(uid);
    this.emitSelectionChange();
  }

  isSelected(uid: string): boolean {
    return this.selectedUsers.has(uid);
  }

  async dismiss(): Promise<void> {
    await this.modalCtrl.dismiss();
  }

  private emitSelectionChange(): void {
    if (!this.onSelectionChange) {
      return;
    }

    const selected: Record<string, true> = {};
    if (this.showsContactPicker) {
      this.selectedUsers.forEach((uid) => {
        selected[uid] = true;
      });
    }

    void this.onSelectionChange({
      privacyMode: this.selectedMode,
      privacyUsers: selected,
    });
  }

}
