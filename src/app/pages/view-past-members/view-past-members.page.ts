import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonicModule, NavController, ToastController } from '@ionic/angular';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { ChatPouchDb } from 'src/app/services/chat-pouch-db';
import { NetworkService } from 'src/app/services/network-connection/network.service';
import { ApiService } from 'src/app/services/api/api.service';
import { AuthService } from 'src/app/auth/auth.service';

@Component({
  selector: 'app-view-past-members',
  templateUrl: './view-past-members.page.html',
  styleUrls: ['./view-past-members.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class ViewPastMembersPage implements OnInit, OnDestroy {
  groupId: string = '';
  pastMembers: any[] = [];
  isLoading: boolean = false;
  isOffline: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private firebaseChatService: FirebaseChatService,
    private chatPouchDb: ChatPouchDb,
    private networkService: NetworkService,
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private service: ApiService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.groupId = params['groupId'];
      if (this.groupId) {
        console.log('📋 Group ID:', this.groupId);
      }
    });
  }

  async ionViewWillEnter() {
    console.log('📱 ionViewWillEnter - Loading past members...');

    if (!this.groupId) {
      console.warn('❌ No groupId found');
      this.navCtrl.back();
      return;
    }

    await this.loadFromCache();

    this.isOffline = !this.networkService.isOnline.value;
    console.log(`📡 Network status: ${this.isOffline ? 'OFFLINE' : 'ONLINE'}`);

    if (!this.isOffline) {
      this.syncDataInBackground().catch(err =>
        console.warn('Background sync failed:', err)
      );
    } else {
      await this.showToast('Using cached data (offline)', 'warning');
    }
  }

  /**
   * Phone number ko pfUsers aur deviceContacts se match karke device name lo
   */
  private resolveDisplayName(member: any): string {
    const pfUsers = this.firebaseChatService.currentUsers || [];
    const deviceContacts = this.firebaseChatService.currentDeviceContacts || [];
    const currentUserId = this.authService.authData?.userId || '';

    // Current user check
    if (String(member.userId || member.user_id) === String(currentUserId)) {
      return 'You';
    }

    const memberPhone = (member.phoneNumber || member.phone || '').replace(/\D/g, '').slice(-10);

    const matchedByUserId = pfUsers.find((u: any) =>
      String(u.userId) === String(member.userId || member.user_id)
    );
    if (matchedByUserId?.device_contact_name || matchedByUserId?.username) {
      return matchedByUserId.device_contact_name || matchedByUserId.username || '';
    }

    if (memberPhone.length === 10) {
      const matchedByPhone = pfUsers.find((u: any) => {
        const uPhone = (u.phoneNumber || '').replace(/\D/g, '').slice(-10);
        return uPhone === memberPhone;
      });
      if (matchedByPhone?.device_contact_name || matchedByPhone?.username) {
        return matchedByPhone.device_contact_name || matchedByPhone.username || '';
      }

      const matchedDevice = deviceContacts.find((dc: any) => {
        const dcPhone = (dc.phoneNumber || '').replace(/\D/g, '').slice(-10);
        return dcPhone === memberPhone;
      });
      if (matchedDevice?.username) {
        return matchedDevice.username;
      }
    }

    return member.phoneNumber || member.phone || member.username || 'Unknown';
  }

  private async loadFromCache(): Promise<void> {
    try {
      console.log('📦 Loading past members from cache...');
      const startTime = performance.now();

      const cached = await this.chatPouchDb.getCachedPastMembers(this.groupId);

      if (cached && cached.length > 0) {
        this.pastMembers = cached.map((member: any) => ({
          ...member,
          username: this.resolveDisplayName(member),
        }));
        console.log(`✅ Loaded ${cached.length} past members from cache`);
      } else {
        this.pastMembers = [];
        console.log('ℹ️ No cached past members found');
      }

      const loadTime = performance.now() - startTime;
      console.log(`⏱️ Cache load time: ${loadTime.toFixed(2)}ms`);
    } catch (error) {
      console.error('❌ Error loading from cache:', error);
      this.pastMembers = [];
    }
  }

  private async syncDataInBackground(): Promise<void> {
    try {
      console.log('🔄 Starting background sync for past members...');
      this.isLoading = true;

      const freshPastMembers = await this.firebaseChatService.getPastMembers(this.groupId);
      console.log('✅ Fetched past members from Firebase:', freshPastMembers.length);

      // ✅ Device contact name resolve karo
      this.pastMembers = freshPastMembers.map((member: any) => ({
        ...member,
        username: this.resolveDisplayName(member),
      }));

      // Cache original data (without name override, taaki fresh resolve ho sake)
      await this.chatPouchDb.cachePastMembers(this.groupId, freshPastMembers);

      console.log('✅ Past members synced and cached');
    } catch (error) {
      console.error('❌ Background sync failed:', error);
      if (this.pastMembers.length === 0) {
        await this.showToast('Failed to load past members', 'danger');
      }
    } finally {
      this.isLoading = false;
    }
  }

  private async showToast(message: string, color: string = 'primary') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }

  onImageError(event: any) {
    event.target.src = 'assets/images/user.jfif';
  }

  goBack() {
    this.navCtrl.back();
  }

  ngOnDestroy() {
    console.log('🧹 ViewPastMembersPage destroyed');
  }
}