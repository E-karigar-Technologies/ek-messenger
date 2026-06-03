import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import { Share } from '@capacitor/share';
import { IonicModule, IonInput, PopoverController, ToastController, LoadingController, ViewWillEnter } from '@ionic/angular';
import { MenuPopoverComponent } from '../components/menu-popover/menu-popover.component';
import { ContactMenuComponent } from '../components/contact-menu/contact-menu.component';
import { ActionSheetController } from '@ionic/angular';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FirebaseChatService } from '../services/firebase-chat.service';
import { ContactSyncService } from '../services/contact-sync.service';
import { SecureStorageService } from '../services/secure-storage/secure-storage.service';
import { ApiService } from '../services/api/api.service';
import { AuthService } from '../auth/auth.service';
import { ChatPouchDb } from '../services/chat-pouch-db';
import { LocalContactsService } from '../services/local-contacts.service';

interface PlatformContact {
  isOnPlatform: true;
  profile: string;
  username: string;
  phoneNumber: string;
  userId: string;
  selected?: boolean;
}

interface NonPlatformContact {
  isOnPlatform: false;
  profile: string;
  username: string;
  phoneNumber: string;
  userId: null;
  selected?: boolean;
}

type ContactItem = PlatformContact | NonPlatformContact;

@Component({
  selector: 'app-contacts',
  templateUrl: './contacts.page.html',
  styleUrls: ['./contacts.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ContactsPage implements OnInit, ViewWillEnter {
  @ViewChild('searchInput', { static: false }) searchInput!: IonInput;

  // Platform users (on Convo)
  allUsers: PlatformContact[] = [];
  filteredContacts: PlatformContact[] = [];

  // Non-platform users (device contacts not on Convo)
  nonPlatformContacts: NonPlatformContact[] = [];
  filteredNonPlatformContacts: NonPlatformContact[] = [];

  showSearchBar = false;
  searchTerm: string = '';
  keyboardType: 'text' | 'tel' = 'text';

  creatingGroup = false;
  newGroupName: string = '';
  userProfile: any;

  isLoading = true;
  private searchDebounce: any = null;
  pouchdbContactsLoaded = false;
  matchedContacts: any[] = [];
  noContactsFound = false;

  constructor(
    private router: Router,
    private popoverControl: PopoverController,
    private actionSheetCtrl: ActionSheetController,
    private firebaseChatService: FirebaseChatService,
    private contactSyncService: ContactSyncService,
    private secureStorage: SecureStorageService,
    private api: ApiService,
    private authService: AuthService,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private chatPouchDb: ChatPouchDb,
    private localContactsService: LocalContactsService,
  ) {}

  ngOnInit() {
    // first creation — ionViewWillEnter handles loading
    const userId = this.authService.authData?.userId;
    if (!userId) return;
  }

  ionViewWillEnter() {
    this.loadDeviceMatchedContacts();
    this.localDbContacts();
  }

  async loadDeviceMatchedContacts(): Promise<void> {
    const currentUserPhone: string | undefined =
      this.authService?.authData?.phone_number ??
      localStorage.getItem('phone_number') ??
      undefined;

    let pfUsers = this.firebaseChatService.currentUsers || [];
    let cachedNonPlatform = this.firebaseChatService.currentNonPlatformUsers || [];

    // ── PouchDB fallback: if in-memory is empty, try PouchDB directly ──
    // This handles the case where initApp() hasn't populated BehaviorSubjects yet.
    if (pfUsers.length === 0 && cachedNonPlatform.length === 0) {
      try {
        const [pouchPlatform, pouchNonPlatform] = await Promise.all([
          this.chatPouchDb.getPlatformUsers(),
          this.chatPouchDb.getNonPlatformUsers(),
        ]);
        if (pouchPlatform.length > 0 || pouchNonPlatform.length > 0) {
          pfUsers = pouchPlatform;
          cachedNonPlatform = pouchNonPlatform;
        }
      } catch (e) {
        console.warn('PouchDB contacts read failed:', e);
      }
    }

    // ── Fast path: data already in memory (BehaviorSubject already populated) ──
    // This is the case on every navigation after the first ever sync.
    // No skeleton, no await — render synchronously and return immediately.
    const hasCachedData = pfUsers.length > 0 || cachedNonPlatform.length > 0;

    if (!hasCachedData) {
      // Genuine cold start — nothing in memory yet, show skeleton
      this.allUsers = [];
      this.nonPlatformContacts = [];
      this.isLoading = true;
    }

    try {
      let deviceContacts = this.firebaseChatService.currentDeviceContacts || [];

      // ── Platform users (synchronous map, data already in memory) ──────────
      const mapNameFromDevice = (phone?: string): string => {
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

      // Reverse lookup: device contact name → phone number.
      // Needed because the backend omits phoneNumber for privacy; the number
      // is only available in the locally-fetched device contacts list.
      const mapPhoneFromDeviceName = (deviceContactName?: string): string => {
        if (!deviceContactName) return '';
        const match = deviceContacts.find((dc: any) =>
          (dc.username || '').toLowerCase() === deviceContactName.toLowerCase()
        );
        return match?.phoneNumber || '';
      };

      this.allUsers = pfUsers.map(({ phoneNumber, userId, avatar, isOnPlatform, device_contact_name }: any) => {
        // Backend intentionally omits phoneNumber for privacy — resolve it from device contacts
        const resolvedPhone = (phoneNumber as string) || mapPhoneFromDeviceName(device_contact_name);
        const resolvedName =
          device_contact_name || mapNameFromDevice(resolvedPhone) || resolvedPhone || 'Unknown';
        return {
          userId: userId as string,
          profile: (avatar as string) || '',
          phoneNumber: resolvedPhone,
          username: resolvedName,
          isOnPlatform: true as const,
          selected: false,
        };
      });

      // ── Non-platform users ────────────────────────────────────────────────
      if (cachedNonPlatform.length > 0) {
        // Instant: use in-memory BehaviorSubject value
        this.nonPlatformContacts = cachedNonPlatform.map((u: any) => ({
          userId: null,
          profile: '',
          phoneNumber: u.phoneNumber || '',
          username: u.username || u.phoneNumber || 'Unknown',
          isOnPlatform: false as const,
          selected: false,
        }));
      } else {
        // Cold start fallback: compute from device contacts
        if (deviceContacts.length === 0) {
          try {
            deviceContacts = await this.contactSyncService.getDevicePhoneNumbers();
          } catch (e) {
            console.warn('Direct device contact fetch failed:', e);
          }
        }

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

        const normalizedCurrentPhone = String(currentUserPhone || '').replace(/\D/g, '').slice(-10);

        this.nonPlatformContacts = deviceContacts
          .filter((dc: any) => {
            const dcPhone = String(dc.phoneNumber || '').replace(/\D/g, '').slice(-10);
            if (dcPhone.length < 10) return false;
            if (dcPhone === normalizedCurrentPhone) return false;
            if (pfUserPhoneLast10.has(dcPhone)) return false;
            return true;
          })
          .map((dc: any) => ({
            userId: null,
            profile: '',
            phoneNumber: dc.phoneNumber || '',
            username: dc.username || dc.phoneNumber || 'Unknown',
            isOnPlatform: false as const,
            selected: false,
          }));
      }

      this.filteredContacts = [...this.allUsers];
      this.filteredNonPlatformContacts = [...this.nonPlatformContacts];
    } catch (error) {
      console.error('Error loading contacts:', error);
      const cached = this.firebaseChatService.currentNonPlatformUsers || [];
      this.nonPlatformContacts = cached.map((u: any) => ({
        userId: null,
        profile: '',
        phoneNumber: u.phoneNumber || '',
        username: u.username || 'Unknown',
        isOnPlatform: false as const,
        selected: false,
      }));
      this.filteredNonPlatformContacts = [...this.nonPlatformContacts];
    } finally {
      this.isLoading = false;
    }
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  filterContacts() {
    const term = this.searchTerm.trim().toLowerCase();

    if (!term) {
      this.filteredContacts = [...this.allUsers];
      this.filteredNonPlatformContacts = [...this.nonPlatformContacts];
      return;
    }

    const isNumeric = /^\d+$/.test(term);
    const isMixed = /[a-zA-Z]/.test(term) && /\d/.test(term);

    const matchContact = (contact: ContactItem): boolean => {
      const username = (contact.username || '').toLowerCase();
      const cleanPhone = (contact.phoneNumber || '').replace(/\D/g, '');
      if (isNumeric) return cleanPhone.includes(term);
      if (isMixed) return username.includes(term) || cleanPhone.includes(term);
      return username.includes(term);
    };

    const sortByRelevance = (a: ContactItem, b: ContactItem): number => {
      const aName = (a.username || '').toLowerCase();
      const bName = (b.username || '').toLowerCase();
      if (aName === term && bName !== term) return -1;
      if (bName === term && aName !== term) return 1;
      if (aName.startsWith(term) && !bName.startsWith(term)) return -1;
      if (bName.startsWith(term) && !aName.startsWith(term)) return 1;
      return aName.localeCompare(bName);
    };

    this.filteredContacts = this.allUsers
      .filter(matchContact)
      .sort(sortByRelevance);

    this.filteredNonPlatformContacts = this.nonPlatformContacts
      .filter(matchContact)
      .sort(sortByRelevance);
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

  // ── Invite ─────────────────────────────────────────────────────────────────

  /**
   * Share invite via Web Share API (mobile) or copy to clipboard (fallback).
   * Prepopulates message with the contact's name like WhatsApp.
   */
  async inviteContact(contact: NonPlatformContact) {
    const name = contact.username || 'your friend';
    try {
      await Share.share({
        title: 'Join me on ConvoIQ!',
        text: `Hey! I'm using ConvoIQ to chat. Join me here:`,
        url: 'https://play.google.com/store/apps/details?id=com.ekarigar.ekmessenger',
        dialogTitle: 'Invite to ConvoIQ',
      });
    } catch (error) {
      console.error('Error sharing invite:', error);
    }
  }

  // ── Chat ───────────────────────────────────────────────────────────────────

  async openContactChat(receiverId: any) {
    try {
      const receiver = this.allUsers.find(
        (u) => u.userId === receiverId && u.isOnPlatform
      );
      if (!receiver) {
        console.error('Receiver not found!');
        return;
      }
      await this.firebaseChatService.openChat({ receiver }, true);
      this.router.navigate(['/chatting-screen'], {
        queryParams: {
          receiver_phone: receiver.phoneNumber.slice(-10),
          receiverId: receiver.userId,
        },
      });
    } catch (error) {
      console.error('Error opening chat:', error);
      alert('Failed to open chat. Please try again.');
    }
  }

  // ── Group Creation ─────────────────────────────────────────────────────────

  startGroupCreation() {
    this.creatingGroup = true;
  }

  async createGroup() {
    const selectedUsers = this.allUsers.filter((u) => u.selected);
    const currentUserId = this.authService.authData?.userId ?? '';
    console.log({selectedUsers, currentUserId});

    if (!this.newGroupName?.trim()) {
      alert('Group name is required');
      return;
    }

    const membersForFirebase = selectedUsers.map((u) => ({
      userId: u.userId,
      username: u.username,
      phoneNumber: u.phoneNumber,
    }));

    const memberIds: number[] = membersForFirebase
      .map((m) => Number(m.userId))
      .filter((n) => Number.isFinite(n));

    const groupId = `group_${Date.now()}`;

    try {
      await this.firebaseChatService.createGroup({
        groupId,
        groupName: this.newGroupName,
        members: membersForFirebase,
      });

      this.api
        .createGroup(this.newGroupName, Number(currentUserId), groupId, memberIds)
        .subscribe({
          next: async (res: any) => {
            const backendGroupId =
              res?.group?.group?.group_id ??
              res?.group?.groupId ??
              res?.group?.id ??
              res?.group_id ??
              res?.data?.group_id ??
              res?.data?.id ??
              res?.id;

            if (backendGroupId) {
              try {
                await this.firebaseChatService.updateBackendGroupId(groupId, backendGroupId);
              } catch (err) {
                console.warn('Failed to update backendGroupId in Firebase:', err);
              }
            }

            this.creatingGroup = false;
            this.newGroupName = '';
            this.allUsers.forEach((u) => (u.selected = false));
            alert('Group created successfully');
            localStorage.setItem('shouldRefreshHome', 'true');
            this.router.navigate(['/home-screen']);
          },
          error: (err: any) => {
            console.error('Failed to sync group to backend:', err);
            alert('Failed to sync group to backend');
          },
        });
    } catch (err) {
      console.error('Failed to create group:', err);
      alert('Failed to create group');
    }
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────

  focusSearchBar() {
    this.showSearchBar = true;
    setTimeout(() => this.searchInput?.setFocus(), 300);
  }

  toggleSearch() {
    this.showSearchBar = !this.showSearchBar;
    if (!this.showSearchBar) {
      this.clearSearch();
    } else {
      setTimeout(() => this.searchInput?.setFocus(), 300);
    }
  }

  toggleKeyboardType() {
    this.keyboardType = this.keyboardType === 'text' ? 'tel' : 'text';
    setTimeout(() => this.searchInput?.setFocus(), 300);
  }

  async presentPopover(ev: any) {
    const popover = await this.popoverControl.create({
      component: MenuPopoverComponent,
      event: ev,
      translucent: true,
    });
    await popover.present();
  }

  async presentContactMenu(ev: any) {
    const popover = await this.popoverControl.create({
      component: ContactMenuComponent,
      event: ev,
      translucent: true,
    });
    await popover.present();
    const { data } = await popover.onDidDismiss();
    if (data === 'Refresh') {
      await this.refreshContacts();
    } else if (data === 'Invite a friend') {
      await this.shareInviteLink();
    } else if (data === 'Contacts') {
      await this.openPhoneContacts();
    } else if (data === 'Help') {
      this.router.navigate(['/help-article']);
    }
  }

  async openPhoneContacts(): Promise<void> {
    const actionSheet = await this.actionSheetCtrl.create({
      header: 'Open with',
      cssClass: 'contacts-chooser-sheet',
      buttons: [
        {
          text: 'Contacts',
          icon: 'people',
          handler: () => {
            this.launchContactsPicker();
          },
        },
        {
          text: 'Cancel',
          role: 'cancel',
          icon: 'close',
        },
      ],
    });
    await actionSheet.present();
  }

  private async launchContactsPicker(): Promise<void> {
    try {
      const { Contacts } = await import('@capacitor-community/contacts');
      await Contacts.pickContact({ projection: { name: true, phones: true } });
    } catch (e: any) {
      if (e?.message !== 'cancelled' && e?.message !== 'PickContact cancelled') {
        console.error('Could not open contacts picker', e);
      }
    }
  }

  async shareInviteLink(): Promise<void> {
    try {
      await Share.share({
        title: 'Join me on ConvoIQ!',
        text: `I'm using ConvoIQ to chat. Join me here:`,
        url: 'https://play.google.com/store/apps/details?id=com.ekarigar.ekmessenger',
        dialogTitle: 'Invite to ConvoIQ',
      });
    } catch (error) {
      console.error('Error sharing invite:', error);
      const toast = await this.toastCtrl.create({
        message: 'Failed to share invite. Please try again.',
        duration: 2000,
        position: 'bottom',
        color: 'danger',
      });
      await toast.present();
    }
  }

  async refreshContacts(): Promise<void> {
    const loading = await this.loadingCtrl.create({
      message: 'Refreshing contacts...',
      spinner: 'crescent',
    });
    await loading.present();
    try {
      await this.firebaseChatService.refreshContactsSync();
      await this.loadDeviceMatchedContacts();
      const toast = await this.toastCtrl.create({
        message: 'Contacts updated',
        duration: 1800,
        position: 'bottom',
        color: 'success',
      });
      await toast.present();
    } catch (err) {
      console.error('Refresh contacts failed:', err);
      const toast = await this.toastCtrl.create({
        message: 'Failed to refresh contacts',
        duration: 2000,
        position: 'bottom',
        color: 'danger',
      });
      await toast.present();
    } finally {
      await loading.dismiss();
    }
  }

  goToCommunity() {
    this.router.navigate(['/community-screen']);
  }
   goToAddContact(){
    this.router.navigate(['/add-contact']);
  }
  localDbContacts() {
    const userId = this.authService.authData?.userId;
//     this.localContactsService.getAllContacts().then((contacts) => {

//   this.matchedContacts = contacts.filter(c => c._id);

//   if (this.matchedContacts.length > 0) {

//     this.userProfile = {
//       userId,
//       firstName: this.matchedContacts[0].firstName,
//       lastName: this.matchedContacts[0].lastName,
//       phone: this.matchedContacts[0].fullPhone,
//     };

//     this.pouchdbContactsLoaded = true;
//   }

//   console.log('Loaded local contacts on init:', contacts);

// });
 this.localContactsService.getAllContacts().then((contacts) => {

    this.matchedContacts = contacts.filter(c => c._id);

    if (this.matchedContacts.length > 0) {

      this.userProfile = {
        userId: this.matchedContacts[0]._id,
        firstName: this.matchedContacts[0].firstName,
        lastName: this.matchedContacts[0].lastName,
        phone: this.matchedContacts[0].fullPhone,
      };

      this.noContactsFound = false;

    } else {

      // fallback
      this.noContactsFound = true;

    }

    this.pouchdbContactsLoaded = true;

    console.log('Loaded local contacts:', contacts);

  }).catch((error) => {

    console.error('Error loading contacts', error);

    this.noContactsFound = true;
    this.pouchdbContactsLoaded = true;

  });
  }
}