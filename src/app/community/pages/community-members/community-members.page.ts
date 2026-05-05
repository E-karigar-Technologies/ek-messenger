import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, NavController } from '@ionic/angular';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from 'src/app/auth/auth.service';
import { ApiService } from 'src/app/services/api/api.service';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { getDatabase, ref, onValue } from 'firebase/database';
import { firstValueFrom } from 'rxjs';

export interface CommunityMember {
  userId: string;
  name: string;      // resolved display name (device contact > platform > phone)
  phone: string;     // raw phone number (search ke liye)
  avatar: string;
  role: 'owner' | 'admin' | 'member';
  isYou: boolean;
  isOnline?: boolean;
  avatarError?: boolean;
}

@Component({
  selector: 'app-community-members',
  templateUrl: './community-members.page.html',
  styleUrls: ['./community-members.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class CommunityMembersPage implements OnInit, OnDestroy {
  communityId: string | null = null;
  currentUserId: string = '';
  community: any = null;

  allMembers: CommunityMember[] = [];
  filteredMembers: CommunityMember[] = [];
  adminMembers: CommunityMember[] = [];
  regularMembers: CommunityMember[] = [];

  loading = true;
  searchQuery = '';

  private communityListener: (() => void) | null = null;

  // Avatar color palette — gold themed
  private avatarColors = [
     '#006A4F', '#338872', '#66A695'
  ];

  constructor(
    private navCtrl: NavController,
    private route: ActivatedRoute,
    private authService: AuthService,
    private api: ApiService,
    private firebaseChatService: FirebaseChatService
  ) {}

  ngOnInit() {
    this.currentUserId = this.authService?.authData?.userId
      ? String(this.authService.authData.userId)
      : localStorage.getItem('userId') || '';
  }

  async ionViewWillEnter() {
    this.route.queryParams.subscribe(async (params) => {
      const cid = params['communityId'] || params['id'];
      if (!cid) return;

      this.communityId = cid;
      this.loading = true;
      await this.loadMembers();
    });
  }

  ionViewWillLeave() {
    this.cleanupListener();
  }

  ngOnDestroy() {
    this.cleanupListener();
  }

  // ── Load members from Firebase ──────────────────────────────
  private async loadMembers(): Promise<void> {
    if (!this.communityId) return;

    try {
      const db = getDatabase();
      const communityRef = ref(db, `communities/${this.communityId}`);

      this.communityListener = onValue(communityRef, async (snapshot) => {
        if (!snapshot.exists()) {
          this.loading = false;
          return;
        }

        this.community = snapshot.val();
        const membersObj = this.community.members || {};
        const adminIds: string[] = this.community.adminIds
          ? Array.isArray(this.community.adminIds)
            ? this.community.adminIds.map(String)
            : Object.values(this.community.adminIds).map(String)
          : [];
        const ownerId = String(
          this.community.createdBy || this.community.ownerId || ''
        );
        const memberIds = Object.keys(membersObj);

        // Fetch profiles in parallel
        const members: CommunityMember[] = await Promise.all(
          memberIds.map((uid) => this.buildMember(uid, adminIds, ownerId))
        );

        // Sort: owner → admins → members, "You" pehle apne group mein
        members.sort((a, b) => {
          const rolePriority = (m: CommunityMember) =>
            m.role === 'owner' ? 0 : m.role === 'admin' ? 1 : 2;
          const rp = rolePriority(a) - rolePriority(b);
          if (rp !== 0) return rp;
          if (a.isYou) return -1;
          if (b.isYou) return 1;
          return a.name.localeCompare(b.name);
        });

        this.allMembers = members;
        this.adminMembers = members.filter(
          (m) => m.role === 'owner' || m.role === 'admin'
        );
        this.regularMembers = members.filter((m) => m.role === 'member');
        this.filteredMembers = [...members];
        this.loading = false;
      });
    } catch (err) {
      console.error('loadMembers error:', err);
      this.loading = false;
    }
  }

  // ── Build single member with resolved display name ──────────
  private async buildMember(
    uid: string,
    adminIds: string[],
    ownerId: string
  ): Promise<CommunityMember> {
    const isYou = String(uid) === String(this.currentUserId);

    // Step 1: API se phone + avatar fetch karo
    let apiName = '';
    let phone = '';
    let avatar = '';

    try {
      const res: any = await firstValueFrom(this.api.getUserProfilebyId(uid));
      apiName = res?.name || res?.username || '';
      phone = res?.phone_number || '';
      avatar = res?.profile || '';
    } catch {
      // API fail — phone empty rahega, fallback chalega
    }

    // Step 2: Device contact name resolve karo (userabout logic same)
    const resolvedName = this.resolveDisplayName(uid, phone, isYou, apiName);

    const role: 'owner' | 'admin' | 'member' =
      String(uid) === ownerId
        ? 'owner'
        : adminIds.includes(String(uid))
        ? 'admin'
        : 'member';

    return {
      userId: uid,
      name: resolvedName,
      phone,
      avatar,
      role,
      isYou,
      avatarError: false,
    };
  }

  /**
   * Userabout ke membersWithDeviceNames logic se same priority order:
   *  1. "You"      → khud ka profile
   *  2. userId match in platformUsers → device_contact_name > username
   *  3. phone match in platformUsers  → device_contact_name > username
   *  4. phone match in deviceContacts → username
   *  5. Number save nahi → phone number dikhao (name ki jagah)
   *  6. Last fallback    → apiName ya 'Unknown'
   */
  private resolveDisplayName(
    uid: string,
    phone: string,
    isYou: boolean,
    apiName: string
  ): string {
    // Priority 1: Khud ka profile
    if (isYou) return 'You';

    const pfUsers: any[] = this.firebaseChatService.currentUsers || [];
    const deviceContacts: any[] = this.firebaseChatService.currentDeviceContacts || [];

    // Priority 2: Platform users mein userId se dhundo
    const matchedByUserId = pfUsers.find(
      (u: any) => String(u.userId) === String(uid)
    );
    if (matchedByUserId?.device_contact_name) {
      return matchedByUserId.device_contact_name;
    }
    if (matchedByUserId?.username) {
      return matchedByUserId.username;
    }

    // Priority 3 & 4: Phone se match
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);
      if (cleanPhone.length === 10) {

        // Priority 3a: platformUsers phone match → device_contact_name prefer
        const phoneMatchedPf = pfUsers.find((u: any) => {
          const uPhone = (u.phoneNumber || '').replace(/\D/g, '').slice(-10);
          return uPhone === cleanPhone;
        });
        if (phoneMatchedPf?.device_contact_name) {
          return phoneMatchedPf.device_contact_name;
        }
        if (phoneMatchedPf?.username) {
          return phoneMatchedPf.username;
        }

        // Priority 3b: deviceContacts phone match
        const deviceContact = deviceContacts.find((dc: any) => {
          const dcPhone = (dc.phoneNumber || '').replace(/\D/g, '').slice(-10);
          return dcPhone === cleanPhone;
        });
        if (deviceContact?.username) {
          return deviceContact.username;
        }
      }

      // Priority 5: Number save nahi → phone number dikhao (name ki jagah)
      return phone;
    }

    // Priority 6: API name ya Unknown
    return apiName || 'Unknown';
  }

  // ── Search — name aur phone dono se search ──────────────────
  onSearch(): void {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) {
      this.filteredMembers = [...this.allMembers];
      return;
    }
    this.filteredMembers = this.allMembers.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.phone.replace(/\D/g, '').includes(q.replace(/\D/g, ''))
    );
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.filteredMembers = [...this.allMembers];
  }

  // ── Helpers ─────────────────────────────────────────────────
  isAdminOrOwner(): boolean {
    if (!this.community || !this.currentUserId) return false;

    if (
      String(this.community.createdBy) === String(this.currentUserId) ||
      String(this.community.ownerId) === String(this.currentUserId)
    ) {
      return true;
    }

    const adminIds = this.community.adminIds;
    if (!adminIds) return false;

    const ids: string[] = Array.isArray(adminIds)
      ? adminIds.map(String)
      : Object.values(adminIds).map(String);

    return ids.includes(String(this.currentUserId));
  }

  getInitial(name: string): string {
    return (name || '?').trim().charAt(0).toUpperCase();
  }

  getAvatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return this.avatarColors[Math.abs(hash) % this.avatarColors.length];
  }

  onAvatarError(member: CommunityMember): void {
    member.avatarError = true;
  }

  trackById(index: number, member: CommunityMember): string {
    return member.userId;
  }

  back(): void {
    this.navCtrl.back();
  }

  private cleanupListener(): void {
    if (this.communityListener) {
      try {
        this.communityListener();
      } catch {}
      this.communityListener = null;
    }
  }
}