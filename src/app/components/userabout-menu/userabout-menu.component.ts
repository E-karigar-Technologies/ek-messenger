import { Component, Input } from '@angular/core';
import {
  IonicModule,
  PopoverController,
  AlertController,
} from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { getDatabase, ref, set } from 'firebase/database';
import { Router } from '@angular/router';
import { NetworkService } from 'src/app/services/network-connection/network.service';

export interface GroupMeta {
  title: string;
  description: string;
  createdBy: string;
  createdAt: string;
}

@Component({
  selector: 'app-userabout-menu',
  standalone: true,
  imports: [IonicModule, CommonModule],
  templateUrl: './userabout-menu.component.html',
  styleUrls: ['./userabout-menu.component.scss'],
})
export class UseraboutMenuComponent {
  @Input() chatType: 'private' | 'group' = 'private';
  @Input() groupId: string = '';
  @Input() isCurrentUserMember: boolean = true;
  @Input() groupMeta: GroupMeta | null = null;
  @Input() canAddMembers: boolean = true;
  @Input() canEditGroupSettings: boolean = true;
  @Input() receiver_phone: string = '';
  @Input() chatTitle: string = '';

  isOffline = false;
  editContact = false;

  constructor(
    private popoverCtrl: PopoverController,
    private router: Router,
    private alertCtrl: AlertController,
    private networkService: NetworkService
  ) {}

  ngOnInit() {
    console.log('📦 Received group meta in menu:', this.groupMeta);

    // ✅ Check network status
    this.isOffline = !this.networkService.isOnline.value;
    console.log(
      `📡 Menu Network Status: ${this.isOffline ? 'OFFLINE 🔴' : 'ONLINE 🟢'}`
    );
  }

  close() {
    this.popoverCtrl.dismiss();
  }

  async onOptionClick(option: string) {
    // ✅ Check if offline FIRST (before member checks)
    if (option === 'addMembers' || option === 'changeGroupName') {
      if (!(await this.checkNetworkBeforeAction(option))) {
        return;
      }
    }

    if (!this.isCurrentUserMember && option !== 'changeGroupName') {
      await this.showNotMemberAlert();
      return;
    }

    if (!this.isCurrentUserMember && option === 'changeGroupName') {
      await this.showCannotChangeNameAlert();
      return;
    }

    // Normal flow for members
    if (option === 'addMembers') {
      await this.addMembersToGroup();
    } else if (option === 'changeGroupName') {
      await this.navigateToChangeGroupName();
    } else if (option === 'edit') {
      this.editContact = true;
      this.popoverCtrl.dismiss();
      this.router.navigate(['/add-contact'], {
        queryParams: { editContact: this.editContact ,receiver_phone:this.receiver_phone,chatTitle:this.chatTitle},
      });
      // this.router.navigate(['/add-contact']);
      //   console.log(this.receiver_phone);
      //   console.log(this.chatTitle);

      // console.log("inside edit option");
    }
    else {
      this.popoverCtrl.dismiss({ action: option });
    }
  }

  private async checkNetworkBeforeAction(
    action: 'addMembers' | 'changeGroupName'
  ): Promise<boolean> {
    const currentStatus = this.networkService.isOnline.value;

    this.isOffline = !currentStatus;

    console.log(
      `🔍 Menu network check for "${action}": ${
        currentStatus ? 'ONLINE' : 'OFFLINE'
      }`
    );

    if (!currentStatus) {
      await this.showOfflineAlert(action);
      return false;
    }

    return true;
  }

  private async showOfflineAlert(action: 'addMembers' | 'changeGroupName') {
    const messages: Record<typeof action, string> = {
      addMembers:
        'You are offline. Please connect to the internet to add members.',
      changeGroupName:
        'You are offline. Please connect to the internet to change the group name.',
    };

    const alert = await this.alertCtrl.create({
      header: "You're Offline",
      message:
        messages[action] ||
        'You are offline. Please connect to the internet to continue.',
      buttons: [
        {
          text: 'OK',
          role: 'cancel',
        },
      ],
    });

    await alert.present();
  }

  async showNotMemberAlert() {
    const alert = await this.alertCtrl.create({
      header: 'Not a Member',
      message:
        'You cannot perform this action because you are not a member of this group.',
      buttons: ['OK'],
    });
    await alert.present();
  }

  async showCannotChangeNameAlert() {
    const alert = await this.alertCtrl.create({
      header: 'Cannot Change Group Name',
      message:
        'You cannot change group name because you are not a member of this group.',
      buttons: ['OK'],
    });
    await alert.present();
  }

  async addMembersToGroup() {
    if (!this.canAddMembers) {
      await this.popoverCtrl.dismiss();
      const alert = await this.alertCtrl.create({
        header: 'Permission Denied',
        message: 'Only admins can add members to this group.',
        buttons: ['OK'],
      });
      await alert.present();
      return;
    }

    this.popoverCtrl.dismiss();
    this.router.navigate(['/add-members'], {
      queryParams: {
        groupId: this.groupId,
        action: 'add-member',
      },
    });
  }

  async navigateToChangeGroupName() {
    if (!this.canEditGroupSettings) {
      await this.popoverCtrl.dismiss();
      const alert = await this.alertCtrl.create({
        header: 'Permission Denied',
        message: 'Only admins can change the group name.',
        buttons: ['OK'],
      });
      await alert.present();
      return;
    }

    await this.popoverCtrl.dismiss();
    this.router.navigate(['/change-group-name'], {
      queryParams: { groupId: this.groupId },
    });
  }
}
