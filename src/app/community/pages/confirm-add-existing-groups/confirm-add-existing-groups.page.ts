import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, NavController, ToastController } from '@ionic/angular';
import { FormsModule } from '@angular/forms'; // ← ADD
import { Router } from '@angular/router';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { AuthService } from 'src/app/auth/auth.service';
import { GroupPermissions } from 'src/app/pages/group-permissions/group-permissions.page'; // ← ADD

@Component({
  selector: 'app-confirm-add-existing-groups',
  templateUrl: './confirm-add-existing-groups.page.html',
  styleUrls: ['./confirm-add-existing-groups.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule], // ← FormsModule ADD
})
export class ConfirmAddExistingGroupsPage implements OnInit {
  communityId: string | null = null;
  communityName: string | null = null;
  userId: string | null = null;
  groups: any[] = [];

  loading = false;
  adding = false;
  showVisibilityModal = false;
  activeGroupForVisibility: any = null;

  // ── Group Permissions (create-new-group jaisi same pattern) ──
  showPermissionsSheet = false;

  groupPermissions: GroupPermissions = {
    editGroupSettings: true,
    sendMessages: true,
    addMembers: true,
    inviteViaLink: false,
    approveNewMembers: false,
  };

  // Per-group permissions map (groupId → GroupPermissions)
  groupPermissionsMap: Map<string, GroupPermissions> = new Map();

  // Currently selected group for permissions sheet
  activeGroupForPermissions: any = null;

  constructor(
    private router: Router,
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private firebaseService: FirebaseChatService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.userId = this.authService?.authData?.userId ?? null;

    const navState: any = this.router.getCurrentNavigation()?.extras?.state;
    const histState: any = window.history.state;

    this.communityId = navState?.communityId || histState?.communityId || null;
    this.communityName =
      navState?.communityName || histState?.communityName || null;
    this.groups =
      navState?.groups ||
      histState?.groups ||
      navState?.selected ||
      histState?.selected ||
      [];

    // Har group ke liye default permissions initialize karo
    this.groups.forEach((g) => {
      this.groupPermissionsMap.set(g.id, {
        editGroupSettings: true,
        sendMessages: true,
        addMembers: true,
        inviteViaLink: false,
        approveNewMembers: false,
      });
    });

    if (!this.groups || this.groups.length === 0) {
      console.warn('⚠️ No groups passed to confirm page');
    }
  }

  // ── Permissions Sheet Methods ─────────────────────────────────────────────

  openPermissionsSheet(group: any) {
    this.activeGroupForPermissions = group;
    // Is group ki existing permissions load karo (ya default)
    const existing = this.groupPermissionsMap.get(group.id);
    this.groupPermissions = existing
      ? { ...existing }
      : {
          editGroupSettings: true,
          sendMessages: true,
          addMembers: true,
          inviteViaLink: false,
          approveNewMembers: false,
        };
    this.showPermissionsSheet = true;
  }

  closePermissionsSheet() {
    this.showPermissionsSheet = false;
    this.activeGroupForPermissions = null;
  }

  // ── Group Visibility Modal ────────────────────────────────────────────────

  openVisibilityModal(group: any) {
    this.activeGroupForVisibility = group;
    this.showVisibilityModal = true;
  }

  closeVisibilityModal() {
    this.showVisibilityModal = false;
    this.activeGroupForVisibility = null;
  }

  selectVisibility(value: 'Visible' | 'Hidden') {
    if (this.activeGroupForVisibility) {
      this.activeGroupForVisibility.visibility = value;
      // permissionsSummary bhi update karo agar chahiye
    }
    this.closeVisibilityModal();
  }

  onLearnMoreVisibility() {
    // optional — toast ya kuch nahi
  }

  savePermissions() {
    if (this.activeGroupForPermissions) {
      this.groupPermissionsMap.set(this.activeGroupForPermissions.id, {
        ...this.groupPermissions,
      });
      const idx = this.groups.findIndex(
        (g) => g.id === this.activeGroupForPermissions.id
      );
      if (idx >= 0) {
        this.groups[idx].permissionsSummary = this.getPermissionsLabel(
          this.groupPermissions
        );
      }
    }
    this.closePermissionsSheet();
  }

  getPermissionsLabel(perms: GroupPermissions): string {
    const active: string[] = [];
    if (perms.sendMessages) active.push('Send messages');
    if (perms.addMembers) active.push('Add members');
    if (perms.editGroupSettings) active.push('Edit settings');
    if (perms.inviteViaLink) active.push('Invite via link');

    if (active.length === 0) return 'Admins only';
    if (active.length === 1) return `Members can: ${active[0]}`;
    if (active.length === 4) return 'All permissions enabled';
    return `${active.length} permissions enabled`;
  }

  // ── Add to Community ──────────────────────────────────────────────────────

  async addToCommunity() {
  if (!this.communityId) {
    const t = await this.toastCtrl.create({ message: 'Community ID missing', duration: 2000, color: 'danger' });
    await t.present();
    return;
  }

  const groupIds = this.groups.map((g) => g.id).filter(Boolean);
  if (!groupIds.length) {
    const t = await this.toastCtrl.create({ message: 'No groups to add', duration: 1500 });
    await t.present();
    return;
  }

  this.adding = true;

  try {
    // ── Check community settings ──
    let needsApproval = false;
    try {
      const communitySnap = await this.firebaseService.getCommunityDetails(this.communityId);
      const settings = communitySnap?.settings || {};
      const whoCanAddGroups = settings.whoCanAddGroups || 'everyone';
      const isAdmin = (communitySnap?.adminIds || []).includes(this.userId || '');
      const isOwner = communitySnap?.ownerId === this.userId || communitySnap?.createdBy === this.userId;
      needsApproval = whoCanAddGroups === 'only_admins' && !isAdmin && !isOwner;
    } catch (e) {
      console.warn('Settings check failed:', e);
    }

    if (needsApproval) {
      // Har group ke liye suggestion save karo
      const senderName = this.authService?.authData?.name || '';
      for (const group of this.groups) {
        await this.firebaseService.savePendingGroupSuggestion(this.communityId, {
          groupName: group.name || group.title,
          suggestedBy: this.userId || '',
          suggestedByName: senderName,
          type: 'existing',
          existingGroupId: group.id,
          avatar: group.avatar || '',
          membersCount: group.membersCount || 0,
        });
      }

      const toast = await this.toastCtrl.create({
        message: `${this.groups.length} group${this.groups.length > 1 ? 's' : ''} sent for admin approval!`,
        duration: 3000,
        color: 'success',
      });
      await toast.present();
      this.navCtrl.navigateBack('/home-screen');
    } else {
      // Direct add — existing flow
      for (const groupId of groupIds) {
        const perms = this.groupPermissionsMap.get(groupId);
        if (perms) {
          try { await this.firebaseService.saveGroupPermissions(groupId, perms); } catch (e) {}
        }
        const group = this.groups.find((g) => g.id === groupId);
        try { await this.firebaseService.saveGroupVisibility(groupId, group?.visibility || 'Visible'); } catch (e) {}
      }

      let backendCommunityId: string | null = null;
      try { backendCommunityId = await this.firebaseService.getBackendCommunityId(this.communityId); } catch (e) {}

      const result = await this.firebaseService.addGroupsToCommunity({
        communityId: this.communityId,
        groupIds,
        backendCommunityId,
        currentUserId: this.userId || undefined,
      });

      if (result.success) {
        const toast = await this.toastCtrl.create({
          message: result.message || 'Groups added successfully!',
          duration: 2500,
          color: 'success',
        });
        await toast.present();
        this.navCtrl.navigateBack('/home-screen');
      } else {
        throw new Error(result.message || 'Failed to add groups');
      }
    }
  } catch (err: any) {
    console.error('addToCommunity failed:', err);
    const t = await this.toastCtrl.create({
      message: `Failed: ${err?.message || String(err)}`,
      duration: 4000,
      color: 'danger',
    });
    await t.present();
  } finally {
    this.adding = false;
  }
}

  cancel() {
    this.navCtrl.back();
  }
}
