import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonicModule,
  NavController,
  ToastController,
  LoadingController,
} from '@ionic/angular';
import { ActivatedRoute } from '@angular/router';
import { FirebaseChatService } from '../../services/firebase-chat.service';
import { AuthService } from '../../auth/auth.service';

export interface GroupPermissions {
  editGroupSettings: boolean;
  sendMessages: boolean;
  addMembers: boolean;
  inviteViaLink: boolean;
  approveNewMembers: boolean;
}

@Component({
  selector: 'app-group-permissions',
  templateUrl: './group-permissions.page.html',
  styleUrls: ['./group-permissions.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class GroupPermissionsPage implements OnInit {
  groupId: string = '';
  groupName: string = '';
  isSaving: boolean = false;

  permissions: GroupPermissions = {
    editGroupSettings: true,
    sendMessages: true,
    addMembers: true,
    inviteViaLink: false,
    approveNewMembers: false,
  };

  private originalPermissions: GroupPermissions = { ...this.permissions };

  constructor(
    private route: ActivatedRoute,
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private firebaseChatService: FirebaseChatService,
    private authService: AuthService
  ) {}

  ngOnInit() {}

  async ionViewWillEnter() {
    this.groupId =
      this.route.snapshot.queryParamMap.get('groupId') ||
      this.firebaseChatService.currentChat?.roomId ||
      '';

    const currentChat = this.firebaseChatService.currentChat;
    this.groupName = currentChat?.title || 'Group';

    if (this.groupId) {
      await this.loadPermissions();
    }
  }

  // ── Load via service (no direct db call) ─────────────────────────
  async loadPermissions() {
    try {
      this.permissions = await this.firebaseChatService.getGroupPermissions(
        this.groupId
      );
      this.originalPermissions = { ...this.permissions };
    } catch (err) {
      console.error('Error loading permissions:', err);
      await this.showToast('Failed to load permissions', 'danger');
    }
  }

  onPermissionChange(key: keyof GroupPermissions, event: any) {
    this.permissions[key] = event.detail.checked;
  }

  // ── Save via service (no direct db call) ─────────────────────────
  async savePermissions() {
    if (this.isSaving) return;
    this.isSaving = true;

    try {
      await this.firebaseChatService.saveGroupPermissions(
        this.groupId,
        this.permissions
      );
      this.originalPermissions = { ...this.permissions };
      await this.showToast('Permissions saved successfully', 'success');
      this.goBack();
    } catch (err) {
      console.error('Error saving permissions:', err);
      await this.showToast('Failed to save permissions', 'danger');
    } finally {
      this.isSaving = false;
    }
  }

  goBack() {
    this.navCtrl.back();
  }

  async learnMore() {
    await this.showToast(
      'When enabled, admins must approve new join requests.',
      'primary'
    );
  }

  private async showToast(message: string, color: string = 'primary') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}
