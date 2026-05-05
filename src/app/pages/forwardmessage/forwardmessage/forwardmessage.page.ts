import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, NavController } from '@ionic/angular';
import { Router } from '@angular/router';
import { FirebaseChatService } from '../../../services/firebase-chat.service';
import { AuthService } from 'src/app/auth/auth.service';

export interface SelectableChat {
  roomId: string;
  title: string;
  avatar: string | null;
  type: 'private' | 'group' | 'community';
  /** true = platform user without existing chat (roomId holds the userId) */
  isContact: boolean;
}

@Component({
  selector: 'app-forwardmessage',
  templateUrl: './forwardmessage.page.html',
  styleUrls: ['./forwardmessage.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ForwardmessagePage implements OnInit, OnDestroy {
  @ViewChild('searchInputRef') searchInputRef!: ElementRef<HTMLInputElement>;

  searchText = '';
  showSearch = false;
  isLoading = true;

  frequentChats: SelectableChat[] = [];
  otherContacts: SelectableChat[] = [];
  filteredFrequent: SelectableChat[] = [];
  filteredOther: SelectableChat[] = [];
  selected: SelectableChat[] = [];

  forwardedMessage: any;

  constructor(
    private router: Router,
    private navCtrl: NavController,
    private firebaseChatService: FirebaseChatService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit() {
    const forwardMessages = this.firebaseChatService.getForwardMessages();
    this.forwardedMessage = Array.isArray(forwardMessages) ? forwardMessages[0] : null;
    await this.buildLists();
  }

  ngOnDestroy() {}

  goBack() {
    this.navCtrl.back();
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  openSearch(): void {
    this.showSearch = true;
    this.cdr.detectChanges();
    setTimeout(() => this.searchInputRef?.nativeElement?.focus(), 100);
  }

  closeSearch(): void {
    this.showSearch = false;
    this.clearSearch();
  }

  clearSearch(): void {
    this.searchText = '';
    this.applySearch();
    this.cdr.detectChanges();
  }

  onSearch(): void {
    this.applySearch();
  }

  // ── Build contact lists ─────────────────────────────────────────────────────

  private async buildLists(): Promise<void> {
    this.isLoading = true;
    try {
      const senderId = this.authService.authData?.userId || '';
      const conversations = this.firebaseChatService.currentConversations || [];
      const platformUsers = await this.firebaseChatService.getResolvedPlatformUsers();

      // Frequently contacted: non-community, non-archived, non-locked chats
      this.frequentChats = conversations
        .filter(c => c.type !== 'community' && !c.isArchived && !c.isLocked)
        .map(c => ({
          roomId: c.roomId,
          title: c.title || c.roomId,
          avatar: (c as any).avatar || null,
          type: c.type as 'private' | 'group' | 'community',
          isContact: false,
        }));

      // Contacts on Telldemm: platform users without an existing chat
      const chattedUserIds = new Set<string>();
      conversations.forEach(c => {
        if (c.type === 'private') {
          c.roomId.split('_').forEach((p: string) => {
            if (p !== senderId) chattedUserIds.add(p);
          });
        }
      });

      this.otherContacts = (platformUsers as any[])
        .filter((u: any) => {
          const uid = String(u.userId || '');
          return uid && uid !== senderId && !chattedUserIds.has(uid);
        })
        .map((u: any) => ({
          roomId: String(u.userId),
          title: u.device_contact_name || u.username || u.phoneNumber || 'Unknown',
          avatar: u.avatar || null,
          type: 'private' as const,
          isContact: true,
        }));

      this.applySearch();
    } catch (err) {
      console.error('[ForwardMessage] buildLists error:', err);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  private applySearch(): void {
    const q = this.searchText.trim().toLowerCase();
    if (!q) {
      this.filteredFrequent = [...this.frequentChats];
      this.filteredOther = [...this.otherContacts];
    } else {
      this.filteredFrequent = this.frequentChats.filter(c =>
        c.title.toLowerCase().includes(q)
      );
      this.filteredOther = this.otherContacts.filter(c =>
        c.title.toLowerCase().includes(q)
      );
    }
  }

  // ── Selection ───────────────────────────────────────────────────────────────

  isSelected(chat: SelectableChat): boolean {
    return this.selected.some(s => s.roomId === chat.roomId);
  }

  toggleSelect(chat: SelectableChat): void {
    if (this.isSelected(chat)) {
      this.selected = this.selected.filter(s => s.roomId !== chat.roomId);
    } else {
      this.selected.push({ ...chat });
    }
    this.cdr.detectChanges();
  }

  removeSelected(chat: SelectableChat): void {
    this.selected = this.selected.filter(s => s.roomId !== chat.roomId);
    this.cdr.detectChanges();
  }

  getInitial(title: string): string {
    return (title || '?').charAt(0).toUpperCase();
  }

  get selectedNames(): string {
    return this.selected.map(c => c.title).join(', ');
  }

  // ── Forward ─────────────────────────────────────────────────────────────────

  async sendForward() {
    const forwardMessages = this.firebaseChatService.getForwardMessages();

    if (!forwardMessages || forwardMessages.length === 0) {
      console.warn('No messages to forward');
      return;
    }

    if (this.selected.length === 0) {
      console.warn('No contacts selected');
      return;
    }

    const senderId = this.authService.authData?.userId || '';

    try {
      for (const forwardedMsg of forwardMessages) {
        for (const chat of this.selected) {
          if (chat.isContact) {
            // New contact (no existing chat) — create private chat with userId as receiverId
            await this.firebaseChatService.sendForwardMessage(forwardedMsg, chat.roomId);
          } else if (chat.type === 'private') {
            // Existing private chat — extract the other party's id from roomId
            const parts = chat.roomId.split('_');
            const receiverId = parts.find(p => p !== senderId) ?? parts[parts.length - 1];
            await this.firebaseChatService.sendForwardMessage(forwardedMsg, receiverId);
          } else {
            // Group or community — pass the roomId directly, no receiverId
            await this.firebaseChatService.sendForwardMessage(forwardedMsg, '', chat.roomId);
          }
        }
      }

      this.firebaseChatService.clearForwardMessages();
      this.router.navigate(['/home-screen']);
      console.log('✅ All messages forwarded successfully');
    } catch (error) {
      console.error('❌ Error forwarding messages:', error);
    }
  }
}

