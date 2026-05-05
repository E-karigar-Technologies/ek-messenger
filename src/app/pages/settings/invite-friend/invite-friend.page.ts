import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { Share } from '@capacitor/share';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FirebaseChatService } from '../../../services/firebase-chat.service';
import { ContactSyncService } from '../../../services/contact-sync.service';
import { AuthService } from '../../../auth/auth.service';

interface NonPlatformContact {
  username: string;
  phoneNumber: string;
}

@Component({
  selector: 'app-invite-friend',
  templateUrl: './invite-friend.page.html',
  styleUrls: ['./invite-friend.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule],
})
export class InviteFriendPage implements OnInit {
  // All non-platform contacts (source list)
  nonPlatformContacts: NonPlatformContact[] = [];

  // Filtered list shown in UI
  filteredContacts: NonPlatformContact[] = [];

  isLoading = true;
  searchTerm = '';
  showSearchBar = false;

  private searchDebounce: any = null;

  constructor(
    private toastCtrl: ToastController,
    private translate: TranslateService,
    private firebaseChatService: FirebaseChatService,
    private contactSyncService: ContactSyncService,
    private authService: AuthService,
  ) {}

  ngOnInit() {
    this.loadNonPlatformContacts();
  }

  // ── Data Loading ───────────────────────────────────────────────────────────

  async loadNonPlatformContacts(): Promise<void> {
    this.isLoading = true;

    try {
      // Step 1: PouchDB-first (in-memory BehaviorSubject → PouchDB fallback → device contacts)
      const cached = await this.firebaseChatService.getResolvedNonPlatformUsers();
      console.log('🔍 [InviteFriend] nonPlatformUsers (PouchDB-first):', cached.length);

      if (cached.length > 0) {
        this.nonPlatformContacts = cached.map((u) => ({
          username: u.username || u.phoneNumber || 'Unknown',
          phoneNumber: u.phoneNumber || '',
        }));
      } else {
        // Step 2: Fallback — compute directly from device contacts
        // (fires when PouchDB is empty, e.g. first launch before
        //  syncPlatformUsersInBackground has run)
        console.log('🔍 [InviteFriend] PouchDB empty, computing from device contacts...');

        const pfUsers = await this.firebaseChatService.getResolvedPlatformUsers();
        let deviceContacts = this.firebaseChatService.currentDeviceContacts || [];

        if (deviceContacts.length === 0) {
          try {
            deviceContacts = await this.contactSyncService.getDevicePhoneNumbers();
          } catch (e) {
            console.warn('[InviteFriend] Direct device contact fetch failed:', e);
          }
        }

        // Build set of phones already on platform
        const pfUserPhoneLast10 = new Set<string>();
        pfUsers.forEach((pu: any) => {
          const phone = String(pu.phoneNumber || '').replace(/\D/g, '').slice(-10);
          if (phone.length === 10) pfUserPhoneLast10.add(phone);

          if (pu.device_contact_name) {
            const matched = deviceContacts.find((dc: any) =>
              (dc.username || '').toLowerCase() === (pu.device_contact_name || '').toLowerCase()
            );
            if (matched) {
              const dcPhone = String(matched.phoneNumber || '').replace(/\D/g, '').slice(-10);
              if (dcPhone.length === 10) pfUserPhoneLast10.add(dcPhone);
            }
          }
        });

        const currentUserPhone = String(
          this.authService.authData?.phone_number || ''
        ).replace(/\D/g, '').slice(-10);

        this.nonPlatformContacts = deviceContacts
          .filter((dc: any) => {
            const dcPhone = String(dc.phoneNumber || '').replace(/\D/g, '').slice(-10);
            if (dcPhone.length < 10) return false;
            if (dcPhone === currentUserPhone) return false;
            if (pfUserPhoneLast10.has(dcPhone)) return false;
            return true;
          })
          .map((dc: any) => ({
            username: dc.username || dc.phoneNumber || 'Unknown',
            phoneNumber: dc.phoneNumber || '',
          }));

        console.log('🔍 [InviteFriend] nonPlatformContacts (fallback):', this.nonPlatformContacts.length);
      }

      this.filteredContacts = [...this.nonPlatformContacts];
    } catch (error) {
      console.error('[InviteFriend] Error loading contacts:', error);

      // Last resort: try cache again
      const lastResort = await this.firebaseChatService.getResolvedNonPlatformUsers();
      this.nonPlatformContacts = lastResort.map((u) => ({
        username: u.username || 'Unknown',
        phoneNumber: u.phoneNumber || '',
      }));
      this.filteredContacts = [...this.nonPlatformContacts];
    } finally {
      this.isLoading = false;
    }
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  filterContacts() {
    const term = this.searchTerm.trim().toLowerCase();

    if (!term) {
      this.filteredContacts = [...this.nonPlatformContacts];
      return;
    }

    const isNumeric = /^\d+$/.test(term);

    this.filteredContacts = this.nonPlatformContacts.filter((contact) => {
      const username = (contact.username || '').toLowerCase();
      const cleanPhone = (contact.phoneNumber || '').replace(/\D/g, '');
      if (isNumeric) return cleanPhone.includes(term);
      return username.includes(term) || cleanPhone.includes(term);
    });
  }

  filterContactsWithDebounce() {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.filterContacts(), 300);
  }

  toggleSearch() {
    this.showSearchBar = !this.showSearchBar;
    if (!this.showSearchBar) {
      this.searchTerm = '';
      this.filteredContacts = [...this.nonPlatformContacts];
    }
  }

  // ── Invite Actions ─────────────────────────────────────────────────────────

  /**
   * Share app invite link — same logic as contacts.page.ts inviteContact()
   */
  async inviteContact(contact: NonPlatformContact) {
    try {
      await Share.share({
        title: 'Join me !',
        text: `Hey ${contact.username}! I'm using  to chat. Join me here:`,
        url: 'https://play.google.com/store/apps/details?id=com.ekarigar.ekmessenger',
        dialogTitle: 'Invite to app',
      });
    } catch (error) {
      console.error('Error sharing invite:', error);
      this.showToast('Failed to share invite. Please try again.');
    }
  }

  /**
   * General share link (top-level share button, no specific contact)
   */
  async shareLink() {
    try {
      await Share.share({
        title: this.translate.instant('invite.title'),
        text: this.translate.instant('invite.text'),
        url: 'https://play.google.com/store/apps/details?id=com.ekarigar.ekmessenger',
        dialogTitle: this.translate.instant('invite.dialogTitle'),
      });
    } catch (error) {
      console.error('Error sharing:', error);
      this.showToast(this.translate.instant('invite.errors.shareFailed'));
    }
  }

  searchContacts() {
    this.toggleSearch();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async showToast(msg: string) {
    const toast = await this.toastCtrl.create({
      message: msg,
      duration: 1500,
      position: 'bottom',
    });
    await toast.present();
  }
}