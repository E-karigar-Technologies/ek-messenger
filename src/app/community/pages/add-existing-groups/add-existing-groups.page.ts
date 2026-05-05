import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, NavController, ToastController } from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { AuthService } from 'src/app/auth/auth.service';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from 'src/app/services/api/api.service';

@Component({
  selector: 'app-add-existing-groups',
  templateUrl: './add-existing-groups.page.html',
  styleUrls: ['./add-existing-groups.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule]
})
export class AddExistingGroupsPage implements OnInit {
  communityId: string | null = null;
  userId: string | null = null;
  groups: Array<any> = [];
  loading = false;
  selectedCount = 0;
  totalGroups = 0;
  searchText: string = '';
allGroups: Array<any> = [];
showSearch: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private firebaseService: FirebaseChatService,
    private authService: AuthService,
    private translate: TranslateService,
    private apiService : ApiService
  ) {}

  ngOnInit() {
    this.userId = this.authService?.authData?.userId 
      ? String(this.authService.authData.userId) 
      : null;
      
    this.route.queryParams.subscribe(params => {
      this.communityId = params['communityId'] || params['id'] || null;
      this.loadAdminGroups();
    });
  }

  async loadAdminGroups() {
    if (!this.userId) {
      console.error('No userId available');
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('add_existing_groups_page.toasts.userNotFound') || 'User not found',
        duration: 2000,
        color: 'danger'
      });
      await toast.present();
      return;
    }

    this.loading = true;
    this.groups = [];
    let skippedBecauseCommunity = 0;
    let skippedNotAdmin = 0;

    try {
      const groupIds = await this.firebaseService.getGroupsForUser(this.userId);
      console.log('User groups:', groupIds);

      for (const groupId of groupIds || []) {
        if (typeof groupId !== 'string') continue;

        if (groupId.startsWith('community')) {
          skippedBecauseCommunity++;
          continue;
        }

        const groupData = await this.firebaseService.getGroupInfo(groupId);
        if (!groupData || !groupData.members) continue;

        if (groupData.communityId) {
          skippedBecauseCommunity++;
          continue;
        }

        const groupTitle = groupData.title || groupData.name || '';
        if (groupTitle === 'Announcements' || groupTitle === 'General') {
          skippedBecauseCommunity++;
          continue;
        }

        const isAdmin = await this.isUserAdminOfGroup(groupId, this.userId);
        if (!isAdmin) {
          skippedNotAdmin++;
          continue;
        }

        // Get member preview (first 4 members)
        const memberIds = Object.keys(groupData.members || {});
        const memberNames: string[] = [];

        for (let i = 0; i < Math.min(4, memberIds.length); i++) {
          const memberId = memberIds[i];
          const memberData = groupData.members[memberId];
          memberNames.push(memberData?.username || memberData?.name || memberId);
        }

        const membersPreview = memberNames.join(', ');

        // ── Avatar resolve karo (home page jaisi logic) ──────────────
        let groupAvatar = groupData.avatar || groupData.groupAvatar || '';

        if (!groupAvatar) {
          try {
            const dpResponse = await firstValueFrom(
              this.apiService.getGroupDp(groupId)
            );
            if (dpResponse?.group_dp_url) {
              groupAvatar = dpResponse.group_dp_url;
            }
          } catch (err) {
            console.warn(`Failed to fetch group dp for ${groupId}:`, err);
          }
        }

        this.groups.push({
          id: groupId,
          name: groupData.title || groupData.name || this.translate.instant('add_existing_groups_page.unnamedGroup') || 'Unnamed group',
          title: groupData.title || groupData.name || 'Unnamed group',
          avatar: groupAvatar,
          type: groupData.type || 'group',
          membersCount: memberIds.length,
          membersPreview: membersPreview,
          description: groupData.description || '',
          selected: false,
          raw: groupData
        });
      }

      // this.totalGroups = this.groups.length;
      this.allGroups = [...this.groups];
      this.totalGroups = this.allGroups.length;
      this.reorderGroups();

      console.log(`Loaded ${this.groups.length} admin groups`);
      console.log(`Skipped ${skippedBecauseCommunity} community groups`);
      console.log(`Skipped ${skippedNotAdmin} groups where user is not admin`);

    } catch (err) {
      console.error('loadAdminGroups error:', err);

      const toast = await this.toastCtrl.create({
        message: this.translate.instant('add_existing_groups_page.toasts.loadFailed') || 'Failed to load groups',
        duration: 2000,
        color: 'danger'
      });
      await toast.present();
    } finally {
      this.loading = false;
      this.selectedCount = this.groups.filter(g => g.selected).length;
    }
  }

  /**
   * Check if user is admin of a group
   */
  async isUserAdminOfGroup(groupId: string, userId: string): Promise<boolean> {
    try {
      const adminIds = await this.firebaseService.getGroupAdminIds(groupId);
      return adminIds.includes(String(userId));
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  }

toggleSelect(g: any) {
  const original = this.allGroups.find(ag => ag.id === g.id);
  if (original) original.selected = g.selected = !g.selected;
  else g.selected = !g.selected;
  this.onSelectChange();
}

onSelectChange() {
  this.selectedCount = this.allGroups.filter(g => g.selected).length;
  this.applySearch();
}

reorderGroups() {
  const selected = this.allGroups.filter(g => g.selected);
  const others = this.allGroups.filter(g => !g.selected);
  this.allGroups = [...selected, ...others];
  this.applySearch();
}

applySearch() {
  const q = this.searchText.trim().toLowerCase();
  if (!q) {
    const selected = this.allGroups.filter(g => g.selected);
    const others = this.allGroups.filter(g => !g.selected);
    this.groups = [...selected, ...others];
  } else {
    this.groups = this.allGroups.filter(g =>
      (g.name || '').toLowerCase().includes(q)
    );
  }
}

onSearchChange() {
  this.applySearch();
}

clearSearch() {
  this.searchText = '';
  this.applySearch();
}

get selectedGroups() {
  return this.allGroups.filter(g => g.selected).slice(0, 12);
}

  /**
   * Confirm selection and navigate to confirmation page
   */
  async confirmSelection() {
    const selectedGroups = this.groups.filter(g => g.selected);

    if (!selectedGroups || selectedGroups.length === 0) {
      const toast = await this.toastCtrl.create({
        message: this.translate.instant('add_existing_groups_page.toasts.selectAtLeastOne') || 'Please select at least one group',
        duration: 1500,
        color: 'warning'
      });
      await toast.present();
      return;
    }

    // Get community name
    let communityName = '';
    if (this.communityId) {
      try {
        communityName = await this.firebaseService.getCommunityName(this.communityId);
      } catch (err) {
        console.warn('Failed to get community name:', err);
      }
    }

    this.router.navigate(['/confirm-add-existing-groups'], {
      state: {
        groups: selectedGroups,
        communityId: this.communityId,
        communityName: communityName
      }
    });
  }

  back() {
    this.navCtrl.back();
  }
}