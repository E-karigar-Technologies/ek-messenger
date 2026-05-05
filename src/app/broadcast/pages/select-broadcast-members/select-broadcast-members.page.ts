import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import { IonicModule, IonInput, NavController } from '@ionic/angular';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FirebaseChatService } from '../../../services/firebase-chat.service';
import { AuthService } from '../../../auth/auth.service';
import { ApiService } from '../../../services/api/api.service';
import { BroadcastService } from '../../services/broadcast-service';
import { Share } from '@capacitor/share';

@Component({
  selector: 'app-select-broadcast-members',
  templateUrl: './select-broadcast-members.page.html',
  styleUrls: ['./select-broadcast-members.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class SelectBroadcastMembersPage implements OnInit {
  @ViewChild('searchInput', { static: false }) searchInput!: IonInput;

  allUsers: {
    isOnPlatform: boolean;
    profile: string;
    username: string;
    phoneNumber: string;
    userId: string | null;
    selected?: boolean;
  }[] = [];

  filteredContacts: {
    isOnPlatform: boolean;
    profile: string;
    username: string;
    phoneNumber: string;
    userId: string | null;
    selected?: boolean;
  }[] = [];

  showSearchBar = false;
  searchTerm: string = '';
  isLoading = true;

  nonPlatformContacts: { username: string; phoneNumber: string }[] = [];
  filteredNonPlatformContacts: { username: string; phoneNumber: string }[] = [];

  currentUserPhone: string = '';

  private searchDebounce: any = null;

  constructor(
    private router: Router,
    private firebaseChatService: FirebaseChatService,
    private authService: AuthService,
    private api: ApiService,
    private broadcastService: BroadcastService,
    private navCtrl: NavController,
  ) {}

  ngOnInit() {
    this.currentUserPhone = this.authService.authData?.phone_number ??
      localStorage.getItem('phone_number') ??
      '';

    this.loadDeviceMatchedContacts();
  }

  // ────────────────────────────────────────────
  // Load contacts (same source as ContactsPage)
  // ────────────────────────────────────────────
  async loadDeviceMatchedContacts(): Promise<void> {
    this.allUsers = [];
    this.isLoading = true;

    try {
      const pfUsers = await this.firebaseChatService.getResolvedPlatformUsers();
      const deviceContacts = this.firebaseChatService.currentDeviceContacts || [];

      const mapNameFromDevice = (phone?: string) => {
        if (!phone) return 'Unknown';
        const last10 = String(phone).replace(/\D/g, '').slice(-10);
        if (last10.length === 10) {
          const match = deviceContacts.find((dc: any) => {
            const dcPhone = String(dc.phoneNumber || '').replace(/\D/g, '').slice(-10);
            return dcPhone === last10;
          });
          if (match?.username) return match.username;
        }
        return phone || 'Unknown';
      };

      this.allUsers = pfUsers
        .filter((u: any) => u.isOnPlatform)
        .map(({ phoneNumber, userId, avatar, isOnPlatform, device_contact_name }: any) => {
          const resolvedName =
            device_contact_name || mapNameFromDevice(phoneNumber) || phoneNumber || 'Unknown';
          return {
            userId: userId as string,
            profile: (avatar as string) || '',
            phoneNumber: (phoneNumber as string) || '',
            username: resolvedName,
            isOnPlatform: !!isOnPlatform,
            selected: false,
          };
        });

      this.filteredContacts = [...this.allUsers];

      // Non-platform contacts — PouchDB-first cache
      const nonPlatform = await this.firebaseChatService.getResolvedNonPlatformUsers();
      this.nonPlatformContacts = nonPlatform.map((u: any) => ({
        username: u.username || u.phoneNumber || 'Unknown',
        phoneNumber: u.phoneNumber || '',
      }));
      this.filteredNonPlatformContacts = [...this.nonPlatformContacts];
    } catch (error) {
      console.error('Error loading contacts for broadcast');
    } finally {
      this.isLoading = false;
    }
  }

  // ────────────────────────────────────────────
  // Selection logic
  // ────────────────────────────────────────────

  get selectedContacts() {
    return this.allUsers.filter((u) => u.selected);
  }

  toggleSelect(contact: any) {
    if (this.selectedContacts.length >= 256 && !contact.selected) {
      return;
    }
    contact.selected = !contact.selected;
  }

  removeContact(contact: any) {
    const original = this.allUsers.find((u) => u.userId === contact.userId);
    if (original) original.selected = false;
  }

  // ────────────────────────────────────────────
  // Search logic
  // ────────────────────────────────────────────
  filterContacts() {
    const term = this.searchTerm.trim().toLowerCase();

    if (!term) {
      this.filteredContacts = [...this.allUsers];
      this.filteredNonPlatformContacts = [...this.nonPlatformContacts];
      return;
    }

    const isNumeric = /^\d+$/.test(term);
    const isMixed = /[a-zA-Z]/.test(term) && /\d/.test(term);

    if (isNumeric) {
      this.filteredContacts = this.allUsers.filter((contact) => {
        const cleanPhone = (contact.phoneNumber || '').replace(/\D/g, '');
        return cleanPhone.includes(term);
      });
      this.filteredNonPlatformContacts = this.nonPlatformContacts.filter((contact) => {
        const cleanPhone = (contact.phoneNumber || '').replace(/\D/g, '');
        return cleanPhone.includes(term);
      });
    } else if (isMixed) {
      this.filteredContacts = this.allUsers.filter((contact) => {
        const username = (contact.username || '').toLowerCase();
        const cleanPhone = (contact.phoneNumber || '').replace(/\D/g, '');
        return username.includes(term) || cleanPhone.includes(term);
      });
      this.filteredNonPlatformContacts = this.nonPlatformContacts.filter((contact) => {
        const username = (contact.username || '').toLowerCase();
        const cleanPhone = (contact.phoneNumber || '').replace(/\D/g, '');
        return username.includes(term) || cleanPhone.includes(term);
      });
    } else {
      this.filteredContacts = this.allUsers.filter((contact) => {
        const username = (contact.username || '').toLowerCase();
        return username.includes(term);
      });
      this.filteredNonPlatformContacts = this.nonPlatformContacts.filter((contact) => {
        const username = (contact.username || '').toLowerCase();
        return username.includes(term);
      });
    }

    this.filteredContacts.sort((a, b) => {
      const aName = (a.username || '').toLowerCase();
      const bName = (b.username || '').toLowerCase();

      if (aName === term && bName !== term) return -1;
      if (bName === term && aName !== term) return 1;
      if (aName.startsWith(term) && !bName.startsWith(term)) return -1;
      if (bName.startsWith(term) && !aName.startsWith(term)) return 1;

      return aName.localeCompare(bName);
    });
  }

  filterContactsWithDebounce() {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.filterContacts(), 300);
  }

  clearSearch() {
    this.searchTerm = '';
    this.filteredContacts = [...this.allUsers];
    this.filteredNonPlatformContacts = [...this.nonPlatformContacts];
  }

  toggleSearch() {
    this.showSearchBar = !this.showSearchBar;
    if (!this.showSearchBar) {
      this.clearSearch();
    } else {
      setTimeout(() => this.searchInput?.setFocus(), 300);
    }
  }

  // ────────────────────────────────────────────
  // Broadcast creation
  // ────────────────────────────────────────────
  async createBroadcast() {
    const selected = this.selectedContacts;
    if (selected.length === 0) return;

    const broadcastId = `broadcast_${Date.now()}`;
    const broadcastName = `Broadcast (${selected.length})`;
    const members = selected.map((u) => ({
      userId: u.userId,
      username: u.username,
      phoneNumber: u.phoneNumber,
    }));

    try {
      // 3 separate arguments (broadcastId, broadcastName, members[])
      await this.broadcastService.createBroadcast(
        broadcastId,
        broadcastName,
        members
      );

      this.router.navigate(['/broadcast-chat'], {
        queryParams: { broadcastId },
      });
    } catch (err) {
      console.error('Failed to create broadcast:', err);
      alert('Failed to create broadcast. Please try again.');
    }
  }

  // ────────────────────────────────────────────
  // Invite non-platform contact
  // ────────────────────────────────────────────
  async inviteContact(contact: { username: string; phoneNumber: string }) {
    try {
      await Share.share({
        title: 'Join me on app!',
        text: `Hey ${contact.username}! I\'m using ek-msg to chat. Join me here:`,
        url: 'https://play.google.com/store/apps/details?id=com.ekarigar.ekmessenger',
        dialogTitle: 'Invite to app',
      });
    } catch (error) {
      console.error('Error sharing invite:', error);
    }
  }

  // ────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────
  getInitial(name: string): string {
    return (name || '?').charAt(0).toUpperCase();
  }

  goBack() {
    // this.router.navigate(['/home-screen']);
    this.navCtrl.back();
  }
}