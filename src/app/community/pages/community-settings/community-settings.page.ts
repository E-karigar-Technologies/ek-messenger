import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonicModule,
  NavController,
  ToastController,
  LoadingController,
} from '@ionic/angular';
import { ActivatedRoute } from '@angular/router';
import { getDatabase, ref, get, update } from 'firebase/database';
import { AuthService } from 'src/app/auth/auth.service';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';

@Component({
  selector: 'app-community-settings',
  templateUrl: './community-settings.page.html',
  styleUrls: ['./community-settings.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class CommunitySettingsPage implements OnInit {
  communityId: string = '';
  community: any = null;

  // Current permission values
  whoCanAddMembers: 'everyone' | 'only_admins' = 'only_admins';
  whoCanAddGroups: 'everyone' | 'only_admins' = 'everyone';

  // Modal visibility
  showAddMembersModal = false;
  showAddGroupsModal = false;

  // Temp selections (used while modal is open)
  tempAddMembers: 'everyone' | 'only_admins' = 'only_admins';
  tempAddGroups: 'everyone' | 'only_admins' = 'everyone';

  constructor(
    private route: ActivatedRoute,
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private authService: AuthService,
    private firebaseChatService: FirebaseChatService
  ) {}

  ngOnInit() {
    this.communityId =
      this.route.snapshot.queryParamMap.get('communityId') || '';
    this.loadSettings();
  }

  async loadSettings() {
    if (!this.communityId) return;
    try {
      const db = getDatabase();
      const snap = await get(ref(db, `communities/${this.communityId}`));
      if (snap.exists()) {
        this.community = snap.val();
        const settings = this.community?.settings || {};
        this.whoCanAddMembers = settings.whoCanAddMembers || 'only_admins';
        this.whoCanAddGroups = settings.whoCanAddGroups || 'everyone';
      }
    } catch (err) {
      console.error('loadSettings error', err);
    }
  }

  // ── WHO CAN ADD MEMBERS modal ────────────────────────────
  openAddMembersModal() {
    this.tempAddMembers = this.whoCanAddMembers;
    this.showAddMembersModal = true;
  }

  closeAddMembersModal() {
    this.showAddMembersModal = false;
  }

  async saveAddMembers() {
    this.whoCanAddMembers = this.tempAddMembers;
    this.showAddMembersModal = false;
    await this.persistSettings();
  }

  // ── WHO CAN ADD GROUPS modal ─────────────────────────────
  openAddGroupsModal() {
    this.tempAddGroups = this.whoCanAddGroups;
    this.showAddGroupsModal = true;
  }

  closeAddGroupsModal() {
    this.showAddGroupsModal = false;
  }

  async saveAddGroups() {
    this.whoCanAddGroups = this.tempAddGroups;
    this.showAddGroupsModal = false;
    await this.persistSettings();
  }

  // ── Save to Firebase ─────────────────────────────────────
  private async persistSettings() {
    if (!this.communityId) return;
    const loading = await this.loadingCtrl.create({ message: 'Saving...' });
    await loading.present();
    try {
      // ✅ SECURE UPDATE: Use socket proxy to update community settings
      await this.firebaseChatService.applySecuredBatchUpdates({
        [`communities/${this.communityId}/settings`]: {
          whoCanAddMembers: this.whoCanAddMembers,
          whoCanAddGroups: this.whoCanAddGroups,
        },
      });
      const toast = await this.toastCtrl.create({
        message: 'Settings saved',
        duration: 1800,
        color: 'success',
      });
      await toast.present();
    } catch (err) {
      console.error('persistSettings error', err);
      const toast = await this.toastCtrl.create({
        message: 'Failed to save settings',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    } finally {
      await loading.dismiss();
    }
  }

  // ── Helpers ──────────────────────────────────────────────
  get addMembersLabel(): string {
    return this.whoCanAddMembers === 'everyone' ? 'Everyone' : 'Only admins';
  }

  get addGroupsLabel(): string {
    return this.whoCanAddGroups === 'everyone' ? 'Everyone' : 'Only community admins';
  }

  back() {
    this.navCtrl.back();
  }
}