import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonicModule,
  NavController,
  ToastController,
  LoadingController,
  AlertController,
  ModalController,
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { AuthService } from 'src/app/auth/auth.service';
import { ApiService } from 'src/app/services/api/api.service';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { ImageCropperModalComponent } from '../../../components/image-cropper-modal/image-cropper-modal.component';
import { Subject, takeUntil, firstValueFrom } from 'rxjs';
import { CropResult } from 'src/types';
import { GroupPermissions } from 'src/app/pages/group-permissions/group-permissions.page';
import { EmojiPickerModalComponent } from 'src/app/components/emoji-picker-modal/emoji-picker-modal.component';
import { getDatabase, ref as rtdbRef, update as rtdbUpdate } from 'firebase/database';

@Component({
  selector: 'app-create-new-group',
  templateUrl: './create-new-group.page.html',
  styleUrls: ['./create-new-group.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class CreateNewGroupPage implements OnInit, OnDestroy {
  communityId: string | null = null;
  communityName: string | null = null;

  // form fields
  groupName: string = '';
  groupDescription: string = '';
  visibility: 'Visible' | 'Hidden' = 'Visible';
  showVisibilityModal = false;

  // members management
  members: Array<{
    userId: string;
    username: string;
    phoneNumber: string;
    profile?: string;
  }> = [];

  creating = false;

  // ── DP related ────────────────────────────────────────────────────────────
  groupDpPreview: string | null = null;
  groupDpFile: File | null = null;
  isDpUpdating = false;
  showDpSheet = false;

  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
  private readonly ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  // ── Disappearing Messages ─────────────────────────────────────────────────
  /**
   * Selected duration before group creation.
   * Applied to Firebase after group is created.
   * Same type as userabout page / DisappearingMessagesPage.
   */
  disappearingDuration: 'off' | '2' | '7' | '90' = 'off';

  /** Controls the disappearing messages bottom sheet */
  showDisappearingSheet = false;

  // ── Group Permissions ─────────────────────────────────────────────────────
  /**
   * Permissions object — same shape as GroupPermissions interface
   * used in userabout page and group-permissions page.
   */
  groupPermissions: GroupPermissions = {
    editGroupSettings: true,
    sendMessages: true,
    addMembers: true,
    inviteViaLink: false,
    approveNewMembers: false,
  };

  /** Controls the permissions bottom sheet */
  showPermissionsSheet = false;

  private destroy$ = new Subject<void>();
  // ─────────────────────────────────────────────────────────────────────────

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private alertCtrl: AlertController,
    private firebaseService: FirebaseChatService,
    private authService: AuthService,
    private api: ApiService,
    private modalCtrl: ModalController,
  ) {}

  ngOnInit() {
    this.loadCommunityContext();

    // Pre-fill members with current user
    const user = this.authService?.authData;
    const uid = user?.userId ?? null;
    const name = user?.name ?? 'You';
    const phone = user?.phone_number ?? '';
    if (uid) {
      this.members = [{ userId: uid, username: name, phoneNumber: phone }];
    }

    // Load selected members from service
    const savedMembers = this.firebaseService.getSelectedGroupMembers();
    if (savedMembers && savedMembers.length > 0) {
      savedMembers.forEach((m: any) => {
        const memberId = m.user_id || m.userId;
        if (!this.members.find((existing) => existing.userId === memberId)) {
          this.members.push({
            userId: memberId,
            username: m.name || m.username || 'Unknown',
            phoneNumber: m.phone_number || m.phoneNumber || '',
            profile: m.profile || m.avatar || '',
          });
        }
      });
    }

    // Check router state for selected members
    const navState: any = this.router.getCurrentNavigation()?.extras?.state;
    if (navState?.selectedMembers) {
      navState.selectedMembers.forEach((m: any) => {
        const memberId = m.user_id || m.userId;
        if (!this.members.find((existing) => existing.userId === memberId)) {
          this.members.push({
            userId: memberId,
            username: m.name || m.username || 'Unknown',
            phoneNumber: m.phone_number || m.phoneNumber || '',
            profile: m.profile || m.avatar || '',
          });
        }
      });
    }

    // Fetch DPs for all members in background
    this.fetchMemberProfiles();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Community context helpers ─────────────────────────────────────────────

  private loadCommunityContext() {
    const navigation = this.router.getCurrentNavigation();
    const state = navigation?.extras?.state;

    if (state?.['communityId']) {
      this.communityId = state['communityId'];
      this.communityName = state['communityName'] || null;
      this.firebaseService.setCurrentCommunityContext({
        communityId: this.communityId,
        communityName: this.communityName,
      });
      return;
    }

    const params = this.route.snapshot.queryParams;
    if (params['communityId'] || params['id']) {
      this.communityId = params['communityId'] || params['id'];
      this.communityName = params['communityName'] || null;
      this.firebaseService.setCurrentCommunityContext({
        communityId: this.communityId,
        communityName: this.communityName,
      });
      return;
    }

    const savedContext = this.firebaseService.getCurrentCommunityContext();
    if (savedContext?.communityId) {
      this.communityId = savedContext.communityId;
      this.communityName = savedContext.communityName || null;
      return;
    }

    this.route.queryParams.subscribe((p) => {
      if (!this.communityId && (p['communityId'] || p['id'])) {
        this.communityId = p['communityId'] || p['id'];
        this.communityName = p['communityName'] || null;
        this.firebaseService.setCurrentCommunityContext({
          communityId: this.communityId,
          communityName: this.communityName,
        });
      }
    });
  }

  ionViewWillEnter() {
    if (!this.communityId) {
      this.loadCommunityContext();
    }

    const savedMembers = this.firebaseService.getSelectedGroupMembers();
    if (savedMembers && savedMembers.length > 0) {
      const currentUserId = this.authService?.authData?.userId;
      this.members = this.members.filter((m) => m.userId === currentUserId);

      savedMembers.forEach((m: any) => {
        const memberId = m.user_id || m.userId;
        if (!this.members.find((existing) => existing.userId === memberId)) {
          this.members.push({
            userId: memberId,
            username: m.name || m.username || 'Unknown',
            phoneNumber: m.phone_number || m.phoneNumber || '',
            profile: m.profile || m.avatar || '',
          });
        }
      });

      this.fetchMemberProfiles();
    }
  }

  // ── Member Profile DP Fetch ───────────────────────────────────────────────

  private async fetchMemberProfiles(): Promise<void> {
    const currentUserId = this.authService?.authData?.userId;

    const membersNeedingProfile = this.members.filter(
      (m) => !m.profile && m.userId !== currentUserId
    );

    if (membersNeedingProfile.length === 0) return;

    await Promise.allSettled(
      membersNeedingProfile.map(async (member) => {
        try {
          const res: any = await firstValueFrom(
            this.api.getUserProfilebyId(member.userId)
          );

          const idx = this.members.findIndex((m) => m.userId === member.userId);
          if (idx !== -1 && res?.profile) {
            this.members[idx].profile = res.profile;
          }
        } catch (err) {
          console.warn(`⚠️ Could not fetch DP for member ${member.userId}:`, err);
        }
      })
    );
  }

  // ── DP Sheet ──────────────────────────────────────────────────────────────

  openDpSheet() {
    this.showDpSheet = true;
  }

  closeDpSheet() {
    this.showDpSheet = false;
  }

  openVisibilityModal() {
  this.showVisibilityModal = true;
}

closeVisibilityModal() {
  this.showVisibilityModal = false;
}

selectVisibility(value: 'Visible' | 'Hidden') {
  this.visibility = value;
  this.closeVisibilityModal();
}

onLearnMoreVisibility() {
  // Optional: open browser link or show info alert
  this.showToast('Group visibility controls who can discover this group.', 'dark');
}

  async pickDpOption(option: string) {
    this.closeDpSheet();

    switch (option) {
      case 'camera':
        await this.selectImageFromSource(CameraSource.Camera);
        break;
      case 'gallery':
        await this.selectImageFromSource(CameraSource.Photos);
        break;
      case 'emoji':
        await this.openEmojiPicker();
        break;
      case 'ai-images':
        await this.showToast('AI Images coming soon!', 'dark');
        break;
      case 'search-web':
        await this.showToast('Search Web coming soon!', 'dark');
        break;
      case 'remove':
        this.groupDpPreview = null;
        this.groupDpFile = null;
        break;
      default:
        break;
    }
  }

  // ── Camera / Gallery helpers ──────────────────────────────────────────────

  private async selectImageFromSource(source: CameraSource) {
    if (this.isDpUpdating) return;

    try {
      const loading = await this.loadingCtrl.create({
        message: source === CameraSource.Camera ? 'Opening camera…' : 'Opening gallery…',
        duration: 5000,
      });
      await loading.present();

      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source,
        width: 1000,
        height: 1000,
      });

      await loading.dismiss();

      if (image?.webPath) {
        await this.processImage(image.webPath);
      } else {
        await this.showToast('No image selected', 'warning');
      }
    } catch (error: any) {
      const msg = (error?.message || '').toLowerCase();
      if (msg.includes('cancel')) return;
      console.error('Camera error:', error);
      await this.showToast('Failed to open camera/gallery. Please try again.', 'danger');
    }
  }

  private async processImage(imagePath: string) {
    try {
      const loading = await this.loadingCtrl.create({ message: 'Processing image…', duration: 10000 });
      await loading.present();

      const response = await fetch(imagePath);
      const blob = await response.blob();

      await loading.dismiss();

      if (blob.size > this.MAX_FILE_SIZE) {
        await this.showToast('Image must be smaller than 5 MB', 'danger');
        return;
      }
      if (!this.ALLOWED_TYPES.includes(blob.type)) {
        await this.showToast('Please select a JPEG, PNG, or WebP image', 'danger');
        return;
      }

      const dataUrl = await this.blobToDataURL(blob);
      await this.openCropper(dataUrl, blob);
    } catch (err) {
      console.error('processImage error:', err);
      await this.showToast('Error processing image. Please try again.', 'danger');
    }
  }

  private blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('FileReader failed'));
      reader.readAsDataURL(blob);
    });
  }

  private async openCropper(imageUrl: string, _originalBlob: Blob) {
    const modal = await this.modalCtrl.create({
      component: ImageCropperModalComponent,
      componentProps: { imageUrl, aspectRatio: 1, cropQuality: 0.9 },
      cssClass: 'image-cropper-modal',
      backdropDismiss: false,
    });

    await modal.present();

    const { data } = await modal.onDidDismiss<CropResult>();

    if (data?.success && data.croppedImage && data.originalBlob) {
      this.groupDpPreview = data.croppedImage;
      this.groupDpFile = new File(
        [data.originalBlob],
        `group_dp_${Date.now()}.jpg`,
        { type: data.originalBlob.type }
      );
      await this.showToast('Group icon set! It will be uploaded when you create the group.', 'success');
    } else if (data?.error) {
      await this.showToast(data.error, 'danger');
    }
  }

  // ── Emoji Picker ─────────────────────────────────────────────────────────

  private async openEmojiPicker() {
    const modal = await this.modalCtrl.create({
      component: EmojiPickerModalComponent,
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
      backdropDismiss: true,
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();

    if (data?.selected && data.emoji) {
      // Emoji ko group name mein append karo (cursor position pe)
      this.groupName = (this.groupName || '') + data.emoji;
    }
  }

  /** Template binding ke liye — emoji icon button (group name ke saath) */
  async openEmojiPickerForName() {
    await this.openEmojiPicker();
  }

  // ── Disappearing Messages Sheet ───────────────────────────────────────────

  /** Open the disappearing messages bottom sheet */
  openDisappearingSheet() {
    this.showDisappearingSheet = true;
  }

  /** Close the disappearing messages bottom sheet */
  closeDisappearingSheet() {
    this.showDisappearingSheet = false;
  }

  /**
   * User ne option select kiya.
   * Value store ho jaati hai — group creation ke baad Firebase mein apply hogi.
   */
  selectDisappearing(duration: 'off' | '2' | '7' | '90') {
    this.disappearingDuration = duration;
    this.closeDisappearingSheet();
  }

  /**
   * Template mein display ke liye readable label.
   * Same map as userabout page ka disappearingLabel getter.
   */
  get disappearingLabel(): string {
    const labels: Record<string, string> = {
      'off': 'Off',
      '2': '2 minutes',
      '7': '7 days',
      '90': '90 days',
    };
    return labels[this.disappearingDuration] || 'Off';
  }

  // ── Group Permissions Sheet ───────────────────────────────────────────────

  /** Open the group permissions bottom sheet */
  openPermissionsSheet() {
    this.showPermissionsSheet = true;
  }

  /** Close the group permissions bottom sheet */
  closePermissionsSheet() {
    this.showPermissionsSheet = false;
  }

  /** Done button — sheet band karo, label update hoga automatically via getter */
  savePermissions() {
    this.closePermissionsSheet();
  }

  /**
   * Options card mein subtitle ke liye summary label.
   * Active permissions ki count dikhata hai.
   */
  get permissionsLabel(): string {
    const active: string[] = [];
    if (this.groupPermissions.sendMessages) active.push('Members can send messages');
    if (this.groupPermissions.addMembers) active.push('Members can add');
    if (this.groupPermissions.editGroupSettings) active.push('Members can edit');
    if (active.length === 0) return 'Admins only';
    if (active.length === 1) return active[0];
    return `${active.length} permissions enabled`;
  }

  // ── Members ───────────────────────────────────────────────────────────────

  async addMemberPrompt() {
    if (this.communityId) {
      this.firebaseService.setCurrentCommunityContext({
        communityId: this.communityId,
        communityName: this.communityName,
      });
    }
    this.navCtrl.navigateForward(['/load-all-members'], {
      queryParams: { communityId: this.communityId, communityName: this.communityName },
      state: { selected: this.members, communityId: this.communityId, communityName: this.communityName },
    });
  }

  removeMember(idx: number) {
    this.members.splice(idx, 1);
    const remaining = this.members
      .filter((m) => m.userId !== this.authService?.authData?.userId)
      .map((m) => ({ user_id: m.userId, name: m.username, phone_number: m.phoneNumber }));
    this.firebaseService.setSelectedGroupMembers(remaining);
  }

  // ── Create group ──────────────────────────────────────────────────────────

  async createGroupAndLink() {
  // ── Validation ──
  if (!this.groupName || this.groupName.trim().length === 0) {
    const t = await this.toastCtrl.create({ message: 'Enter group name', duration: 1500, color: 'warning' });
    await t.present();
    return;
  }

  // ── Recover communityId ──
  if (!this.communityId) {
    const saved = this.firebaseService.getCurrentCommunityContext();
    if (saved?.communityId) {
      this.communityId = saved.communityId;
      this.communityName = saved.communityName;
    }

    if (!this.communityId) {
      const p = this.route.snapshot.queryParams;
      this.communityId = p['communityId'] || p['id'] || null;
    }

    if (!this.communityId) {
      const url = this.router.url;
      const match = url.match(/[?&]communityId=([^&]+)/);
      if (match) this.communityId = match[1];
    }

    if (!this.communityId) {
      const t = await this.toastCtrl.create({
        message: 'Community context lost. Please go back and try again.',
        duration: 3000,
        color: 'danger'
      });
      await t.present();
      return;
    }
  }

  const user = this.authService?.authData;
  const userId = user?.userId ?? null;

  if (!userId) {
    const t = await this.toastCtrl.create({ message: 'User not authenticated', duration: 2000, color: 'danger' });
    await t.present();
    return;
  }

  this.creating = true;
  const loading = await this.loadingCtrl.create({ message: 'Creating group…' });
  await loading.present();

  try {
    const groupId = `group_${Date.now()}`;

    // ── Step 1: Check community settings (NEW LOGIC) ──
    let needsApproval = false;

    if (this.communityId) {
      try {
        const communitySnap = await this.firebaseService.getCommunityDetails(this.communityId);
        const settings = communitySnap?.settings || {};

        const whoCanAddGroups = settings.whoCanAddGroups || 'everyone';

        const isAdmin = this.firebaseService.currentConversations
          .find(c => c.roomId === this.communityId)
          ?.adminIds?.includes(userId || '') || false;

        const isOwner =
          communitySnap?.ownerId === userId ||
          communitySnap?.createdBy === userId;

        needsApproval = whoCanAddGroups === 'only_admins' && !isAdmin && !isOwner;
      } catch (e) {
        console.warn('Settings check failed:', e);
      }
    }

    // ── Step 2: Create group ──
    await this.firebaseService.createGroup({
      groupId,
      groupName: this.groupName.trim(),
      members: this.members,
    });

    await this.firebaseService.saveGroupVisibility(groupId, this.visibility);

    // ── Permissions ──
    try {
      await this.firebaseService.saveGroupPermissions(groupId, this.groupPermissions);
    } catch (permErr) {
      console.warn('Permissions save failed:', permErr);
    }

    // ── Disappearing messages ──
    if (this.disappearingDuration !== 'off') {
      try {
        const tempCurrentChat = this.firebaseService.currentChat;

        (this.firebaseService as any).currentChat = {
          roomId: groupId,
          type: 'group',
          members: this.members.map(m => m.userId),
        };

        await this.firebaseService.setDisappearingMessages(
          groupId,
          this.disappearingDuration as '2' | '7' | '90'
        );

        (this.firebaseService as any).currentChat = tempCurrentChat;
      } catch (dispErr) {
        console.warn('Disappearing messages failed:', dispErr);
      }
    }

    // ── Step 3: Backend sync ──
    const memberIds: number[] = this.members.map(m => Number(m.userId));

    await new Promise<void>((resolve) => {
      this.api.createGroup(this.groupName.trim(), Number(userId), groupId, memberIds).subscribe({
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
              await this.firebaseService.updateBackendGroupId(groupId, backendGroupId);
            } catch {}

            if (this.groupDpFile) {
              try {
                await this.api.updateGroupDp(backendGroupId, groupId, this.groupDpFile).toPromise();
              } catch (dpErr) {
                console.warn('DP upload failed:', dpErr);
              }
            }
          }
          resolve();
        },
        error: (err: any) => {
          console.error('Backend sync failed:', err);
          resolve();
        },
      });
    });

    await loading.dismiss();
    this.creating = false;

    // ── Step 4: Approval vs Direct Add (NEW LOGIC) ──
    if (needsApproval && this.communityId) {
      const db = getDatabase();

      await rtdbUpdate(rtdbRef(db, `groups/${groupId}`), {
        pendingApproval: true
      });

      const senderName = this.authService?.authData?.name || '';

      await this.firebaseService.savePendingGroupSuggestion(this.communityId, {
        groupName: this.groupName.trim(),
        suggestedBy: userId || '',
        suggestedByName: senderName,
        type: 'new',
        groupData: {
          groupId,
          groupName: this.groupName.trim(),
          memberIds: this.members.map(m => m.userId),
        },
        membersCount: this.members.length,
      });

      this.firebaseService.clearSelectedGroupMembers();
      this.firebaseService.clearCurrentCommunityContext();

      const toast = await this.toastCtrl.create({
        message: 'Group suggestion sent for admin approval!',
        duration: 3000,
        color: 'success',
      });

      await toast.present();
      this.navCtrl.navigateBack(['/home-screen']);

    } else {
      // ── Direct add — route through backend socket to avoid PERMISSION_DENIED ──
      await this.firebaseService.applySecuredBatchUpdates({
        [`communities/${this.communityId}/groups/${groupId}`]: true,
        [`groups/${groupId}/communityId`]: this.communityId,
        [`communities/${this.communityId}/members/${userId}`]: true,
      });

      this.firebaseService.clearSelectedGroupMembers();
      this.firebaseService.clearCurrentCommunityContext();

      const toast = await this.toastCtrl.create({
        message: 'Group created successfully!',
        duration: 2000,
        color: 'success'
      });

      await toast.present();
      this.navCtrl.navigateBack(['/home-screen']);
    }

  } catch (err: any) {
    console.error('createGroupAndLink failed', err);

    await loading.dismiss();
    this.creating = false;

    const t = await this.toastCtrl.create({
      message: 'Failed to create group: ' + (err?.message || err?.code || ''),
      duration: 4000,
      color: 'danger',
    });

    await t.present();
  }
}

  ionViewWillLeave() {
    // Context persists until successful creation
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  onImgError(event: Event) {
    (event.target as HTMLImageElement).src = 'assets/images/user.jfif';
  }

  private async showToast(
    message: string,
    color: 'danger' | 'success' | 'warning' | 'dark' = 'dark'
  ) {
    const toast = await this.toastCtrl.create({ message, duration: 3000, color, position: 'bottom' });
    await toast.present();
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  get hasDp(): boolean {
    return !!this.groupDpPreview;
  }

  get currentUserId(): string {
    return this.authService?.authData?.userId || '';
  }
}