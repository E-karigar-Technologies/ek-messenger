import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewInit,
  QueryList,
  Renderer2,
  NgZone,
  ChangeDetectorRef,
} from '@angular/core';
import {
  query,
  orderByKey,
  endBefore,
  limitToLast,
  getDatabase,
  ref,
  get,
  update,
  set,
  remove,
  off,
  push,
} from 'firebase/database';
import { ref as dbRef, onValue, onDisconnect } from 'firebase/database';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import {
  AlertController,
  IonContent,
  IonicModule,
  ModalController,
  Platform,
  PopoverController,
  ToastController,
  IonDatetime,
  ActionSheetController,
  AnimationController,
  LoadingController,
} from '@ionic/angular';
import { firstValueFrom, Subscription, timer } from 'rxjs';
import { Keyboard } from '@capacitor/keyboard';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { EncryptionService } from 'src/app/services/encryption.service';
import { v4 as uuidv4 } from 'uuid';
import { SecureStorageService } from '../../services/secure-storage/secure-storage.service';
import { FileUploadService } from '../../services/file-upload/file-upload.service';
import { ChatOptionsPopoverComponent } from 'src/app/components/chat-options-popover/chat-options-popover.component';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { NavController } from '@ionic/angular';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { FileSystemService } from 'src/app/services/file-system.service';
import imageCompression from 'browser-image-compression';
import { AttachmentPreviewModalComponent } from '../../components/attachment-preview-modal/attachment-preview-modal.component';
import { MessageMorePopoverComponent } from '../../components/message-more-popover/message-more-popover.component';
import { Clipboard } from '@capacitor/clipboard';
import { Message, PinnedMessage } from 'src/types';
import { AuthService } from 'src/app/auth/auth.service';
import { ApiService } from 'src/app/services/api/api.service';
import {
  IUser,
  IAttachment,
  IConversation,
  IMessage,
  SqliteService,
} from 'src/app/services/sqlite.service';
import { TypingService } from 'src/app/services/typing.service';
import { Subject, Subscription as RxSub } from 'rxjs';
import { throttleTime } from 'rxjs/operators';
import { PresenceService } from 'src/app/services/presence.service';
import { switchMap } from 'rxjs/operators';
import { resolve } from 'path';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ImageCropperModalComponent } from 'src/app/components/image-cropper-modal/image-cropper-modal.component';
import { EmojiPickerModalComponent } from 'src/app/components/emoji-picker-modal/emoji-picker-modal.component';
import { ReportModalComponent } from 'src/app/components/report-modal/report-modal.component';
import { FcmService } from 'src/app/services/fcm-service';
import { InviteAdminPreviewModalComponent } from 'src/app/pages/channels/modals/invite-admin-preview-modal/invite-admin-preview-modal.component';
import { VoiceRecorder } from 'capacitor-voice-recorder';
import getBlobDuration from 'get-blob-duration';
import {
  AndroidSettings,
  IOSSettings,
  NativeSettings,
} from 'capacitor-native-settings';
import { ChatPouchDb } from 'src/app/services/chat-pouch-db';
import { NetworkService } from 'src/app/services/network-connection/network.service';
import { TranslateService } from '@ngx-translate/core';
import { getAuth } from 'firebase/auth';
import { GroupInviteModalComponent } from 'src/app/components/group-invite-modal/group-invite-modal.component';
interface ICurrentChat {
  roomId: string;
  receiverId?: string;
  receiverName?: string;
  type?: 'private' | 'group' | 'community';
  members?: string[];
}

type UIMessageStatus =
  | 'failed'
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | null;

interface IconDescriptor {
  name: string;
  cls: string;
  title?: string;
}

// ========================================
// 📦 INTERFACES
// ========================================

// Translation Item Structure
interface TranslationItem {
  code: string; // e.g., 'en', 'hi-IN', 'ar-SA'
  label: string; // e.g., 'English', 'Hindi', 'Arabic (Saudi Arabia)'
  text: string; // the translated text
}

// Translation Card State
interface TranslationCard {
  visible: boolean;
  mode: 'translateCustom' | 'translateToReceiver' | 'sendOriginal';
  items: TranslationItem[];
  createdAt: Date;
}

// Message Translations Structure
interface MessageTranslations {
  original: {
    code: string;
    label: string;
    text: string;
  };
  otherLanguage?: {
    code: string;
    label: string;
    text: string;
  };
  receiverLanguage?: {
    code: string;
    label: string;
    text: string;
  };
}

@Component({
  selector: 'app-chatting-screen',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, ScrollingModule],
  templateUrl: './chatting-screen.page.html',
  styleUrls: [
    './chatting-screen.page.scss',
    './chatting-screen-second.page.scss',
  ],
})
export class ChattingScreenPage implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('scrollContainer', { static: false }) scrollContainer!: ElementRef;
  @ViewChild(IonContent, { static: false }) ionContent!: IonContent;
  @ViewChild('fileInput', { static: false })
  fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('datePicker', { static: false }) datePicker!: IonDatetime;
  @ViewChild('longPressEl') messageElements!: QueryList<ElementRef>;
  @ViewChild('previewAudio') previewAudio!: ElementRef<HTMLAudioElement>;

  messages: Message[] = [];
  groupedMessages: {
    date: string;
    messages: (Message & IMessage & { isMe: boolean })[];
  }[] = [];

  /** Flat list for CDK virtual scroll when message count > 100 */
  flatListForView: Array<
    { type: 'date'; date: string } | { type: 'message'; message: any }
  > = [];
  readonly VIRTUAL_SCROLL_THRESHOLD = 100;

  replyTo: { message: IMessage; sender: IUser | null } | null = null;
  private _messageExpiryTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  disappearingSystemMsg: string | null = null;
  private _disappearingSettingUnsub: (() => void) | null = null;
  // isShowingSyncLoader = false;
  private loadingController?: HTMLIonLoadingElement;
  private isSyncing = false;
  private syncStartTime = 0;
  private lastSyncedMessageCount = 0;

  isCacheEmpty = false;
  batchesComplete = false;
  batchSub?: Subscription;

  messageText = '';
  receiverId = '';
  senderId = '';
  // receiverId = '';
  sender_phone = '';
  receiver_phone = '';
  private messageSub?: Subscription;
  showSendButton = false;
  private keyboardListeners: any[] = [];
  searchActive = false;
  searchQuery = '';
  searchMatches: HTMLElement[] = [];
  currentMatchIndex = 0;
  showSearchBar = false;
  searchTerm = '';
  searchText = '';
  matchedMessages: HTMLElement[] = [];
  currentSearchIndex = -1;
  isDateModalOpen = false;
  selectedDate: string = '';
  isDatePickerOpen = false;
  showDateModal = false;
  selectedMessages: any[] = [];
  imageToSend: any;
  alertController: any;
  recordingPhase: 'recording' | 'paused' | 'listening' = 'recording';

  // 🎤 Voice Recording State
  isRecording = false;
  recordingTime = '00:00';
  previewTotalDuration = '00:00';
  recordingSeconds = 0;
  recordingTimer: any;
  showRecordingPreview = false;
  isRecordingPaused = false;
  isAudioPlaying = false; // Track audio playback state separately
  recordingStartY = 0;
  recordingStartX = 0;
  hasSwipedUp = false;
  hasSwipedLeft = false;
  recordedAudioBlob: Blob | null = null;
  // Store all audio segments for strict flow
  audioSegments: Blob[] = [];
  // For playback, store combined blob
  get combinedAudioBlob(): Blob | null {
    if (!this.audioSegments.length) return null;
    return new Blob(this.audioSegments, { type: 'audio/aac' });
  }
  previewAudioElement: HTMLAudioElement | null = null;
  previewPlaybackSpeed = 1;
  private previewSpeeds = [1, 1.5, 2];
  private msgSpeeds = [1, 1.5, 2];
  private micPermissionStage: 'never-asked' | 'asked-denied' | 'granted' =
    'never-asked';
  isStoppingRecording = false;
 
  // � Audio Sending State
  isAudioSending = false;
  audioSendingProgress = 0;
  audioSendingMessage = 'Sending audio...';

  // �🔒 Minimum hold duration (300ms) before recording actually starts
  private micHoldStartTime: number = 0;
  private minHoldDuration: number = 300; // milliseconds
  private shouldStartRecording: boolean = false;

  // 🎵 Vibration Patterns for Recording Feedback
  private vibrationPatterns = {
    recordStart: 20, // 20ms - light tap on mic touch
    previewShow: [20, 10, 30], // pattern for swipe up (preview)
    recordingCancel: [50, 50, 50], // pattern for swipe left (cancel)
    recordingPause: 40, // 40ms - pause/resume feedback
    recordingResume: [15, 5, 15], // pattern for resume
  };

  private resizeHandler = () => this.setDynamicPadding();
  private intersectionObserver?: IntersectionObserver;

  roomId = '';
  // chatType: 'private' | 'group' = 'private';
  groupName = '';
  isGroup: any;
  receiver_name = '';
  sender_name = '';
  groupMembers: {
    user_id: string;
    name?: string;
    phone?: string;
    avatar?: string;
    role?: string;
    phone_number?: string;
    publicKeyHex?: string | null;
  }[] = [];
  attachments: any[] = [];
  selectedAttachment: any = null;
  showPreviewModal: boolean = false;
  attachmentPath: string = '';
  lastPressedMessage: any = null;
  longPressTimeout: any;
  msgTouchStartX = 0;
  msgTouchStartY = 0;
  isLongPressing = false;
  replyToMessage: IMessage | null = null;
  capturedImage = '';
  pinnedMessages: PinnedMessage[] = [];
  pinnedMessageDetails: any[] = []; // Array of message details
  currentPinnedIndex: number = 0; // Index of currently displayed pinned message
  private pinnedMessageSubscription: any;
  showMobilePinnedBanner: boolean = false;
  chatName: string = '';
  onlineCount: number = 0;

  showPopover = false;
  popoverEvent: any;
  isSending = false;

  isLoadingMore = false;
  private lastMessageKey: string | null = null;

  /** Cache for reply preview when replied message is not in loaded list (fetched from PouchDB/Firebase) */
  private replyPreviewCache = new Map<string, IMessage | null>();
  private loadingReplyIds = new Set<string>();

  receiverProfile: string | null = null;
  chatTitle: string | null = null;

  pfUsers: Array<{
    userId?: string | number;
    username?: string;
    phoneNumber?: string;
    avatar?: string | null;
    isOnPlatform?: boolean;
  }> = [];

  currentConv: IConversation | null = null;

  private pfUsersSub?: Subscription;

  // block state flags
  iBlocked = false;
  theyBlocked = false;

  // UI bubbles
  showBlockBubble = false;
  showUnblockBubble = false;
  private blockBubbleTimeout: any = null;

  // refs for listeners (so we can off them)
  private iBlockedRef: any = null;
  private theyBlockedRef: any = null;
  private _iBlockedLoaded = false;
  private _theyBlockedLoaded = false;

  // Typing indicator related
  private typingInput$ = new Subject<void>();
  private typingRxSubs: RxSub[] = [];
  typingCount = 0;
  typingFrom: string | null = null;
  private localTypingTimer: any = null;
  private typingUnsubscribe: (() => void) | null = null;
  typingUsers: {
    userId: string;
    name: string | null;
    avatar: string | null;
  }[] = [];

  private statusPollSub?: Subscription;
  public receiverOnline = false;
  public receiverLastSeen: string | null = null;

  // store unsubscribes for firebase onValue
  private onValueUnsubs: Array<() => void> = [];
  private emojiTargetMsg: Message | null = null;

  private allMessage: IMessage[] = [];
  chatType: string | null = null;

  receiverStatus: 'online' | 'offline' = 'offline';
  lastSeenTime: string = '';
  isReceiverTyping: boolean = false;
  private presenceSubscription?: Subscription;
  private typingTimeout: any;
  maxDate: string = new Date().toISOString();
  backUrl = '/home-screen';
  isOffline = false;

  // add subscription button
  // private backButtonSubscription: any;

  private isUserScrolling = false;
  private isNearBottom = true;
  private scrollThreshold = 150; // Distance from bottom to consider "near bottom"
  private isInitialLoad = true;
  private lastScrollTop = 0;
  private scrollDebounceTimer: any;

  private groupMembershipRef: any = null;
  private groupMembershipUnsubscribe: (() => void) | null = null;
  isChatMuted: boolean = false;
  canSendMessage: boolean = true;
  canPinMessage: boolean = true;
  enterToSend: boolean = true;

  constructor(
    private chatService: FirebaseChatService,
    private toastController: ToastController,
    private route: ActivatedRoute,
    private platform: Platform,
    private encryptionService: EncryptionService,
    private router: Router,
    private secureStorage: SecureStorageService,
    private fileUploadService: FileUploadService,
    private popoverCtrl: PopoverController,
    private toastCtrl: ToastController,
    private navCtrl: NavController,
    private FileService: FileSystemService,
    private modalCtrl: ModalController,
    private popoverController: PopoverController,
    private clipboard: Clipboard,
    private authService: AuthService,
    private service: ApiService,
    private sqliteService: SqliteService,
    private alertCtrl: AlertController,
    private typingService: TypingService,
    private renderer: Renderer2,
    private el: ElementRef,
    private zone: NgZone,
    private presence: PresenceService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private fcmService: FcmService,
    private animationCtrl: AnimationController,
    private chatPouchDb: ChatPouchDb,
    private networkService: NetworkService,
    private loadingCtrl: LoadingController,

    private actionSheetCtrl: ActionSheetController, // private toastCtrl: ToastController, // private modalCtrl: ModalController, // private firebaseChatService : FirebaseChatService
    private translate: TranslateService
  ) {}

  async ngOnInit() {
    Keyboard.setScroll({ isDisabled: false });

    this.senderId = this.authService.authData?.userId || '';
    this.sender_phone = this.authService.authData?.phone_number || '';
    this.sender_name = this.authService.authData?.name || '';
    // console.log("sender name is", this.sender_name)

    const nameFromQuery =
      this.route.snapshot.queryParamMap.get('receiver_name');
    this.receiverId = this.route.snapshot.queryParamMap.get('receiverId') || '';
    this.receiver_name =
      nameFromQuery ||
      (await this.secureStorage.getItem('receiver_name')) ||
      '';
    this.maxDate = new Date().toISOString();
    this.route.queryParamMap.subscribe((params) => {
      const from = params.get('from');

      if (from === 'archive') {
        this.backUrl = '/archieved-screen';
      } else {
        this.backUrl = '/home-screen';
      }
    });
    this.setupAppLifecycleHandlers();
  }

  onInputTyping() {
    this.onInputChange();
    this.typingInput$.next();
    if (this.localTypingTimer) {
      clearTimeout(this.localTypingTimer);
    }
    this.localTypingTimer = setTimeout(() => {
      this.stopTypingSignal();
    }, 2500);
  }

  onInputBlurTyping() {
    this.stopTypingSignal();
  }

  async openAppSettingsForNotifications(): Promise<void> {
    try {
      await NativeSettings.open({
        optionAndroid: AndroidSettings.ApplicationDetails,
        optionIOS: IOSSettings.AppNotification,
      });
    } catch (error) {
      console.error('❌ Error opening native settings:', error);
    }
  }

  // real audio

  async toggleListen() {
    const audio = this.previewAudio?.nativeElement;
    if (!audio) return;
    if (audio.paused) {
      await audio.play();
      this.recordingPhase = 'listening';
      this.isAudioPlaying = true;
    } else {
      audio.pause();
      this.recordingPhase = 'paused';
      this.isAudioPlaying = false;
      // On pause, show total duration
      this.recordingTime = this.previewTotalDuration;
    }
  }

  onPreviewTimeUpdate() {
    const audio = this.previewAudio?.nativeElement;
    // 🔒 CRITICAL FIX: Only update timer if preview is showing AND audio is actually playing
    if (!audio || !this.isAudioPlaying || !this.showRecordingPreview) return;
    const t = Math.floor(audio.currentTime);
    const min = Math.floor(t / 60);
    const sec = t % 60;
    this.recordingTime = `${this.padNumber(min)}:${this.padNumber(sec)}`;
  }

  // Called when preview audio metadata is loaded
  onPreviewLoadedMetadata() {
    const audio = this.previewAudio?.nativeElement;
    if (!audio) return;
    // only update if we have not already computed duration up front
    if (!this.previewTotalDuration || this.previewTotalDuration === '00:00') {
      const total = Math.floor(audio.duration);
      const min = Math.floor(total / 60);
      const sec = total % 60;
      this.previewTotalDuration = `${this.padNumber(min)}:${this.padNumber(
        sec
      )}`;
      // When loaded, show total duration if not playing
      if (!this.isAudioPlaying) {
        this.recordingTime = this.previewTotalDuration;
      }
    }
    // ✅ Trigger change detection for smooth UI updates
    this.cdr.detectChanges();
  }

  onPreviewEnded() {
    this.recordingPhase = 'paused';
    this.isAudioPlaying = false;
    // On end, show total duration
    this.recordingTime = this.previewTotalDuration;
    const audio = this.previewAudio?.nativeElement;
    if (audio) audio.currentTime = 0;
  }

  toggleMsgAudio(msg: any, audio: HTMLAudioElement) {
    if (!audio) return;

    if (msg._isPlaying) {
      audio.pause();
      msg._isPlaying = false;
      // 👇 pause handler will restore duration
    } else {
      // 🔒 CRITICAL FIX: Ensure audio metadata is loaded before playing
      if (!msg._duration || msg._duration === '00:00') {
        // Audio metadata not loaded yet, try to load it
        if (audio.readyState >= 2) {
          // HAVE_CURRENT_DATA or better - we can access duration
          this.onMsgAudioLoaded(msg, audio);
        } else {
          // Wait for metadata to load
          const handler = () => {
            this.onMsgAudioLoaded(msg, audio);
            audio.removeEventListener('loadedmetadata', handler);
          };
          audio.addEventListener('loadedmetadata', handler);
        }
      }

      // ▶️ play from current position
      audio.play();
      msg._isPlaying = true;
    }
  }
  onMsgAudioPaused(msg: any) {
    msg._isPlaying = false;

    // ✅ On pause → show TOTAL duration
    if (msg._duration) {
      msg._currentTime = msg._duration;
    }
  }

  toggleMsgSpeed(msg: any, audio: HTMLAudioElement) {
    const current = parseFloat(msg._speed || '1');
    const idx = this.msgSpeeds.indexOf(current);
    const next = this.msgSpeeds[(idx + 1) % this.msgSpeeds.length];

    audio.playbackRate = next;
    msg._speed = `${next}x`;
  }

  async onMsgAudioLoaded(msg: any, audio: HTMLAudioElement) {
    if (!audio) return;

    // 🔒 Handle both cases: loaded via event or called manually
    if (isNaN(audio.duration) || audio.duration === 0) {
      // Duration not available yet, don't set anything to avoid blinking
      return;
    }

    const total = Math.floor(audio.duration);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;

    // ✅ store total duration only if not already set
    const newDuration = `${this.padNumber(minutes)}:${this.padNumber(seconds)}`;
    if (!msg._duration || msg._duration !== newDuration) {
      msg._duration = newDuration;
      // ✅ show total duration BEFORE play
      msg._currentTime = msg._duration;
      // 🔒 CRITICAL FIX: Trigger change detection to update UI
      this.cdr.detectChanges();

      // persist duration to attachment so it survives reloads
      try {
        if (
          msg.attachment &&
          !msg.attachment.duration &&
          msg.msgId &&
          msg.roomId
        ) {
          msg.attachment.duration = newDuration;
          // update underlying store; use any to bypass private/type restrictions
          try {
            // @ts-ignore
            await (this.chatService as any).chatPouchDb.updateMessage(
              msg.roomId,
              msg.msgId,
              // @ts-ignore
              { attachment: msg.attachment }
            );
          } catch (_) {
            // swallow if persistence fails
          }
        }
      } catch (e) {
        console.warn('Unable to save audio duration to DB', e);
      }
    }
  }

  // 🎤 Initialize all audio messages after messages are rendered
  async ensureAudioMetadataLoaded() {
    // Delay to allow DOM to render
    await new Promise((r) => setTimeout(r, 500));

    // Find all audio elements in the DOM
    const audioElements = Array.from(
      document.querySelectorAll('audio')
    ) as HTMLAudioElement[];

    for (const audioElement of audioElements) {
      // 🔒 CRITICAL FIX: Set up loadedmetadata listener for each audio element
      // This ensures we capture the duration when it's available
      const handleLoadedMetadata = () => {
        if (!isNaN(audioElement.duration) && audioElement.duration > 0) {
          // Get the message from the closest parent
          const msgWrapper = audioElement.closest('[data-msg-key]');
          if (msgWrapper) {
            const msgKey = msgWrapper.getAttribute('data-msg-key');

            // Find the message in grouped messages
            for (const group of this.groupedMessages) {
              const msg = group.messages.find(
                (m) => (m as any).msgId === msgKey
              );
              if (msg && (msg as any).attachment?.type === 'audio') {
                this.onMsgAudioLoaded(msg as any, audioElement);
                break;
              }
            }
          }
        }
      };

      // ✅ Initialize audio messages with default duration if not already set
      const msgWrapper = audioElement.closest('[data-msg-key]');
      if (msgWrapper) {
        const msgKey = msgWrapper.getAttribute('data-msg-key');
        for (const group of this.groupedMessages) {
          const msg = group.messages.find((m) => (m as any).msgId === msgKey);
          if (msg && (msg as any).attachment?.type === 'audio') {
            // Ensure default values are set (only for playing state and speed)
            if (!(msg as any)._isPlaying !== undefined) {
              (msg as any)._isPlaying = false;
            }
            if (!(msg as any)._speed) {
              (msg as any)._speed = '1x';
            }
            break;
          }
        }
      }

      // Check if already loaded
      if (!isNaN(audioElement.duration) && audioElement.duration > 0) {
        handleLoadedMetadata();
      } else {
        // Wait for loadedmetadata event - don't force it
        if (!audioElement.hasAttribute('data-metadata-listener')) {
          audioElement.addEventListener(
            'loadedmetadata',
            handleLoadedMetadata,
            { once: true }
          );
          audioElement.setAttribute('data-metadata-listener', 'true');
        }
      }
    }
  }

  updateMsgAudioTime(msg: any, audio: HTMLAudioElement) {
    if (!audio || !audio.duration) return;

    // ⏱ current time
    const t = Math.floor(audio.currentTime);
    const min = Math.floor(t / 60);
    const sec = t % 60;

    msg._currentTime = `${this.padNumber(min)}:${this.padNumber(sec)}`;

    // 📊 waveform progress
    const totalDots = 28;
    const progress = audio.currentTime / audio.duration;
    msg._progressDots = Math.floor(progress * totalDots);
  }

  resetMsgAudio(msg: any) {
    msg._isPlaying = false;

    // ✅ After finish → back to total duration
    if (msg._duration) {
      msg._currentTime = msg._duration;
    }
  }

  togglePreviewSpeed() {
    const idx = this.previewSpeeds.indexOf(this.previewPlaybackSpeed);
    this.previewPlaybackSpeed =
      this.previewSpeeds[(idx + 1) % this.previewSpeeds.length];

    if (this.previewAudioElement) {
      this.previewAudioElement.playbackRate = this.previewPlaybackSpeed;
    }
  }

  seekPreviewAudio(event: any) {
    if (!this.previewAudioElement) return;
    this.previewAudioElement.currentTime = +event.target.value;
  }

  seekMsgAudio(event: Event, audio: HTMLAudioElement) {
    if (!audio) return;

    audio.pause();
    audio.currentTime = Number((event.target as HTMLInputElement).value);
    audio.play();
  }

  // ========================================
  // 🎤 VOICE RECORDING METHODS
  // ========================================

  onPreviewMicTap() {
    // 📳 Same subtle vibration as hold mic
    this.triggerVibration('recordStart');

    // Resume recording
    this.resumeRecording();
  }

  /* =========================
     🔊 VIBRATION FEEDBACK METHODS
     ========================= */

  /**
   * Trigger vibration pattern based on recording action
   * @param action - Type of vibration pattern to trigger
   */
  private async triggerVibration(
    action: keyof typeof this.vibrationPatterns
  ): Promise<void> {
    // Skip if not on capacitor or mobile
    if (!this.platform.is('capacitor')) return;

    try {
      const pattern = this.vibrationPatterns[action];

      // Use Capacitor Haptics for better control
      if (Array.isArray(pattern)) {
        // Complex pattern - use multiple triggers
        for (const duration of pattern) {
          await Haptics.impact({ style: ImpactStyle.Light });
          // Small delay between vibrations
          await new Promise((r) => setTimeout(r, 50));
        }
      } else {
        // Simple single vibration - use Web Vibration API as fallback
        if (navigator.vibrate) {
          navigator.vibrate(pattern);
        } else {
          // Capacitor Haptics fallback
          await Haptics.impact({ style: ImpactStyle.Light });
        }
      }
    } catch (error) {
      // Silently fail - haptics might not be available on all devices
      console.debug('Vibration not available:', error);
    }
  }

  /**
   * Trigger vibration for recording start
   */
  private vibrationRecordingStart(): void {
    this.triggerVibration('recordStart');
  }

  /**
   * Trigger vibration for showing preview (swipe up)
   */
  private vibrationPreviewShow(): void {
    this.triggerVibration('previewShow');
  }

  /**
   * Trigger vibration for canceling recording (swipe left)
   */
  private vibrationRecordingCancel(): void {
    this.triggerVibration('recordingCancel');
  }

  /**
   * Trigger vibration for pause
   */
  private vibrationRecordingPause(): void {
    this.triggerVibration('recordingPause');
  }

  /**
   * Trigger vibration for resume
   */
  private vibrationRecordingResume(): void {
    this.triggerVibration('recordingResume');
  }

  async startRecording(event?: any) {
    // 🔒 Record when the user touches down - start hold timer
    this.micHoldStartTime = Date.now();
    this.shouldStartRecording = false;

    // Check if already recording
    if (this.isRecording) return;

    // ------------------------------------------------
    // 🔐 Permission gate (SILENT + SMART)
    // ------------------------------------------------
    const hasPermission = await this.checkMicPermission();
    if (!hasPermission) {
      // If not granted, trigger system permission directly (no custom popup)
      const result = await VoiceRecorder.requestAudioRecordingPermission();
      if (result.value === true) {
        this.micPermissionStage = 'granted';
        // ✅ If user granted permission, they might have already released the button
        // So we set shouldStartRecording to true to allow it to start
        this.shouldStartRecording = true;
      } else {
        // If still denied after system request, show inline guidance (Toast)
        this.micPermissionStage = 'asked-denied';
        const toast = await this.toastCtrl.create({
          message: 'Microphone permission is required. Please enable it in settings.',
          duration: 4000,
          position: 'bottom',
          cssClass: 'mic-permission-toast',
          buttons: [
            {
              text: 'Settings',
              handler: () => {
                this.openAppSettingsForNotifications();
              }
            }
          ]
        });
        await toast.present();
        return;
      }
    } else {
      this.micPermissionStage = 'granted';
    }

    if (!(await this.checkNetworkBeforeAction('voice'))) {
      return;
    }

    // ------------------------------------------------
    // ⏰ Check minimum hold duration
    // ------------------------------------------------
    // Wait for minimum hold time before starting actual recording
    await new Promise((r) => setTimeout(r, this.minHoldDuration));

    // If user released before minimum hold, don't start recording
    if (
      !this.micHoldStartTime ||
      Date.now() - this.micHoldStartTime < this.minHoldDuration
    ) {
      return;
    }

    // User held long enough, proceed with recording
    this.shouldStartRecording = true;

    // ------------------------------------------------
    // 🧹 Safety: stop dangling recorder
    // ------------------------------------------------
    try {
      const status = await VoiceRecorder.getCurrentStatus();
      if (status.status === 'RECORDING') {
        await VoiceRecorder.stopRecording();
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch {}

    // ------------------------------------------------
    // 📍 Capture touch
    // ------------------------------------------------
    if (event?.touches?.[0]) {
      this.recordingStartY = event.touches[0].clientY;
      this.recordingStartX = event.touches[0].clientX;
    } else if (event?.clientX || event?.clientY) {
      this.recordingStartY = event.clientY;
      this.recordingStartX = event.clientX;
    }

    this.hasSwipedUp = false;
    this.hasSwipedLeft = false;

    // ------------------------------------------------
    // 🎙️ UI before recording
    // ------------------------------------------------
    this.isRecording = true;
    this.vibrationRecordingStart(); // 📳 Vibration feedback on mic touch
    // If starting fresh (not resuming), reset segments
    if (!this.isRecordingPaused) {
      this.audioSegments = [];
      this.recordingSeconds = 0;
      this.recordingTime = '00:00';
      // 🧹 CRITICAL FIX: Clear all preview state when starting new recording
      this.showRecordingPreview = false;
      this.isAudioPlaying = false;
      this.recordingPhase = 'recording';
      this.selectedAttachment = null;
      this.previewAudioElement = null;
      // Clean up old preview URLs
      if (this.selectedAttachment?.previewUrl) {
        URL.revokeObjectURL(this.selectedAttachment.previewUrl);
      }
    }
    this.startRecordingTimer();

    // ------------------------------------------------
    // 🎤 START RECORDING
    // ------------------------------------------------
    await VoiceRecorder.startRecording();
  }

  async checkMicPermission(): Promise<boolean> {
    const status = await VoiceRecorder.hasAudioRecordingPermission();
    return status.value === true;
  }


  onRecordingTouchMove(event: TouchEvent) {
    if (!this.isRecording) return;

    const touch = event.touches[0];
    const currentY = touch.clientY;
    const currentX = touch.clientX;

    const deltaY = this.recordingStartY - currentY; // Positive means swiped up
    const deltaX = currentX - this.recordingStartX; // Negative means swiped left

    // 👉 Swipe left (cancel recording completely, no preview)
    if (deltaX < -50 && !this.hasSwipedLeft) {
      this.hasSwipedLeft = true;
      this.hasSwipedUp = false;
      this.vibrationRecordingCancel(); // 📳 Vibration feedback on cancel gesture
      this.showRecordingPreview = false;
      this.cancelRecording();
      return;
    }

    // If we've already cancelled via left swipe, ignore further moves
    if (this.hasSwipedLeft) {
      return;
    }

    // 👆 Swipe up (show preview while still recording)
    if (deltaY > 50 && !this.hasSwipedUp) {
      this.hasSwipedUp = true;
      this.vibrationPreviewShow(); // 📳 Vibration feedback on preview gesture
      this.showRecordingPreview = true;
    } else if (deltaY <= 50 && this.hasSwipedUp) {
      // Swiped back down, hide preview
      this.hasSwipedUp = false;
      this.showRecordingPreview = false;
      // 🧹 CRITICAL FIX: Stop audio playback when preview is hidden
      if (this.previewAudioElement && !this.previewAudioElement.paused) {
        this.previewAudioElement.pause();
        this.isAudioPlaying = false;
        this.recordingPhase = 'paused';
      }
    }
  }

  async stopRecording() {
    // 🔒 Clear hold timer when user releases
    this.micHoldStartTime = 0;

    // 🔒 Prevent double execution (touchend + mouseup)
    if (this.isStoppingRecording) {
      console.log('stopRecording already in progress, ignoring duplicate call');
      return;
    }

    // 🔒 If user didn't hold long enough, cancel instead of stopping
    if (!this.shouldStartRecording) {
      console.log('Recording not started (insufficient hold time)');
      return;
    }

    if (!this.isRecording && !this.showRecordingPreview) {
      console.log('Not recording, ignoring stop call');
      return;
    }

    // 👆 If user swiped up → keep recording, just show preview
    if (this.hasSwipedUp || this.showRecordingPreview) {
      this.showRecordingPreview = true;
      return;
    }

    this.isStoppingRecording = true;

    try {
      console.log('Stopping recording...');

      // Stop UI timer first
      this.isRecording = false;
      this.stopRecordingTimer();

      const result = await VoiceRecorder.stopRecording();
      console.log('Recording stopped, processing result...');

      if (!result?.value?.recordDataBase64) {
        throw new Error('No audio data returned');
      }

      // Convert base64 to Blob
      const blob = this.base64ToBlob(
        result.value.recordDataBase64,
        'audio/aac'
      );
      // Append segment
      this.audioSegments.push(blob);
      // Generate metadata for preview
      const timestamp = Date.now();
      const fileName = `voice_${timestamp}.aac`;
      const previewUrl = URL.createObjectURL(this.combinedAudioBlob!);
      // 🛠 compute duration now so preview shows correct total immediately
      const durationSeconds = await getBlobDuration(this.combinedAudioBlob!);
      const durMin = Math.floor(durationSeconds / 60);
      const durSec = Math.floor(durationSeconds % 60);
      const durStr = `${this.padNumber(durMin)}:${this.padNumber(durSec)}`;
      this.previewTotalDuration = durStr;
      // if not playing yet, show the total right away
      if (!this.isAudioPlaying) {
        this.recordingTime = durStr;
      }

      this.selectedAttachment = {
        type: 'audio',
        blob: this.combinedAudioBlob!,
        fileName,
        mimeType: 'audio/aac',
        fileSize: this.combinedAudioBlob!.size,
        previewUrl,
        duration: durStr, // persist for later transfer
      };
      if (!this.hasSwipedUp) {
        await this.sendRecordingFromPreview();
        return;
      }
      this.hasSwipedUp = false;
      console.log('✅ Recording ready in inline preview (multi-segment)');
    } catch (error) {
      console.error('Error stopping recording:', error);

      this.isRecording = false;
      this.showRecordingPreview = false;
      this.stopRecordingTimer();

      const toast = await this.toastCtrl.create({
        message: 'Failed to save recording. Please try again.',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    } finally {
      this.isStoppingRecording = false;
    }
  }

  async stopRecordingAndGetFullAudio() {
    if (!this.isRecording) {
      return null;
    }

    try {
      // Stop recording and get the full audio
      this.isRecording = false;
      this.stopRecordingTimer();

      console.log('Stopping recording to get full audio...');
      const result = await VoiceRecorder.stopRecording();
      console.log('Recording stopped, processing result...');

      if (result?.value?.recordDataBase64) {
        // Convert base64 to blob
        const blob = this.base64ToBlob(
          result.value.recordDataBase64,
          'audio/aac'
        );

        console.log('Full audio blob created:', blob.size, 'bytes');
        return blob;
      } else {
        console.warn('No audio data received from recorder');
        return null;
      }
    } catch (error: any) {
      console.error('Error stopping recording:', error);
      return null;
    }
  }

  async resumeRecording() {
    if (this.recordingPhase !== 'paused') return;
    this.vibrationRecordingResume(); // 📳 Vibration feedback on resume
    this.isRecording = true;
    this.isRecordingPaused = false;
    this.recordingPhase = 'recording';
    this.startRecordingTimer();
    await VoiceRecorder.startRecording();
  }

  async pauseRecording() {
    if (!this.isRecording) return;
    this.vibrationRecordingResume(); // 📳 Vibration feedback on resume
    this.isRecordingPaused = true;
    this.stopRecordingTimer();
    // Stop recorder and store audio so far
    const result = await VoiceRecorder.stopRecording();
    if (!result?.value?.recordDataBase64) return;
    const blob = this.base64ToBlob(result.value.recordDataBase64, 'audio/aac');
    // Append segment
    this.audioSegments.push(blob);
    // Update preview to use combined audio
    const previewUrl = URL.createObjectURL(this.combinedAudioBlob!);

    // compute duration immediately so timer cell shows correct total
    const durationSeconds = await getBlobDuration(this.combinedAudioBlob!);
    const durMin = Math.floor(durationSeconds / 60);
    const durSec = Math.floor(durationSeconds % 60);
    const durStr = `${this.padNumber(durMin)}:${this.padNumber(durSec)}`;
    this.previewTotalDuration = durStr;
    if (!this.isAudioPlaying) {
      this.recordingTime = durStr;
    }

    this.selectedAttachment = {
      type: 'audio',
      blob: this.combinedAudioBlob!,
      fileName: `voice_${Date.now()}.aac`,
      mimeType: 'audio/aac',
      fileSize: this.combinedAudioBlob!.size,
      previewUrl,
      duration: durStr,
    };
    this.isRecording = false;
    this.recordingPhase = 'paused';
    this.showRecordingPreview = true;
  }

  async toggleAudioPlayback() {
    // If still recording, don't allow playback control
    if (this.isRecording) {
      return;
    }
    // Always use combined audio for playback
    if (this.selectedAttachment && this.selectedAttachment.type === 'audio') {
      // If previewAudioElement not set, set it up
      setTimeout(() => {
        const audioEl = document.querySelector(
          '.preview-audio-element'
        ) as HTMLAudioElement;
        if (audioEl) {
          this.previewAudioElement = audioEl;
          if (!audioEl.hasAttribute('data-listeners-added')) {
            audioEl.addEventListener('loadedmetadata', () =>
              this.onAudioLoaded()
            );
            audioEl.addEventListener('play', () => this.onAudioPlay());
            audioEl.addEventListener('pause', () => this.onAudioPause());
            audioEl.addEventListener('timeupdate', () =>
              this.onAudioTimeUpdate()
            );
            audioEl.addEventListener('ended', () => this.onAudioEnded());
            audioEl.setAttribute('data-listeners-added', 'true');
          }
          this.toggleAudioPlayback();
        }
      }, 100);
      return;
    }
    if (!this.isAudioPlaying) {
      try {
        await this.previewAudioElement?.play();
        this.isAudioPlaying = true;
        this.isRecordingPaused = false;
      } catch (error) {
        console.error('Error playing audio:', error);
      }
    } else {
      this.previewAudioElement?.pause();
      this.isAudioPlaying = false;
      this.isRecordingPaused = true;
    }
  }

  /**
   * Unified play/pause toggle for preview row.
   * - If still recording, pause/resume timer+UI (waveform/time).
   * - If recording already stopped, control audio playback.
   */

  onAudioPlay() {
    // Audio started playing
    this.isAudioPlaying = true;
    this.isRecordingPaused = false;
    // Update timer immediately when playback starts
    if (this.previewAudioElement) {
      const currentTime = Math.floor(this.previewAudioElement.currentTime);
      const minutes = Math.floor(currentTime / 60);
      const seconds = currentTime % 60;
      this.recordingTime = `${this.padNumber(minutes)}:${this.padNumber(
        seconds
      )}`;
    }
  }

  onAudioPause() {
    // Audio paused
    this.isAudioPlaying = false;
    this.isRecordingPaused = true;
  }

  onAudioLoaded() {
    // Audio metadata loaded - initialize playback state
    if (this.previewAudioElement) {
      const audioEl = document.querySelector(
        '.preview-audio-element'
      ) as HTMLAudioElement;
      if (audioEl && !this.previewAudioElement) {
        this.previewAudioElement = audioEl;
      }
      // Initialize as paused (not playing)
      this.isAudioPlaying = false;
      this.isRecordingPaused = true;
    }
  }

  onAudioTimeUpdate() {
    // Update timer based on audio playback position when in preview mode AND not recording
    // If recording, timer is already updating via startRecordingTimer()
    if (
      this.previewAudioElement &&
      this.showRecordingPreview &&
      !this.isRecording &&
      this.isAudioPlaying
    ) {
      const currentTime = Math.floor(this.previewAudioElement.currentTime);
      const minutes = Math.floor(currentTime / 60);
      const seconds = currentTime % 60;
      this.recordingTime = `${this.padNumber(minutes)}:${this.padNumber(
        seconds
      )}`;
    }
  }

  onAudioEnded() {
    // Audio playback finished
    this.isAudioPlaying = false;
    this.isRecordingPaused = true;
    if (this.previewAudioElement) {
      this.previewAudioElement.currentTime = 0;
      // Reset timer to start
      this.recordingTime = '00:00';
    }
  }

  async deleteRecordingPreview() {
    // Clean up audio element and stop playback
    if (this.previewAudioElement) {
      this.previewAudioElement.pause();
      this.previewAudioElement.currentTime = 0;
      this.previewAudioElement = null;
    }
    // Clean up preview URL
    if (this.selectedAttachment?.previewUrl) {
      URL.revokeObjectURL(this.selectedAttachment.previewUrl);
    }
    // Stop recording if still active
    if (this.isRecording) {
      try {
        await VoiceRecorder.stopRecording();
      } catch (e) {
        console.log('Error stopping recording on delete:', e);
      }
    }
    // 🧹 CRITICAL FIX: Reset ALL audio segments and state completely
    this.audioSegments = [];
    this.recordedAudioBlob = null;
    this.selectedAttachment = null;
    this.showRecordingPreview = false;
    this.isRecording = false;
    this.isRecordingPaused = false;
    this.isAudioPlaying = false;
    this.hasSwipedUp = false;
    this.hasSwipedLeft = false;
    this.recordingPhase = 'recording';
    this.stopRecordingTimer();
    this.recordingTime = '00:00';
    this.recordingSeconds = 0;
    this.previewTotalDuration = '00:00';
  }

  async sendRecordingFromPreview() {
    // 📤 Show loader
    this.isAudioSending = true;
    this.audioSendingProgress = 0;
    this.audioSendingMessage = 'Sending audio...';

    try {
      // ⛔ If recording still active → stop FIRST
      if (this.isRecording) {
        const result = await VoiceRecorder.stopRecording();
        if (result?.value?.recordDataBase64) {
          const blob = this.base64ToBlob(
            result.value.recordDataBase64,
            'audio/aac'
          );
          this.audioSegments.push(blob);
        }
        this.isRecording = false;
        this.stopRecordingTimer();
      }
      // ✅ STOP playback before sending
      const audio = this.previewAudio?.nativeElement;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      // Use combined audio for sending
      if (this.combinedAudioBlob) {
        this.audioSendingProgress = 20;
        this.audioSendingMessage = 'Preparing audio...';
        // compute duration again just before sending (should already be available)
        const durationSeconds = await getBlobDuration(this.combinedAudioBlob);
        const durMin = Math.floor(durationSeconds / 60);
        const durSec = Math.floor(durationSeconds % 60);
        const durStr = `${this.padNumber(durMin)}:${this.padNumber(durSec)}`;

        this.selectedAttachment = {
          type: 'audio',
          blob: this.combinedAudioBlob,
          fileName: `voice_${Date.now()}.aac`,
          mimeType: 'audio/aac',
          fileSize: this.combinedAudioBlob.size,
          previewUrl: URL.createObjectURL(this.combinedAudioBlob),
          duration: durStr,
        };
      }
      this.audioSendingProgress = 40;
      this.audioSendingMessage = 'Uploading...';
      await this.sendMessage();
      this.audioSendingProgress = 100;
      this.audioSendingMessage = 'Audio sent!';
      // 🧹 cleanup
      this.audioSegments = [];
      this.showRecordingPreview = false;
      this.isAudioPlaying = false;
      this.recordingPhase = 'paused';
      this.recordingTime = '00:00';
      this.selectedAttachment = null;

      // Hide loader after success
      await new Promise((r) => setTimeout(r, 500));
      this.isAudioSending = false;
    } catch (error) {
      console.error('❌ Error sending audio:', error);
      this.audioSendingMessage = 'Failed to send audio';
      this.audioSendingProgress = 0;

      // Hide loader after error
      await new Promise((r) => setTimeout(r, 1500));
      this.isAudioSending = false;
    }
  }

  async cancelRecording() {
    // 🔒 Clear hold timer
    this.micHoldStartTime = 0;
    this.shouldStartRecording = false;

    if (!this.isRecording && !this.showRecordingPreview) {
      console.log('Not recording, ignoring cancel call');
      return;
    }

    try {
      console.log('Canceling recording...');

      // Clean up preview if showing
      if (this.showRecordingPreview) {
        await this.deleteRecordingPreview();
        return;
      }

      this.isRecording = false;
      this.showRecordingPreview = false;
      this.isRecordingPaused = false;
      this.hasSwipedUp = false;
      this.hasSwipedLeft = false;
      this.stopRecordingTimer();

      await VoiceRecorder.stopRecording();
      console.log('✅ Recording canceled');
    } catch (error) {
      console.error('Error canceling recording:', error);
      // Force reset state even if cancel fails
      this.isRecording = false;
      this.showRecordingPreview = false;
      this.isRecordingPaused = false;
      this.hasSwipedUp = false;
      this.hasSwipedLeft = false;
      this.stopRecordingTimer();
    }
  }

  private startRecordingTimer() {
    this.recordingTimer = setInterval(() => {
      this.recordingSeconds++;
      const minutes = Math.floor(this.recordingSeconds / 60);
      const seconds = this.recordingSeconds % 60;
      this.recordingTime = `${this.padNumber(minutes)}:${this.padNumber(
        seconds
      )}`;
    }, 1000);
  }

  private stopRecordingTimer() {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
  }

  private padNumber(num: number): string {
    return num < 10 ? '0' + num : num.toString();
  }

  private base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  /////////////////////

  private async sendTypingSignal() {
    // ✅ Block Validation: Do not send typing signal if blocked
    if (this.iBlocked || this.theyBlocked) {
      return;
    }
    try {
      await this.typingService.startTyping(this.roomId, this.senderId);
      if (this.localTypingTimer) clearTimeout(this.localTypingTimer);
      this.localTypingTimer = setTimeout(() => {
        this.stopTypingSignal();
      }, 2500);
    } catch (err) {
      console.warn('startTyping failed', err);
    }
  }

  private async stopTypingSignal() {
    try {
      if (this.localTypingTimer) {
        clearTimeout(this.localTypingTimer);
        this.localTypingTimer = null;
      }
      await this.typingService.stopTyping(this.roomId, this.senderId);
    } catch (err) {
      console.warn('stopTyping failed', err);
    }
  }

  // async ionViewWillEnter() {
  //   try {
  //     // ✅ Phase 1: Basic setup
  //     this.isOffline = !this.networkService.isOnline.value;

  //     this.route.queryParamMap.subscribe((params) => {
  //       const from = params.get('from');
  //       if (from === 'archive') {
  //         this.backUrl = '/archieved-screen';
  //       } else {
  //         this.backUrl = '/home-screen';
  //       }
  //     });

  //     Keyboard.setScroll({ isDisabled: false });

  //        // 🔥 Ensure senderId is reliably set
  //     this.senderId = String(this.authService.authData?.userId ||
  //                      localStorage.getItem('userId') || '');
  //     this.sender_phone = this.authService.authData?.phone_number || '';
  //     this.sender_name = this.authService.authData?.name || '';

  //     // ✅ Phase 2: Get current chat
  //     this.currentConv = this.chatService.currentChat;
  //     const currentChat = this.chatService.currentChat;

  //     if (!currentChat) {
  //       console.error('❌ No current chat found in ionViewWillEnter!');
  //       return;
  //     }
  //         const params = this.route.snapshot.queryParams;
  //          const receiverIdFromParams = params['receiverId'] || '';

  //     this.roomId = currentChat?.roomId || '';
  //     this.replyPreviewCache.clear();
  //     this.loadingReplyIds.clear();
  //     this.chatType = currentChat?.type || '';

  //     // ✅ Phase 3: Load chat title
  //     if (this.chatType === 'private') {
  //       const parts: string[] = currentChat?.roomId?.split('_') || [];
  //       this.receiverId =
  //         parts.find((p: string | null) => p !== this.senderId) ??
  //         parts[parts.length - 1];
  //                // Ensure comparison is done as strings to avoid type mismatches
  //       if (this.senderId) {
  //         this.receiverId = parts.find((p: string | null) => String(p) !== String(this.senderId)) ?? receiverIdFromParams;
  //       } else {
  //         this.receiverId = receiverIdFromParams;
  //       }

  //       await this.loadChatTitleWithCache(currentChat);
  //       await this.loadAndCacheReceiverProfile();
  //     } else {
  //       this.receiverId = currentChat?.roomId || receiverIdFromParams;
  //       this.chatTitle = currentChat?.title || 'Group Chat';
  //       if (this.receiverId) {
  //         try {
  //           const { groupName, groupMembers } =
  //             await this.chatService.fetchGroupWithProfiles(this.receiverId);
  //           this.groupName = groupName;
  //           this.chatTitle = groupName;
  //           this.groupMembers = groupMembers;
  //           await this.chatPouchDb.cacheGroupDetails(this.receiverId, {
  //             meta: { title: groupName },
  //             members: groupMembers,
  //             adminIds: [],
  //           });
  //         } catch (err) {
  //           console.warn('Failed to fetch group with profiles', err);
  //           this.groupMembers = [];
  //         }
  //       }
  //       this.setupGroupMembershipListener();
  //     }

  //     // ✅ NEW: Move block check as early as possible to avoid UI lag
  //     if (this.chatType === 'private') {
  //       const parts: string[] = currentChat?.roomId?.split('_') || [];
  //       if (this.senderId) {
  //         this.receiverId = parts.find((p: string | null) => String(p) !== String(this.senderId)) ?? receiverIdFromParams;
  //       } else {
  //         this.receiverId = receiverIdFromParams;
  //       }
  //     } else {
  //       this.receiverId = currentChat?.roomId || receiverIdFromParams;
  //     }

  //     if (this.receiverId) {
  //       await this.checkIfBlocked();
  //     }

  //     this.replyPreviewCache.clear();

  //     try {
  //       this.cdr.detectChanges();
  //     } catch (e) {}

  //     // ════════════════════════════════════════════════════
  //     // ✅ Phase 3.5: PouchDB EMPTY CHECK — CORE NEW LOGIC
  //     // ════════════════════════════════════════════════════
  //     this.isCacheEmpty = false;
  //     this.batchesComplete = false;
  //     this.batchSub?.unsubscribe();

  //     try {
  //       const probe = await this.chatPouchDb.getMessagesPaginated(this.roomId, {
  //         limit: 1,
  //       });
  //       this.isCacheEmpty = !(probe?.messages?.length > 0);
  //     } catch {
  //       // check fail → safe side pe empty maano
  //       this.isCacheEmpty = true;
  //     }

  //     if (this.isCacheEmpty) {
  //       console.log('📭 PouchDB empty — loader dikhao, messages hide karo');
  //       // Loader ABHI dikhao (koi bhi message render se pehle)
  //       await this.showSyncingLoader();

  //       // 30s safety timeout — agar signal kabhi na aaye
  //       setTimeout(async () => {
  //         if (!this.batchesComplete) {
  //           console.warn('⚠️ 30s safety: force showing messages');
  //           this.batchesComplete = true;
  //           await this.hideSyncingLoader();
  //           try {
  //             this.cdr.detectChanges();
  //           } catch {}
  //         }
  //       }, 30000);
  //     } else {
  //       console.log('✅ PouchDB has data — instant show');
  //     }

  //     // allBatchesComplete$ listener — FirebaseChatService signal karega
  //     this.batchSub = this.chatService.allBatchesComplete$.subscribe(
  //       async (done) => {
  //         if (!done || this.batchesComplete) return;
  //         console.log('🎉 All batches done — showing messages');
  //         this.batchesComplete = true;
  //         if (this.isCacheEmpty) {
  //           await this.hideSyncingLoader();
  //           requestAnimationFrame(async () => {
  //             await this.scrollToBottomForBothViews();
  //           });
  //           try {
  //             this.cdr.detectChanges();
  //           } catch {}
  //         }
  //       }
  //     );

  //     // ════════════════════════════════════════════════════
  //     // ✅ Phase 4: Subscribe to messages (SAME AS BEFORE
  //     //             except one guard added after buildFlatListForView)
  //     // ════════════════════════════════════════════════════

  //     this.chatService.getMessages().subscribe(async (msgs: any) => {
  //       if (!msgs || msgs.length === 0) {
  //         this.groupedMessages = [];
  //         this.allMessage = [];
  //         if (this.isCacheEmpty && !this.batchesComplete) {
  //           this.batchesComplete = true;
  //           await this.hideSyncingLoader();
  //         }
  //         return;
  //       }

  //       const previousCount = this.allMessage.length;

  //       // ✅ FIX 2: Agar sirf deletedFor/status change hua hai (same count, same msgIds)
  //       // toh poora re-render mat karo — sirf affected messages in-place update karo
  //       // Yeh "delete for everyone" ke baad blink hone ka root cause tha
  //       if (previousCount > 0 && msgs.length === previousCount) {
  //         const prevIds = new Set(
  //           this.allMessage.map((m: IMessage) => m.msgId)
  //         );
  //         const newMsgArr = msgs as IMessage[];
  //         const sameIds = newMsgArr.every((m: IMessage) =>
  //           prevIds.has(m.msgId)
  //         );

  //         if (sameIds) {
  //           newMsgArr.forEach((newMsg: any) => {
  //             const existingIdx = this.allMessage.findIndex(
  //               (m: IMessage) => m.msgId === newMsg.msgId
  //             );
  //             if (existingIdx === -1) return;

  //             const existing = this.allMessage[existingIdx] as any;
  //             const preservedIsMe =
  //               existing.isMe !== undefined
  //                 ? existing.isMe
  //                 : String(existing.sender) === String(this.senderId);

  //             // ─────────────────────────────────────────────────────────
  //             // ✅ KEY FIX: Agar message abhi delete for everyone hua hai
  //             //    toh replyPreviewCache mein SIRF FLAG set karo.
  //             //    Cache entry DELETE MAT KARO aur dobara fetch MAT KARO.
  //             //    Warna Firebase se encrypted text aayega aur show hoga.
  //             // ─────────────────────────────────────────────────────────
  //             const isNowDeletedForEveryone =
  //               newMsg?.deletedFor?.everyone === true ||
  //               newMsg?.deletedForEveryone === true;

  //             if (isNowDeletedForEveryone) {
  //               const cached = this.replyPreviewCache.get(newMsg.msgId);
  //               if (cached !== undefined && cached !== null) {
  //                 // Cache entry mein sirf deleted flag update karo
  //                 // Text/content waise hi rakho — no re-render, no re-decrypt
  //                 this.replyPreviewCache.set(newMsg.msgId, {
  //                   ...(cached as any),
  //                   deletedFor: { everyone: true },
  //                   _deletedForEveryone: true,
  //                 } as any);
  //               } else {
  //                 // Cache mein tha hi nahi — sirf null set karo
  //                 // loadReplyPreview() trigger NAHI hoga kyunki cache mein entry hai
  //                 this.replyPreviewCache.set(newMsg.msgId, null);
  //               }
  //             }

  //             // In-place update
  //             this.allMessage[existingIdx] = {
  //               ...existing,
  //               isMe: preservedIsMe,
  //               deletedFor: newMsg.deletedFor ?? existing.deletedFor,
  //               status: newMsg.status ?? existing.status,
  //               receipts: newMsg.receipts ?? existing.receipts,
  //               reactions: newMsg.reactions ?? existing.reactions,
  //               isPinned: newMsg.isPinned ?? existing.isPinned,
  //               isEdit: newMsg.isEdit ?? existing.isEdit,
  //               text: newMsg.text ?? existing.text,
  //               translations: newMsg.translations ?? existing.translations,
  //             } as any;
  //           });

  //           try {
  //             this.groupedMessages = (await this.groupMessagesByDate(
  //               this.allMessage as any[]
  //             )) as any[];
  //           } catch {
  //             // fallback
  //           }
  //           this.buildFlatListForView();
  //           try {
  //             this.cdr.detectChanges();
  //           } catch {}
  //           return;
  //         }
  //       }

  //       // Normal flow — naye messages aaye hain ya count change hua hai
  //       try {
  //         this.groupedMessages = (await this.groupMessagesByDate(
  //           msgs as any[]
  //         )) as any[];
  //       } catch (error) {
  //         console.error('❌ Error grouping messages:', error);
  //         this.groupedMessages = [{ date: 'Today', messages: msgs }];
  //       }

  //       this.allMessage = msgs as IMessage[];
  //       for (const msg of msgs as any[]) {
  //         if (msg.expiresAt && !msg.isDisappeared) {
  //           this.scheduleMessageExpiry(msg);
  //         }
  //       }
  //       this.buildFlatListForView();

  //       // Guard — Cache empty tha toh UI mat dikhao
  //       if (this.isCacheEmpty && !this.batchesComplete) {
  //         console.log(
  //           `⏳ Cache was empty — ${msgs.length} msgs buffered, waiting for all batches...`
  //         );
  //         return;
  //       }

  //       const newCount = this.allMessage.length;
  //       const countDiff = newCount - previousCount;

  //       if (newCount > this.lastSyncedMessageCount) {
  //         this.lastSyncedMessageCount = newCount;
  //       }

  //       if (previousCount > 0 && countDiff > 0) {
  //         const isBackgroundLoad = countDiff >= 15;
  //         const isNewMessage = countDiff <= 5;

  //         if (isNewMessage && this.isNearBottom && !this.isInitialLoad) {
  //           console.log(`📨 New message - scrolling to bottom`);
  //           requestAnimationFrame(async () => {
  //             await this.scrollToBottomSmooth();
  //           });
  //         } else if (isBackgroundLoad) {
  //           console.log(`📚 Background loaded ${countDiff} messages`);
  //           if (this.isSyncing && countDiff < 20) {
  //             await this.hideSyncingLoader();
  //           }
  //           try {
  //             this.cdr.detectChanges();
  //           } catch (e) {}
  //         }
  //       }

  //       if (this.isInitialLoad && newCount > 0) {
  //         requestAnimationFrame(async () => {
  //           await this.scrollToBottomForBothViews();
  //         });
  //       }

  //       // Reply previews
  //       const loadedMsgIds = new Set(
  //         (msgs as IMessage[]).map((m: IMessage) => m.msgId)
  //       );
  //       for (const msg of msgs as IMessage[]) {
  //         const replyId = (msg as any).replyToMsgId;
  //         if (!replyId || loadedMsgIds.has(replyId)) continue;
  //         if (
  //           this.replyPreviewCache.has(replyId) ||
  //           this.loadingReplyIds.has(replyId)
  //         )
  //           continue;
  //         this.loadReplyPreview(replyId).catch((err) =>
  //           console.warn('Reply preview load failed:', err)
  //         );
  //       }

  //       // Pinned messages
  //       if (
  //         (!this.pinnedMessages || this.pinnedMessages.length === 0) &&
  //         msgs?.length > 0
  //       ) {
  //         const derived = (msgs || []).filter((m: any) => m?.isPinned === true);
  //         if (derived.length > 0) {
  //           this.pinnedMessages = derived.map((m: any) => ({
  //             roomId: this.roomId,
  //             messageId: m.msgId || m.key,
  //             pinnedBy: m.pinnedBy || null,
  //             pinnedAt: m.pinnedAt || Date.now(),
  //             scope: 'global' as 'global',
  //           }));
  //           this.findPinnedMessageDetails();
  //         }
  //       } else if (this.pinnedMessages.length > 0) {
  //         this.findPinnedMessageDetails();
  //       }

  //       // Mark as read
  //       for (const msg of msgs) {
  //         if (!msg.isMe) {
  //           this.chatService
  //             .markAsRead(msg.msgId)
  //             .catch((err: any) => console.warn('Mark as read failed:', err));
  //         }
  //       }
  //     });

  //     // ✅ Phase 5: Presence
  //     this.presenceSubscription = this.chatService.presenceChanges$.subscribe(
  //       () => {
  //         this.updateReceiverStatus();
  //       }
  //     );

  //     this.updateReceiverStatus();
  //     this.loadLanguages();
  //     await this.checkChatMuteStatus();
  //     await this.checkSendMessagePermission();
  //     await this.checkPinMessagePermission();

  //     this.receiverProfile =
  //       (currentChat as any).avatar || (currentChat as any).groupAvatar || null;

  //     if (this.roomId) {
  //       await this.fcmService.clearNotificationForRoom(this.roomId);
  //       await this.fcmService.clearNativeStoredMessages(this.roomId);
  //     }

  //     await this.loadVisiblePinnedMessages();
  //     await this.setupPinnedMessageListener();
  //      await this.checkIfBlocked(); // ✅ Check block status

  //     if (this.networkService.isOnline.value) {
  //       this.chatService
  //         .syncMessageStatusesRealtime(this.roomId)
  //         .catch((e) => console.warn('syncMessageStatusesRealtime error:', e));
  //     }

  //     this.ensureAudioMetadataLoaded();
  //   } catch (err) {
  //     console.warn('❌ ionViewWillEnter error:', err);
  //     this.batchesComplete = true;
  //     await this.hideSyncingLoader();
  //   }
  // }

  async ionViewWillEnter() {
    try {
      // ✅ Phase 1: Basic setup
      this.isOffline = !this.networkService.isOnline.value;

      // Load Enter-to-Send setting
      try {
        const raw = localStorage.getItem('settings.chats');
        if (raw) {
          const s = JSON.parse(raw);
          if (typeof s.enterToSend === 'boolean') {
            this.enterToSend = s.enterToSend;
          }
        }
      } catch {}

      this.route.queryParamMap.subscribe((params) => {
        const from = params.get('from');
        if (from === 'archive') {
          this.backUrl = '/archieved-screen';
        } else {
          this.backUrl = '/home-screen';
        }
      });

      Keyboard.setScroll({ isDisabled: false });

      this.senderId = this.authService.authData?.userId || '';
      this.sender_phone = this.authService.authData?.phone_number || '';
      this.sender_name = this.authService.authData?.name || '';

      // ✅ Phase 2: Get current chat — with query params fallback
      let currentChat = this.chatService.currentChat;

      if (!currentChat) {
        console.warn('⚠️ currentChat null — building from query params...');

        const receiverIdFromQuery =
          this.route.snapshot.queryParamMap.get('receiverId') || '';
        const nameFromQuery =
          this.route.snapshot.queryParamMap.get('receiver_name') || '';
        // ✅ FIX: Derive chat type from receiverId prefix when not explicitly provided
        let chatTypeFromQuery: string =
          this.route.snapshot.queryParamMap.get('chatType') || '';
        if (!chatTypeFromQuery) {
          if (receiverIdFromQuery.startsWith('group_')) chatTypeFromQuery = 'group';
          else if (receiverIdFromQuery.startsWith('community_')) chatTypeFromQuery = 'community';
          else chatTypeFromQuery = 'private';
        }

        if (!receiverIdFromQuery) {
          console.error('❌ No receiverId in query params either!');
          return;
        }

        const chatFromParams: any = {
          roomId: receiverIdFromQuery,
          type: chatTypeFromQuery,
          title: nameFromQuery || receiverIdFromQuery,
          members: [],
          avatar: null,
        };

        // ✅ Open chat so messages load properly
        await this.chatService.openChat(chatFromParams);
        currentChat = this.chatService.currentChat;

        if (!currentChat) {
          console.error('❌ openChat failed, currentChat still null!');
          return;
        }
      }

      this.currentConv = this.chatService.currentChat;

      this.roomId = currentChat?.roomId || '';
      this.replyPreviewCache.clear();
      this.loadingReplyIds.clear();
      this.chatType = currentChat?.type || '';

      // ✅ Phase 3: Load chat title
      if (this.chatType === 'private') {
        const parts: string[] = currentChat?.roomId?.split('_') || [];
        this.receiverId =
          parts.find((p: string | null) => p !== this.senderId) ??
          parts[parts.length - 1];
        await this.loadChatTitleWithCache(currentChat);
        await this.loadAndCacheReceiverProfile();
      } else {
        this.receiverId = currentChat?.roomId || '';

        // ✅ Query param se bhi title lo as fallback
        const nameFromQuery =
          this.route.snapshot.queryParamMap.get('receiver_name');
        this.chatTitle = currentChat?.title || nameFromQuery || 'Group Chat';

        // ✅ Avatar immediately set karo
        this.receiverProfile =
          (currentChat as any)?.avatar ||
          (currentChat as any)?.groupAvatar ||
          null;

        // ✅ currentConv avatar bhi set karo
        if (this.currentConv && this.receiverProfile) {
          (this.currentConv as any).avatar = this.receiverProfile;
        }

        if (this.receiverId) {
          try {
            const { groupName, groupMembers } =
              await this.chatService.fetchGroupWithProfiles(this.receiverId);
            this.groupName = groupName;

            if (
              groupName &&
              groupName !== 'Unknown Group' &&
              groupName !== 'Error Loading Group'
            ) {
              this.chatTitle = groupName;
              if (this.currentConv) {
                this.currentConv.title = groupName;
              }
            }

            this.groupMembers = groupMembers;

            // ✅ Avatar fetch karo agar abhi tak nahi mila
            if (!this.receiverProfile) {
              try {
                const dpResponse: any = await firstValueFrom(
                  this.service.getGroupDp(this.receiverId)
                );
                if (dpResponse?.group_dp_url) {
                  this.receiverProfile = dpResponse.group_dp_url;
                  if (this.currentConv) {
                    (this.currentConv as any).avatar = this.receiverProfile;
                  }
                }
              } catch (err) {
                console.warn('Failed to fetch group DP:', err);
              }
            }

            await this.chatPouchDb.cacheGroupDetails(this.receiverId, {
              meta: { title: this.chatTitle },
              members: groupMembers,
              adminIds: [],
            });
          } catch (err) {
            console.warn('Failed to fetch group with profiles', err);
            this.groupMembers = [];
          }
          this.setupGroupMembershipListener();
        }

        try {
          this.cdr.detectChanges();
        } catch (e) {}
      }

      try {
        this.cdr.detectChanges();
      } catch (e) {}

      // ════════════════════════════════════════════════════
      // ✅ Phase 3.5: PouchDB EMPTY CHECK
      // ════════════════════════════════════════════════════
      this.isCacheEmpty = false;
      this.batchesComplete = false;
      this.batchSub?.unsubscribe();

      try {
        const probe = await this.chatPouchDb.getMessagesPaginated(this.roomId, {
          limit: 1,
        });
        this.isCacheEmpty = !(probe?.messages?.length > 0);
      } catch {
        this.isCacheEmpty = true;
      }

      if (this.isCacheEmpty) {
        console.log('📭 PouchDB empty — loader dikhao, messages hide karo');
        await this.showSyncingLoader();

        setTimeout(async () => {
          if (!this.batchesComplete) {
            console.warn('⚠️ 30s safety: force showing messages');
            this.batchesComplete = true;
            await this.hideSyncingLoader();
            try {
              this.cdr.detectChanges();
            } catch {}
          }
        }, 30000);
      } else {
        console.log('✅ PouchDB has data — instant show');
      }

      // allBatchesComplete$ listener
      this.batchSub = this.chatService.allBatchesComplete$.subscribe(
        async (done) => {
          if (!done || this.batchesComplete) return;
          console.log('🎉 All batches done — showing messages');
          this.batchesComplete = true;
          if (this.isCacheEmpty) {
            await this.hideSyncingLoader();
            requestAnimationFrame(async () => {
              await this.scrollToBottomForBothViews();
            });
            try {
              this.cdr.detectChanges();
            } catch {}
          }
        }
      );

      // ════════════════════════════════════════════════════
      // ✅ Phase 4: Subscribe to messages
      // ════════════════════════════════════════════════════
      this.chatService.getMessages().subscribe(async (msgs: any) => {
        if (!msgs || msgs.length === 0) {
          this.groupedMessages = [];
          this.allMessage = [];
          if (this.isCacheEmpty && !this.batchesComplete) {
            this.batchesComplete = true;
            await this.hideSyncingLoader();
          }
          return;
        }

        const previousCount = this.allMessage.length;

        if (previousCount > 0 && msgs.length === previousCount) {
          const prevIds = new Set(
            this.allMessage.map((m: IMessage) => m.msgId)
          );
          const newMsgArr = msgs as IMessage[];
          const sameIds = newMsgArr.every((m: IMessage) =>
            prevIds.has(m.msgId)
          );

          if (sameIds) {
            newMsgArr.forEach((newMsg: any) => {
              const existingIdx = this.allMessage.findIndex(
                (m: IMessage) => m.msgId === newMsg.msgId
              );
              if (existingIdx === -1) return;

              const existing = this.allMessage[existingIdx] as any;
              const preservedIsMe =
                existing.isMe !== undefined
                  ? existing.isMe
                  : String(existing.sender) === String(this.senderId);

              const isNowDeletedForEveryone =
                newMsg?.deletedFor?.everyone === true ||
                newMsg?.deletedForEveryone === true;

              if (isNowDeletedForEveryone) {
                const cached = this.replyPreviewCache.get(newMsg.msgId);
                if (cached !== undefined && cached !== null) {
                  this.replyPreviewCache.set(newMsg.msgId, {
                    ...(cached as any),
                    deletedFor: { everyone: true },
                    _deletedForEveryone: true,
                  } as any);
                } else {
                  this.replyPreviewCache.set(newMsg.msgId, null);
                }
              }

              this.allMessage[existingIdx] = {
                ...existing,
                isMe: preservedIsMe,
                deletedFor: newMsg.deletedFor ?? existing.deletedFor,
                status: newMsg.status ?? existing.status,
                receipts: newMsg.receipts ?? existing.receipts,
                reactions: newMsg.reactions ?? existing.reactions,
                isPinned: newMsg.isPinned ?? existing.isPinned,
                isEdit: newMsg.isEdit ?? existing.isEdit,
                text: newMsg.text ?? existing.text,
                translations: newMsg.translations ?? existing.translations,
              } as any;
            });

            try {
              this.groupedMessages = (await this.groupMessagesByDate(
                this.allMessage as any[]
              )) as any[];
            } catch {}
            this.buildFlatListForView();
            try {
              this.cdr.detectChanges();
            } catch {}
            return;
          }
        }

        try {
          this.groupedMessages = (await this.groupMessagesByDate(
            msgs as any[]
          )) as any[];
        } catch (error) {
          console.error('❌ Error grouping messages:', error);
          this.groupedMessages = [{ date: 'Today', messages: msgs }];
        }

        this.allMessage = msgs as IMessage[];
        for (const msg of msgs as any[]) {
          if (msg.expiresAt && !msg.isDisappeared) {
            this.scheduleMessageExpiry(msg);
          }
        }
        this.buildFlatListForView();

        if (this.isCacheEmpty && !this.batchesComplete) {
          console.log(
            `⏳ Cache was empty — ${msgs.length} msgs buffered, waiting for all batches...`
          );
          return;
        }

        const newCount = this.allMessage.length;
        const countDiff = newCount - previousCount;

        if (newCount > this.lastSyncedMessageCount) {
          this.lastSyncedMessageCount = newCount;
        }

        if (previousCount > 0 && countDiff > 0) {
          const isBackgroundLoad = countDiff >= 15;
          const isNewMessage = countDiff <= 5;

          if (isNewMessage && this.isNearBottom && !this.isInitialLoad) {
            requestAnimationFrame(async () => {
              await this.scrollToBottomSmooth();
            });
          } else if (isBackgroundLoad) {
            if (this.isSyncing && countDiff < 20) {
              await this.hideSyncingLoader();
            }
            try {
              this.cdr.detectChanges();
            } catch (e) {}
          }
        }

        if (this.isInitialLoad && newCount > 0) {
          requestAnimationFrame(async () => {
            await this.scrollToBottomForBothViews();
          });
        }

        const loadedMsgIds = new Set(
          (msgs as IMessage[]).map((m: IMessage) => m.msgId)
        );
        for (const msg of msgs as IMessage[]) {
          const replyId = (msg as any).replyToMsgId;
          if (!replyId || loadedMsgIds.has(replyId)) continue;
          if (
            this.replyPreviewCache.has(replyId) ||
            this.loadingReplyIds.has(replyId)
          )
            continue;
          this.loadReplyPreview(replyId).catch((err) =>
            console.warn('Reply preview load failed:', err)
          );
        }

        if (
          (!this.pinnedMessages || this.pinnedMessages.length === 0) &&
          msgs?.length > 0
        ) {
          const derived = (msgs || []).filter((m: any) => m?.isPinned === true);
          if (derived.length > 0) {
            this.pinnedMessages = derived.map((m: any) => ({
              roomId: this.roomId,
              messageId: m.msgId || m.key,
              pinnedBy: m.pinnedBy || null,
              pinnedAt: m.pinnedAt || Date.now(),
              scope: 'global' as 'global',
            }));
            this.findPinnedMessageDetails();
          }
        } else if (this.pinnedMessages.length > 0) {
          this.findPinnedMessageDetails();
        }

        for (const msg of msgs) {
          if (!msg.isMe) {
            this.chatService
              .markAsRead(msg.msgId)
              .catch((err: any) => console.warn('Mark as read failed:', err));
          }
        }
      });

      // ✅ Phase 5: Presence
      this.presenceSubscription = this.chatService.presenceChanges$.subscribe(
        () => {
          this.updateReceiverStatus();
        }
      );

   this.updateReceiverStatus();
    this.loadLanguages();
    await this.checkChatMuteStatus();
    await this.checkSendMessagePermission();
    await this.checkPinMessagePermission();

    // ✅ Silent permission check on focus
    this.checkMicPermission().then(granted => {
      this.micPermissionStage = granted ? 'granted' : 'never-asked';
    });

    // ✅ Avatar one more time at end (group ke liye currentConv update ho chuka hoga)
    if (this.chatType !== 'private') {
      this.receiverProfile =
        (this.currentConv as any)?.avatar ||
        (currentChat as any)?.avatar ||
        (currentChat as any)?.groupAvatar ||
        this.receiverProfile ||
        null;
    } else {
      this.receiverProfile =
        (currentChat as any).avatar ||
        (currentChat as any).groupAvatar ||
        null;
    }

    if (this.roomId) {
      await this.fcmService.clearNotificationForRoom(this.roomId);
      await this.fcmService.clearNativeStoredMessages(this.roomId);
    }

    await this.loadVisiblePinnedMessages();
    await this.setupPinnedMessageListener();
    await this.checkIfBlocked();

    if (this.networkService.isOnline.value) {
      this.chatService
        .syncMessageStatusesRealtime(this.roomId)
        .catch((e) => console.warn('syncMessageStatusesRealtime error:', e));
    }

    this.ensureAudioMetadataLoaded();

    // ✅ Silent re-check of mic permission on focus (handles return from settings)
    const hasPermission = await this.checkMicPermission();
    if (hasPermission) {
      this.micPermissionStage = 'granted';
    }
  } catch (err) {
    console.warn('❌ ionViewWillEnter error:', err);
    this.batchesComplete = true;
    await this.hideSyncingLoader();
  }
}

  /**
   * 🔄 Show syncing loader and start sync
   */
  private async startSyncingWithLoader(): Promise<void> {
    try {
      if (this.isSyncing) {
        console.log('⚠️ Sync already in progress');
        return;
      }

      this.isSyncing = true;
      this.syncStartTime = Date.now();

      // ✅ Show loading controller
      await this.showSyncingLoader();

      // ✅ Start sync
      await this.chatService.syncMessageStatusesRealtime(this.roomId);

      // ✅ Check if we need to resume from last sync point
      const currentMessageCount = this.allMessage.length;

      if (currentMessageCount > 0 && currentMessageCount < 200) {
        // ✅ Resume sync from last loaded message
        console.log(`🔄 Resuming sync from ${currentMessageCount} messages`);

        // Continue loading older messages until we reach 200
        while (
          this.chatService.hasMoreMessages &&
          this.allMessage.length < 200 &&
          this.isSyncing
        ) {
          await this.chatService.loadOlderMessages(this.roomId);

          // Small delay to prevent overwhelming PouchDB
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      // ✅ Hide loader after sync completes
      await this.hideSyncingLoader();
    } catch (error) {
      console.error('❌ Sync error:', error);
      await this.hideSyncingLoader();
    }
  }

  /**
   * 🔄 Show syncing loading controller
   */
  private async showSyncingLoader(): Promise<void> {
    try {
      // ✅ Don't show multiple loaders
      if (this.loadingController) {
        return;
      }

      this.loadingController = await this.loadingCtrl.create({
        message: 'Syncing messages with server...',
        spinner: 'circular', // ✅ Use built-in circular spinner
        cssClass: 'custom-syncing-loader',
        backdropDismiss: false,
        keyboardClose: false,
        duration: 0, // Don't auto-dismiss
      });

      await this.loadingController.present();
      console.log('✅ Syncing loader shown');
    } catch (error) {
      console.error('❌ Error showing syncing loader:', error);
    }
  }

  /**
   * 🔄 Hide syncing loading controller
   */
  private async hideSyncingLoader(): Promise<void> {
    try {
      this.isSyncing = false;

      if (this.loadingController) {
        await this.loadingController.dismiss();
        this.loadingController = undefined;

        const syncDuration = Date.now() - this.syncStartTime;
        console.log(`✅ Syncing completed in ${syncDuration}ms`);
        console.log(`📊 Total messages loaded: ${this.lastSyncedMessageCount}`);
      }
    } catch (error) {
      console.error('❌ Error hiding syncing loader:', error);
      this.loadingController = undefined;
    }
  }

  /**
   * 🔄 Handle app pause/resume (for app closure detection)
   */
  private setupAppLifecycleHandlers(): void {
    // ✅ Listen for app going to background
    this.platform.pause.subscribe(() => {
      console.log('📱 App going to background');

      // Save current sync state
      if (this.isSyncing && this.roomId) {
        localStorage.setItem('lastSyncRoomId', this.roomId);
        localStorage.setItem(
          'lastSyncMessageCount',
          String(this.lastSyncedMessageCount)
        );
        console.log(
          `💾 Saved sync state: ${this.lastSyncedMessageCount} messages for room ${this.roomId}`
        );
      }
    });

    // ✅ Listen for app resuming
    this.platform.resume.subscribe(async () => {
      console.log('📱 App resumed');

      // Check if we need to resume sync
      const lastRoomId = localStorage.getItem('lastSyncRoomId');
      const lastCount = parseInt(
        localStorage.getItem('lastSyncMessageCount') || '0'
      );

      if (lastRoomId === this.roomId && lastCount > 0 && lastCount < 200) {
        console.log(`🔄 Resuming sync from ${lastCount} messages`);
        await this.startSyncingWithLoader();
      }

      // Clear saved state
      localStorage.removeItem('lastSyncRoomId');
      localStorage.removeItem('lastSyncMessageCount');
    });
  }

  /**
   * 🔥 UPDATED: Load receiver profile and cache it
   */
  private async loadAndCacheReceiverProfile(): Promise<void> {
    try {
      if (!this.receiverId) {
        console.warn('⚠️ No receiverId found');
        return;
      }

      // 🔥 STEP 1: Try to load from cache first (for offline)
      const cachedProfile = await this.chatPouchDb.getCachedUserProfile(
        this.receiverId
      );

      if (cachedProfile) {
        console.log('✅ Loaded receiver profile from cache:', cachedProfile);
        this.receiverProfile = cachedProfile.avatar || null;

        // Chat title is already loaded in loadChatTitleWithCache(), no need to override
      }

      // 🔥 STEP 2: If online, fetch fresh data and update cache
      if (this.networkService.isOnline.value) {
        this.service.getUserProfilebyId(this.receiverId).subscribe({
          next: async (res: any) => {
            const profile = {
              userId: this.receiverId,
              avatar: res?.profile || null,
              phone: res?.phone_number || this.receiver_phone,
              name: res?.name || null,
              // Don't override resolvedName here - it's managed by loadChatTitleWithCache()
              lastUpdated: Date.now(),
            };

            // Update UI
            this.receiverProfile = profile.avatar;

            // Get existing cached profile to preserve resolvedName
            const existingCached =
              (await this.chatPouchDb.getCachedUserProfile(this.receiverId)) ||
              {};

            // Cache the profile, preserving resolvedName
            await this.chatPouchDb.cacheUserProfile(this.receiverId, {
              ...profile,
              resolvedName: existingCached.resolvedName || this.chatTitle, // Preserve existing or use current
            });

            console.log('✅ Cached receiver profile:', profile);
          },
          error: async (err) => {
            console.error('❌ Error loading user profile:', err);

            // If online fetch fails, fallback to cache
            if (cachedProfile) {
              this.receiverProfile = cachedProfile.avatar || null;
            }
          },
        });
      }
    } catch (error) {
      console.error('❌ Error in loadAndCacheReceiverProfile:', error);
    }
  }

  /**
   * 🔥 UPDATED: Load chat title with cache support
   */
  private async loadChatTitleWithCache(currentChat: any): Promise<void> {
    try {
      if (this.chatType !== 'private' || !this.receiverId) {
        // For group/community, use service resolution directly
        this.chatTitle = this.chatService.getResolvedChatTitle(currentChat);
        console.log('✅ Chat title resolved (group):', this.chatTitle);
        return;
      }

      // 🔥 STEP 1: Try loading from cache FIRST (for offline)
      const cachedProfile = await this.chatPouchDb.getCachedUserProfile(
        this.receiverId
      );

      if (cachedProfile?.resolvedName) {
        this.chatTitle = cachedProfile.resolvedName;
        console.log('✅ Chat title loaded from cache:', this.chatTitle);

        // If offline, stop here - don't try to resolve again
        if (!this.networkService.isOnline.value) {
          return;
        }
      }

      // 🔥 STEP 2: If online, resolve fresh title
      if (this.networkService.isOnline.value) {
        // Resolve the title using the service
        const resolvedTitle =
          this.chatService.getResolvedChatTitle(currentChat);

        // Update UI
        this.chatTitle = resolvedTitle;
        console.log('✅ Chat title resolved (online):', this.chatTitle);

        // 🔥 STEP 3: Cache the resolved title (only if not null)
        if (resolvedTitle) {
          await this.cacheChatTitle(resolvedTitle);
        }
      } else if (!this.chatTitle) {
        // Offline and no cache - fallback to basic title or phone number
        this.chatTitle = currentChat?.title || this.receiverId;
        console.log(
          '⚠️ Using fallback title (offline, no cache):',
          this.chatTitle
        );
      }
    } catch (error) {
      console.error('❌ Error loading chat title:', error);
      this.chatTitle = currentChat?.title || this.receiverId;
    }
  }
  /**
   * 🔥 NEW: Cache the resolved chat title
   */
  private async cacheChatTitle(resolvedTitle: string): Promise<void> {
    try {
      if (!this.receiverId || !resolvedTitle) return;

      // Get existing cached profile or create new one
      const existingProfile =
        (await this.chatPouchDb.getCachedUserProfile(this.receiverId)) || {};

      // Merge with resolved title
      await this.chatPouchDb.cacheUserProfile(this.receiverId, {
        ...existingProfile,
        resolvedName: resolvedTitle,
        lastUpdated: Date.now(),
      });

      console.log('✅ Cached chat title:', resolvedTitle);
    } catch (error) {
      console.error('❌ Error caching chat title:', error);
    }
  }

  private async checkNetworkBeforeAction(
    action:
      | 'send'
      | 'attachment'
      | 'camera'
      | 'voice'
      | 'forward'
      | 'delete'
      | 'reply'
      | 'reaction'
      | 'pin'
      | 'unpin'
      | 'edit'
      | 'clearChat'
      | 'translate'
      | 'mute'
      | 'unmute'
      | 'exitGroup'
      | 'addMembers'
  ): Promise<boolean> {
    const currentStatus = this.networkService.isOnline.value;

    // Update local state immediately
    this.isOffline = !currentStatus;
    this.cdr.detectChanges();

    console.log(
      `🔍 Real-time network check for "${action}": ${
        currentStatus ? 'ONLINE' : 'OFFLINE'
      }`
    );

    // If offline, show alert and return false
    if (!currentStatus) {
      await this.showOfflineAlert(action);
      return false;
    }

    return true;
  }

  /**
   * Show offline alert for chatting screen actions
   */
  private async showOfflineAlert(
    action:
      | 'send'
      | 'attachment'
      | 'camera'
      | 'voice'
      | 'forward'
      | 'delete'
      | 'reply'
      | 'reaction'
      | 'pin'
      | 'unpin'
      | 'edit'
      | 'clearChat'
      | 'translate'
      | 'mute'
      | 'unmute'
      | 'exitGroup'
      | 'addMembers'
  ) {
    let message = '';

    switch (action) {
      case 'send':
        message =
          'You are offline. Please connect to the internet to send messages.';
        break;

      case 'attachment':
        message =
          'You are offline. Please connect to the internet to send attachments.';
        break;

      case 'camera':
        message =
          'You are offline. Please connect to the internet to capture photos.';
        break;

      case 'voice':
        message =
          'You are offline. Please connect to the internet to send voice messages.';
        break;

      case 'forward':
        message =
          'You are offline. Please connect to the internet to forward messages.';
        break;

      case 'delete':
        message =
          'You are offline. Please connect to the internet to delete messages.';
        break;

      case 'reply':
        message =
          'You are offline. Please connect to the internet to reply to messages.';
        break;

      case 'reaction':
        message =
          'You are offline. Please connect to the internet to add reactions.';
        break;

      case 'pin':
        message =
          'You are offline. Please connect to the internet to pin messages.';
        break;

      case 'unpin':
        message =
          'You are offline. Please connect to the internet to unpin messages.';
        break;

      case 'edit':
        message =
          'You are offline. Please connect to the internet to edit messages.';
        break;

      case 'clearChat':
        message =
          'You are offline. Please connect to the internet to clear chat.';
        break;

      case 'translate':
        message =
          'You are offline. Please connect to the internet to translate messages.';
        break;

      case 'mute':
        message =
          'You are offline. Please connect to the internet to mute notifications.';
        break;

      case 'unmute':
        message =
          'You are offline. Please connect to the internet to unmute notifications.';
        break;

      case 'exitGroup':
        message =
          'You are offline. Please connect to the internet to exit group.';
        break;

      case 'addMembers':
        message =
          'You are offline. Please connect to the internet to add members.';
        break;
    }

    const alert = await this.alertCtrl.create({
      header: "You're Offline",
      message,
      buttons: [
        {
          text: 'OK',
          role: 'cancel',
        },
      ],
    });

    await alert.present();
  }

  /**
   * Get display name for a sender - returns device contact name if available, otherwise phone number
   */

  getSenderDisplayName(msg: any): string {
    if (String(msg.sender) === String(this.senderId)) return 'You';

    const groupMember = this.groupMembers.find(
      (m) => String(m.user_id) === String(msg.sender)
    );

    if (!groupMember) return msg.sender_name || msg.sender || '';

    const rawPhone = (
      groupMember.phone_number ||
      groupMember.phone ||
      ''
    ).replace(/\D/g, '');
    const normalizedPhone = rawPhone.slice(-10);

    const platformUsers = this.chatService.currentUsers;
    const puMatch = platformUsers.find(
      (u) => String(u.userId) === String(msg.sender)
    );
    if ((puMatch as any)?.device_contact_name) {
      return (puMatch as any).device_contact_name;
    }

    if (normalizedPhone && normalizedPhone.length === 10) {
      const deviceContacts = this.chatService.currentDeviceContacts;
      const dcMatch = deviceContacts.find((dc: any) => {
        const dcPhone = (dc.phoneNumber || '').replace(/\D/g, '').slice(-10);
        return dcPhone === normalizedPhone;
      });
      if (dcMatch?.username) return dcMatch.username;
    }

    if (normalizedPhone && normalizedPhone.length === 10) {
      return (
        groupMember.phone_number ||
        groupMember.phone ||
        msg.sender_name ||
        msg.sender ||
        ''
      );
    }

    return groupMember.name || msg.sender_name || msg.sender || '';
  }

  setupGroupMembershipListener() {
    if (!this.roomId || this.chatType !== 'group') return;

    const db = getDatabase();

    // Clean up old listener if exists
    if (this.groupMembershipUnsubscribe) {
      this.groupMembershipUnsubscribe();
    }

    // Listen to the members node of this group
    this.groupMembershipRef = ref(db, `groups/${this.roomId}/members`);

    this.groupMembershipUnsubscribe = onValue(
      this.groupMembershipRef,
      (snapshot) => {
        this.zone.run(async () => {
          const members = snapshot.val() || {};

          // Check if current user is still a member
          const wasCurrentUserMember = this.isCurrentUserMember();
          const isStillMember = !!members[this.senderId];

          console.log('🔄 Real-time membership check:', {
            senderId: this.senderId,
            wasCurrentUserMember,
            isStillMember,
            currentMembers: Object.keys(members),
          });

          // Update currentConv.members to trigger isCurrentUserMember() change
          if (this.currentConv) {
            this.currentConv.members = Object.keys(members);
          }

          // If membership status changed from member to non-member
          if (wasCurrentUserMember && !isStillMember) {
            console.log('⚠️ User removed from group - hiding keyboard');

            // Show toast notification
            // this.zone.run(async () => {
            //   const toast = await this.toastCtrl.create({
            //     message: 'You are no longer a member of this group',
            //     duration: 3000,
            //     color: 'warning',
            //     position: 'top',
            //   });
            //   await toast.present();
            // });

            // Force UI update
            try {
              this.cdr.detectChanges();
              await this.chatService.removeMemberFromConvLocal(
                this.roomId,
                this.senderId
              );
              await this.chatService.stopRoomListener();
            } catch (e) {
              console.warn('detectChanges error:', e);
            }
          }
        });
      },
      (error) => {
        console.error('❌ Error listening to group membership:', error);
      }
    );
  }

  isCurrentUserMember(): boolean {
    if (this.chatType !== 'group') {
      return true;
    }

    if (
      !this.currentConv?.members ||
      !Array.isArray(this.currentConv.members)
    ) {
      return false;
    }
    return this.currentConv.members.includes(this.senderId);
  }

  async ionViewWillLeave() {
    try {
      // await this.chatService.closeChat();
      console.log('Chat is closed');
      this.clearAllExpiryTimers();

      this.isCacheEmpty = false;
      this.batchesComplete = false;
      this.batchSub?.unsubscribe();

      // ✅ NEW: Clean up block listeners properly
      const db = getDatabase();
      if (this.iBlockedRef) off(this.iBlockedRef);
      if (this.theyBlockedRef) off(this.theyBlockedRef);
      this.iBlockedRef = null;
      this.theyBlockedRef = null;

      // ✅ NEW: Clean up group membership listener when leaving page
      if (this.groupMembershipUnsubscribe) {
        this.groupMembershipUnsubscribe();
        this.groupMembershipUnsubscribe = null;
      }
    } catch (error) {
      console.error('error in closing chat', error);
    }
  }

  async onBack() {
    try {
      await this.chatService.closeChat();
      console.log('✅ Chat closed from onBack()');
    } catch (error) {
      console.error('❌ Error in onBack():', error);
    } finally {
      this.navCtrl.navigateBack(this.backUrl);
    }
  }

  /**
   * Compute message status from receipts (read > delivered > sent)
   * Prioritizes receipts over msg.status for accurate real-time status
   */
  private computeMessageStatus(msg: IMessage): UIMessageStatus {
    if (!msg) return null;

    // ✅ Priority 1: Check receipts for read status (highest priority)
    if (msg.receipts?.read?.status === true) {
      const readBy = msg.receipts.read.readBy || [];
      // Check if all recipients have read (for group chats)
      if (readBy.length > 0) {
        return 'read';
      }
    }

    // ✅ Priority 2: Check receipts for delivered status
    if (msg.receipts?.delivered?.status === true) {
      const deliveredTo = msg.receipts.delivered.deliveredTo || [];
      if (deliveredTo.length > 0) {
        return 'delivered';
      }
    }

    // ✅ Priority 3: Fallback to msg.status (sent/pending/failed)
    if (
      msg.status === 'read' ||
      msg.status === 'delivered' ||
      msg.status === 'sent' ||
      msg.status === 'pending' ||
      msg.status === 'failed'
    ) {
      return msg.status as UIMessageStatus;
    }

    // Default: return sent if message exists but no status
    return msg.status === 'failed'
      ? 'failed'
      : msg.status === 'pending'
      ? 'pending'
      : 'sent';
  }

  /**
   * Find a message by msgId across all rooms in this._messages$.value (Map<roomId, IMessage[]>)
   * and return an IconDescriptor according to the canonical status.
   *
   * Accepts only msgId (string).
   */
  getStatusIconDescriptorByMsgId(msgId: string): IconDescriptor | null {
    if (!msgId || !this.allMessage.length) return null;

    // const messagesMap: Map<string, IMessage[]> = (this._messages$ as any).value;
    // if (!messagesMap || !(messagesMap instanceof Map)) return null;

    // linear search across rooms — fine for small-to-medium stores. See note below.
    // for (const [, list] of messagesMap.entries()) {
    const msg = this.allMessage.find((m) => m.msgId === msgId);
    if (!msg?.isMe) {
      return null;
    }

    const status = this.computeMessageStatus(msg);

    switch (status) {
      case 'read':
        return {
          name: 'checkmark-done-outline',
          cls: 'status-icon read',
          title: 'Read',
        };
      case 'delivered':
        return {
          name: 'checkmark-done-outline',
          cls: 'status-icon delivered',
          title: 'Delivered',
        };
      case 'sent':
        return {
          name: 'checkmark-outline',
          cls: 'status-icon sent',
          title: 'Sent',
        };
      case 'pending':
        return {
          name: 'time-outline',
          cls: 'status-icon pending',
          title: 'Pending',
        };
      case 'failed':
        return {
          name: 'alert-circle-outline',
          cls: 'status-icon failed',
          title: 'Failed',
        };
      default:
        return null;
    }
  }

  //typing status get
  getTypingStatusForConv(roomId: string) {
    return this.chatService.getTypingStatusForRoom(roomId);
  }

  updateReceiverStatus() {
    const currentChat = this.chatService.currentChat;
    if (!currentChat) return;

    // ✅ If blocked, clear and stop presence updates for private chats
    if (currentChat.type === 'private' && this.theyBlocked) {
      this.receiverStatus = 'offline';
      this.isReceiverTyping = false;
      this.lastSeenTime = '';
      return;
    }
    // Get receiver ID
    let receiverId: string;
    if (currentChat.type === 'private') {
      const parts = currentChat.roomId.split('_');
      receiverId =
        parts.find((p) => p !== this.chatService['senderId']) ?? parts[1];
    } else {
      // For groups, handle multiple typing statuses
      this.updateGroupTypingStatus();
      return;
    }

    // Get presence status
    const presence = this.chatService.getPresenceStatus(receiverId);

    if (presence) {
      this.receiverStatus = presence.isOnline ? 'online' : 'offline';
      this.isReceiverTyping = presence.isTyping || false;

      if (!presence.isOnline && presence.lastSeen) {
        this.lastSeenTime = this.formatLastSeenDetailed(presence.lastSeen);
      }

      // 🔥 NEW: Cache presence data for offline use
      this.cachePresenceData(receiverId, presence);
    } else {
      // 🔥 NEW: Try loading from cache if online data not available
      this.loadPresenceFromCache(receiverId);
    }
  }

  /**
   * 🔥 NEW: Cache presence data
   */
  private async cachePresenceData(
    receiverId: string,
    presence: any
  ): Promise<void> {
    try {
      if (!this.networkService.isOnline.value) return; // Only cache when online

      await this.chatPouchDb.cachePresence(receiverId, {
        isOnline: presence.isOnline || false,
        lastSeen: presence.lastSeen || null,
      });

      console.log('✅ Cached presence for:', receiverId);
    } catch (error) {
      console.error('❌ Error caching presence:', error);
    }
  }

  /**
   * 🔥 NEW: Load presence from cache
   */
  private async loadPresenceFromCache(receiverId: string): Promise<void> {
    try {
      const cachedPresence = await this.chatPouchDb.getPresence(receiverId);

      if (cachedPresence) {
        this.receiverStatus = cachedPresence.isOnline ? 'online' : 'offline';

        if (!cachedPresence.isOnline && cachedPresence.lastSeen) {
          this.lastSeenTime = this.formatLastSeenDetailed(
            cachedPresence.lastSeen
          );
        }

        console.log('✅ Loaded presence from cache:', cachedPresence);
      }
    } catch (error) {
      console.error('❌ Error loading presence from cache:', error);
    }
  }

  updateGroupTypingStatus() {
    const currentChat = this.chatService.currentChat;
    if (!currentChat || currentChat.type !== 'group') return;

    const members = currentChat.members || [];
    let typingCount = 0;

    members.forEach((memberId) => {
      if (memberId === this.chatService['senderId']) return;
      const presence = this.chatService.getPresenceStatus(memberId);
      if (presence?.isTyping) {
        typingCount++;
      }
    });

    this.typingCount = typingCount;
  }

  showCompressedActions = false;

  onMessageInput(event: any) {
    const text = event.target.value || '';
    this.messageText = text;

    const isTyping = text.trim().length > 0;

    // Toggle send button
    this.showSendButton = isTyping;

    // 🔥 Compress icons while typing
    this.showCompressedActions = isTyping;
    // console.log('this.showCompressedActions', this.showCompressedActions);

    if (isTyping) {
      this.chatService.setTypingStatus(true);

      // Reset timeout
      if (this.typingTimeout) {
        clearTimeout(this.typingTimeout);
      }

      // Auto-clear after 2 seconds of no typing
      this.typingTimeout = setTimeout(() => {
        this.chatService.setTypingStatus(false);
      }, 2000);
    } else {
      this.chatService.setTypingStatus(false);
    }
  }

  async openMoreActions() {
    const buttons: any[] = [
      {
        text: 'Attachment',
        icon: 'attach',
        handler: () => this.pickAttachment(),
      },
      {
        text: 'Camera',
        icon: 'camera',
        handler: () => this.openCamera(),
      },
    ];

    if (this.currentConv?.type !== 'group') {
      buttons.push({
        text: 'Translate',
        icon: 'language',
        handler: () => this.toggleTranslationOptions(),
      });
    }

    buttons.push({
      text: 'Cancel',
      role: 'cancel',
    });

    const sheet = await this.actionSheetCtrl.create({
      buttons: buttons,
    });

    await sheet.present();
  }

  formatLastSeen(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return new Date(timestamp).toLocaleDateString();
  }

  // Alternative: More detailed format
  formatLastSeenDetailed(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();

    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    // ⏱ Just now (0–1 min)
    if (diffMinutes < 1) {
      return 'Last seen just now';
    }

    // ⏱ Minutes ago (1–59 min)
    if (diffMinutes < 60) {
      return `Last seen ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    }

    // ⏱ Hours ago (same day)
    if (diffHours < 24 && date.toDateString() === now.toDateString()) {
      return `Last seen today at ${date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    }

    // ⏱ Yesterday
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    if (date.toDateString() === yesterday.toDateString()) {
      return `Last seen yesterday at ${date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    }

    // 📅 Older (DD/MM/YYYY at HH:mm)
    return `Last seen ${date.toLocaleDateString(
      'en-GB'
    )} at ${date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }

  loadReceiverProfile() {
    this.receiverId = this.route.snapshot.queryParamMap.get('receiverId') || '';
    if (!this.receiverId) return;

    if (this.chatType === 'group') {
      this.service.getGroupDp(this.receiverId).subscribe({
        next: (res: any) => {
          this.receiverProfile = res?.group_dp_url || null;
        },
        error: (err) => {
          console.error('❌ Error loading group profile:', err);
          this.receiverProfile = null;
        },
      });
    } else {
      this.service.getUserProfilebyId(this.receiverId).subscribe({
        next: (res: any) => {
          this.receiverProfile = res?.profile || null;
        },
        error: (err) => {
          console.error('❌ Error loading user profile:', err);
          this.receiverProfile = null;
        },
      });
    }
  }

  setDefaultAvatar(event: Event) {
    (event.target as HTMLImageElement).src = 'assets/images/user.jfif';
  }

  async openOptions(ev: any) {
    const popover = await this.popoverCtrl.create({
      component: ChatOptionsPopoverComponent,
      event: ev,
      translucent: true,
      componentProps: {
        chatType: this.chatType,
        isMuted: this.isChatMuted, // ✅ Pass current mute status
      },
    });

    await popover.present();

    const { data } = await popover.onDidDismiss();
    if (data?.selected) {
      this.handleOption(data.selected);
    }
  }

  async handleOption(option: string) {
    if (option === 'Search') {
      this.showSearchBar = true;
      setTimeout(() => {
        const input = document.querySelector('ion-input');
        (input as HTMLIonInputElement)?.setFocus();
      }, 100);
      return;
    }

    if (option === 'View Contact') {
      const queryParams: any = {
        receiverId: this.receiverId,
        receiver_phone: this.receiver_phone,
        receiver_name: this.receiver_name,
        isGroup: false,
      };
      this.router.navigate(['/profile-screen'], { queryParams });
      return;
    }

    // ✅ NEW: Clear Chat Option
    if (option === 'Clear Chat') {
      //console.log("clear chat calls");
      await this.handleClearChat();
      return;
    }

    if (option === 'Mute Notifications') {
      await this.muteCurrentChat();
      return;
    }

    if (option === 'Unmute Notifications') {
      await this.unmuteCurrentChat();
      return;
    }

    if (option === 'Report' || option === 'Report Group') {
      await this.reportUser();
      return;
    }

    const groupId = this.receiverId;
    const userId = await this.secureStorage.getItem('userId');

    if (option === 'Group Info') {
      const queryParams: any = {
        receiverId: this.chatType === 'group' ? this.roomId : this.receiverId,
        receiver_phone: this.receiver_phone,
        receiver_name: this.receiver_name,
        isGroup: this.chatType === 'group',
      };
      this.router.navigate(['/profile-screen'], { queryParams });
    } else if (option === 'Add Members') {
      if (!(await this.checkNetworkBeforeAction('addMembers'))) {
        return;
      }
      const memberPhones = this.groupMembers.map((member) => member.phone);
      this.router.navigate(['/add-members'], {
        queryParams: {
          groupId: groupId,
          members: JSON.stringify(memberPhones),
        },
      });
    } else if (option === 'Exit Group') {
      if (!(await this.checkNetworkBeforeAction('exitGroup'))) {
        return;
      }
      if (!this.roomId || !this.senderId) {
        console.error('Missing groupId or userId');
        return;
      }

      const db = getDatabase();
      const groupId = this.roomId;
      const userId = this.senderId;

      // 🟢 Confirmation Alert
      const alert = await this.alertCtrl.create({
        header: 'Exit Group',
        message: 'Are you sure you want to exit this group?',
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          {
            text: 'Exit',
            handler: async () => {
              try {
                await this.chatService.leaveGroup(groupId);

                // ✅ Toast + navigate
                const toast = await this.toastCtrl.create({
                  message: 'You exited the group',
                  duration: 2000,
                  color: 'medium',
                });
                toast.present();

                this.router.navigate(['/home-screen']);
              } catch (error) {
                console.error('Error exiting group:', error);
                const toast = await this.toastCtrl.create({
                  message: 'Failed to exit group',
                  duration: 2000,
                  color: 'danger',
                });
                toast.present();
              }
            },
          },
        ],
      });

      await alert.present();
    }
  }

  private async handleClearChat() {
    if (!(await this.checkNetworkBeforeAction('clearChat'))) {
      return;
    }
    try {
      const userId = await this.authService.authData?.userId;
      //console.log("userID sdsdfgsdgsdfgertgryrtytr", userId);
      if (!userId) return;

      // Show confirmation alert
      const alert = await this.alertCtrl.create({
        header: 'Clear Chat',
        message:
          'Are you sure you want to clear all messages? This cannot be undone.',
        buttons: [
          {
            text: 'Cancel',
            role: 'cancel',
          },
          {
            text: 'Clear',
            handler: async () => {
              await this.clearChatMessages(userId);
            },
          },
        ],
      });

      await alert.present();
    } catch (error) {
      console.error('Error in handleClearChat:', error);
    }
  }

  // ✅ Clear Chat Implementation (Soft Delete)
  private async clearChatMessages(userId: string) {
    //this is for private
    try {
      const roomId =
        this.chatType === 'group'
          ? this.receiverId
          : this.getRoomId(userId, this.receiverId);

      if (!roomId) {
        console.error('Room ID not found');
        return;
      }

      await this.chatService.clearChatForUser(roomId);

      this.messages = [];
      this.allMessage = [];
      this.groupedMessages = [];
      this.flatListForView = [];
      try {
        this.cdr.detectChanges();
      } catch {}

      // Show success toast
      const toast = await this.toastCtrl.create({
        message: 'Chat cleared successfully',
        duration: 2000,
        color: 'success',
      });
      await toast.present();
    } catch (error) {
      console.error('❌ Error clearing chat:', error);

      const toast = await this.toastCtrl.create({
        message: 'Failed to clear chat',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  async checkChatMuteStatus() {
    // console.log('1111111111111', this.roomId, this.senderId);
    try {
      if (!this.roomId || !this.senderId) {
        this.isChatMuted = false;
        return;
      }

      this.isChatMuted = await this.chatService.isChatMuted(
        this.roomId,
        this.senderId
      );

      console.log(
        `🔕 Chat mute status: ${this.isChatMuted ? 'Muted' : 'Unmuted'}`
      );
    } catch (error) {
      console.error('❌ Error checking chat mute status:', error);
      this.isChatMuted = false;
    }
  }

  async checkSendMessagePermission(): Promise<void> {
    try {
      if (this.chatType !== 'group' || !this.roomId) {
        this.canSendMessage = true;
        return;
      }

      this.canSendMessage = await this.chatService.checkGroupPermission(
        this.roomId,
        'sendMessages'
      );

      console.log(`💬 Send message permission: ${this.canSendMessage}`);
    } catch (err) {
      console.warn('checkSendMessagePermission error:', err);
      this.canSendMessage = true; // fail open
    }
  }

  async checkPinMessagePermission(): Promise<void> {
    try {
      if (this.chatType !== 'group' || !this.roomId) {
        this.canPinMessage = true;
        return;
      }
      // editGroupSettings permission reuse karo —
      // jab admin ne editing lock kiya hai tab non-admin pin nahi kar sakta
      this.canPinMessage = await this.chatService.checkGroupPermission(
        this.roomId,
        'editGroupSettings'
      );
      console.log(`📌 Pin message permission: ${this.canPinMessage}`);
    } catch (err) {
      console.warn('checkPinMessagePermission error:', err);
      this.canPinMessage = true; // fail open
    }
  }

  /**
   * Mute the current chat with confirmation alert
   */
  async muteCurrentChat() {
    if (!(await this.checkNetworkBeforeAction('mute'))) {
      return;
    }
    try {
      if (!this.roomId || !this.senderId) {
        this.showToast('Unable to mute chat', 'warning');
        return;
      }

      // ✅ Show confirmation alert
      const alert = await this.alertCtrl.create({
        header: 'Mute Notifications',
        message: 'You will no longer receive notifications for this chat.',
        buttons: [
          {
            text: 'Cancel',
            role: 'cancel',
          },
          {
            text: 'Mute',
            handler: async () => {
              try {
                // ✅ Call Firebase service to mute
                await this.chatService.muteChat(this.roomId, this.senderId);

                // ✅ Update local state
                this.isChatMuted = true;

                // ✅ Show success toast
                this.showToast('Chat muted', 'success');

                // ✅ Force UI update
                this.cdr.detectChanges();
              } catch (error) {
                console.error('❌ Error muting chat:', error);
                this.showToast('Failed to mute chat', 'error');
              }
            },
          },
        ],
      });

      await alert.present();
    } catch (error) {
      console.error('❌ Error showing mute confirmation:', error);
      this.showToast('Failed to show confirmation', 'error');
    }
  }

  /**
   * Unmute the current chat with confirmation alert
   */
  async unmuteCurrentChat() {
    if (!(await this.checkNetworkBeforeAction('unmute'))) {
      return;
    }
    try {
      if (!this.roomId || !this.senderId) {
        this.showToast('Unable to unmute chat', 'warning');
        return;
      }

      // ✅ Show confirmation alert
      const alert = await this.alertCtrl.create({
        header: 'Unmute Notifications',
        message: 'You will start receiving notifications for this chat again.',
        buttons: [
          {
            text: 'Cancel',
            role: 'cancel',
          },
          {
            text: 'Unmute',
            handler: async () => {
              try {
                // ✅ Call Firebase service to unmute
                await this.chatService.unmuteChat(this.roomId, this.senderId);

                // ✅ Update local state
                this.isChatMuted = false;

                // ✅ Show success toast
                this.showToast('Chat unmuted', 'success');

                // ✅ Force UI update
                this.cdr.detectChanges();
              } catch (error) {
                console.error('❌ Error unmuting chat:', error);
                this.showToast('Failed to unmute chat', 'error');
              }
            },
          },
        ],
      });

      await alert.present();
    } catch (error) {
      console.error('❌ Error showing unmute confirmation:', error);
      this.showToast('Failed to show confirmation', 'error');
    }
  }

  /**
   * Toggle mute status for current chat
   */
  async toggleChatMute() {
    if (this.isChatMuted) {
      await this.unmuteCurrentChat();
    } else {
      await this.muteCurrentChat();
    }
  }

  async checkIfBlocked() {
    this.senderId = this.authService.authData?.userId || this.senderId;
    if (!this.senderId || !this.receiverId) return;

    const db = getDatabase();

    try {
      if (this.iBlockedRef) off(this.iBlockedRef);
      if (this.theyBlockedRef) off(this.theyBlockedRef);
    } catch (e) {
      /* ignore */
    }

    this.iBlockedRef = ref(
      db,
      `usersBlocks/${this.senderId}/${this.receiverId}`
    );
    this.theyBlockedRef = ref(
      db,
      `usersBlocks/${this.receiverId}/${this.senderId}`
    );

    const unsubA = onValue(this.iBlockedRef, (snap) => {
      this.zone.run(() => {
        const val = snap.val();
        const isBlocked = val?.status === 'active';

        if (this._iBlockedLoaded && isBlocked !== this.iBlocked) {
          // Block/Unblock bubbles removed as per user request
        }
        this.iBlocked = isBlocked;
        this._iBlockedLoaded = true;
        this.cdr.detectChanges(); // ✅ Ensure UI update
      });
    });

    const unsubB = onValue(this.theyBlockedRef, (snap) => {
      this.zone.run(() => {
        const val = snap.val();
        const isBlocked = val?.status === 'active';

        this.theyBlocked = isBlocked;
        this._theyBlockedLoaded = true;

        // ✅ If blocked, clear presence info
        if (isBlocked) {
          this.receiverStatus = 'offline';
          this.isReceiverTyping = false;
          this.lastSeenTime = '';
        }
        this.cdr.detectChanges(); // ✅ Ensure UI update
      });
    });

    this.onValueUnsubs.push(() => {
      try {
        unsubA();
      } catch (e) {}
    });
    this.onValueUnsubs.push(() => {
      try {
        unsubB();
      } catch (e) {}
    });
  }

  async unblockFromChat() {
    try {
      this.zone.run(async () => {
        await this.chatService.unblockUserByUserId(this.receiverId);

        this.iBlocked = false; // ✅ Immediately update state
        this.showBlockBubble = false;
        this.showUnblockBubble = true;
        clearTimeout(this.blockBubbleTimeout);
        this.blockBubbleTimeout = setTimeout(() => {
          this.zone.run(() => {
            this.showUnblockBubble = false;
            this.cdr.detectChanges(); // ✅ UI update inside timeout
          });
        }, 3000);
        this.cdr.detectChanges(); // ✅ Immediate UI update
      });
    } catch (err) {
      console.error('Unblock failed', err);
      const t = await this.toastCtrl.create({
        message: 'Failed to unblock',
        duration: 2000,
        color: 'danger',
      });
      t.present();
    }
  }

  async deleteChat() {
    try {
      await this.chatService.clearChatForUser(this.roomId);
      const t = await this.toastCtrl.create({
        message: 'Chat deleted',
        duration: 1500,
        color: 'danger',
      });
      t.present();
      setTimeout(() => this.router.navigate(['/home-screen']), 800);
    } catch (err) {
      console.error('deleteChat failed', err);
      const t = await this.toastCtrl.create({
        message: 'Failed to delete chat',
        duration: 2000,
        color: 'danger',
      });
      t.present();
    }
  }

  onSearchInput() {
    const elements = Array.from(
      document.querySelectorAll('.message-text')
    ) as HTMLElement[];

    elements.forEach((el) => {
      el.innerHTML = el.textContent || '';
      el.style.backgroundColor = 'transparent';
    });

    if (!this.searchText.trim()) {
      this.matchedMessages = [];
      this.currentSearchIndex = -1;
      return;
    }

    const regex = new RegExp(`(${this.escapeRegExp(this.searchText)})`, 'gi');

    this.matchedMessages = [];

    elements.forEach((el) => {
      const originalText = el.textContent || '';
      if (regex.test(originalText)) {
        const highlightedText = originalText.replace(
          regex,
          `<mark style="background: yellow;">$1</mark>`
        );
        el.innerHTML = highlightedText;
        this.matchedMessages.push(el);
      }
    });

    this.currentSearchIndex = this.matchedMessages.length ? 0 : -1;

    if (this.currentSearchIndex >= 0) {
      this.matchedMessages[this.currentSearchIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }

  navigateSearch(direction: 'up' | 'down') {
    if (!this.matchedMessages.length) return;
    if (direction === 'up') {
      this.currentSearchIndex =
        (this.currentSearchIndex - 1 + this.matchedMessages.length) %
        this.matchedMessages.length;
    } else {
      this.currentSearchIndex =
        (this.currentSearchIndex + 1) % this.matchedMessages.length;
    }
    this.highlightMessage(this.currentSearchIndex);
  }

  highlightMessage(index: number) {
    this.matchedMessages.forEach((el) => {
      const originalText = el.textContent || '';
      el.innerHTML = originalText;
      el.style.backgroundColor = 'transparent';
    });

    if (!this.searchText.trim()) return;

    const regex = new RegExp(`(${this.escapeRegExp(this.searchText)})`, 'gi');

    this.matchedMessages.forEach((el) => {
      const originalText = el.textContent || '';
      const highlightedText = originalText.replace(
        regex,
        `<mark style="background: yellow;">$1</mark>`
      );
      el.innerHTML = highlightedText;
    });

    const target = this.matchedMessages[index];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  cancelSearch() {
    this.searchText = '';
    this.showSearchBar = false;
    this.matchedMessages.forEach((el) => {
      el.innerHTML = el.textContent || '';
      el.style.backgroundColor = 'transparent';
    });
    this.matchedMessages = [];
  }

  openPopover(ev: any) {
    this.popoverEvent = ev;
    this.showPopover = true;
  }

  onDateSelected(event: any) {
    const selectedDateObj = new Date(event.detail.value);
    const today = new Date();

    // ✅ Additional validation: Prevent future dates
    if (selectedDateObj > today) {
      console.warn('Future date selected, ignoring');
      this.showToast('Cannot select future dates', 'warning');
      return;
    }

    const day = String(selectedDateObj.getDate()).padStart(2, '0');
    const month = String(selectedDateObj.getMonth() + 1).padStart(2, '0');
    const year = selectedDateObj.getFullYear();

    const formattedDate = `${day}/${month}/${year}`;

    this.selectedDate = event.detail.value;
    this.showPopover = false;
    this.showDateModal = false;

    setTimeout(() => {
      const el = document.getElementById('date-group-' + formattedDate);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        console.warn('No messages found for selected date:', formattedDate);
        this.showToast('No messages found for this date', 'warning');
      }
    }, 300);
  }

  openDatePicker() {
    this.showDateModal = true;
    //console.log('Opening calendar modal...');
  }

  onMessagePress(message: any) {
    const index = this.selectedMessages.findIndex(
      (m) => m.msgId === message.msgId
    );
    if (index > -1) {
      this.selectedMessages.splice(index, 1);
    } else {
      this.selectedMessages.push(message);
    }
  }

  clearSelection() {
    this.selectedMessages = [];
    this.replyTo = null;
  }

  private async markMessagesAsRead() {
    const lastMessage = this.messages[this.messages.length - 1];
    if (lastMessage && lastMessage.sender_id !== this.senderId) {
      await this.chatService.resetUnreadCount(this.roomId);
    }
  }

  // startLongPress moved to guarded version later in file

  // onMessageClick moved to guarded version later in file

  // toggleSelection moved to guarded version later in file

  isSelected(msg: any) {
    return this.selectedMessages.some((m) => m.msgId === msg.msgId);
  }

  isQuickReactionOpen(msg: any) {
    return (
      this.selectedMessages.some((m) => m.msgId === msg.msgId) &&
      this.selectedMessages.length === 1
    );
  }

  isOnlyOneTextMessage(): boolean {
    return (
      this.selectedMessages.length === 1 &&
      this.selectedMessages[0].type === 'text'
    );
  }

  isMultipleTextMessages(): boolean {
    return (
      this.selectedMessages.length > 1 &&
      this.selectedMessages.every((msg) => msg.type === 'text')
    );
  }

  isOnlyOneAttachment(): boolean {
    return (
      this.selectedMessages.length === 1 &&
      this.selectedMessages[0].type !== 'text'
    );
  }

  isMultipleAttachments(): boolean {
    return (
      this.selectedMessages.length > 1 &&
      this.selectedMessages.every((msg) => msg.type !== 'text')
    );
  }

  isMixedSelection(): boolean {
    const types = this.selectedMessages.map((msg) => msg.type);
    return types.includes('text') && types.some((t) => t !== 'text');
  }

  hasInviteSelected(): boolean {
    return this.selectedMessages.some((msg) => !!(msg as any).channel_invite);
  }

  // async copySelectedMessages() {
  //   if (this.lastPressedMessage?.text) {
  //     await Clipboard.write({ string: this.lastPressedMessage.text });
  //     //console.log('Text copied to clipboard:', this.lastPressedMessage.text);
  //     this.selectedMessages = [];
  //     this.lastPressedMessage = null;
  //   }
  // }

  async copySelectedMessages() {
    if (!this.lastPressedMessage) return;

    // Get the currently displayed text based on active translation
    const textToCopy = this.getDisplayedText(this.lastPressedMessage);

    if (textToCopy) {
      await Clipboard.write({ string: textToCopy });

      // Show feedback with translation label
      const label = this.getActiveTranslationLabel(this.lastPressedMessage);
      // const message = label
      //   ? `Copied (${label})`
      //   : 'Text copied';

      // this.showToast(message, 'success', 'top', 1500);

      this.selectedMessages = [];
      this.lastPressedMessage = null;
    }
  }

  async replyToMessages() {
    if (!(await this.checkNetworkBeforeAction('reply'))) {
      return;
    }
    if (this.selectedMessages.length === 1) {
      const messageToReply = this.selectedMessages[0];
      this.setReplyToMessage(messageToReply);
    }
  }

  setReplyToMessage(message: IMessage) {
    this.replyToMessage = message;
    this.selectedMessages = [];
    this.lastPressedMessage = null;
    this.replyTo = { message, sender: null };

    if (!message.isMe) {
      // Derive a display name that prefers contact/device name
      let displayName = '';

      if (this.chatType === 'group' || this.chatType === 'community') {
        displayName = this.getSenderDisplayName(message);
      } else {
        displayName =
          this.chatTitle ||
          this.currentConv?.title ||
          (message as any).sender_phone ||
          '';
      }

      let user = this.chatService.currentUsers.find(
        (u) => u.userId === message.sender
      ) as IUser;

      if (!user) {
        user = { username: displayName || (this.chatTitle as string) } as IUser;
      } else if (displayName) {
        user = { ...user, username: displayName };
      }

      this.replyTo = { ...this.replyTo, sender: user };
    }
    setTimeout(() => {
      const inputElement = document.querySelector(
        'ion-textarea'
      ) as HTMLIonTextareaElement;
      if (inputElement) {
        inputElement.setFocus();
      }
    }, 100);
  }

  cancelReply() {
    this.replyToMessage = null;
    this.replyTo = null;
  }

  getRepliedMessage(
    replyToMessageId: string
  ): (IMessage & { attachment?: IAttachment; fadeOut: boolean }) | null {
    if (!replyToMessageId) return null;

    // ─── Helper functions ─────────────────────────────────────────
    const isDeletedEveryone = (m: any): boolean =>
      m?._deletedForEveryone === true ||
      m?.deletedFor?.everyone === true ||
      m?.deletedForEveryone === true;

    const isDeletedForMe = (m: any): boolean =>
      Array.isArray(m?.deletedFor?.users) &&
      m.deletedFor.users.map(String).includes(String(this.senderId));
    // ─────────────────────────────────────────────────────────────

    // 1️⃣ replyPreviewCache check PEHLE karo
    if (this.replyPreviewCache.has(replyToMessageId)) {
      const cached = this.replyPreviewCache.get(replyToMessageId);
      if (cached === null) return null;
      if (isDeletedForMe(cached)) return null;
      return { ...(cached as IMessage), fadeOut: false } as IMessage & {
        attachment?: IAttachment;
        fadeOut: boolean;
      };
    }

    // 2️⃣ Live allMessage list check
    let msg: IMessage | undefined = this.allMessage.find(
      (m) => m.msgId === replyToMessageId
    );

    if (!msg && this.groupedMessages?.length) {
      for (const group of this.groupedMessages) {
        msg = group.messages.find((m: any) => m.msgId === replyToMessageId);
        if (msg) break;
      }
    }

    if (msg) {
      if (isDeletedForMe(msg)) {
        this.replyPreviewCache.set(replyToMessageId, null);
        return null;
      }
      this.replyPreviewCache.set(replyToMessageId, {
        ...(msg as any),
        _deletedForEveryone: isDeletedEveryone(msg),
      } as any);
      return { ...msg, fadeOut: false } as IMessage & {
        attachment?: IAttachment;
        fadeOut: boolean;
      };
    }

    return null;
  }

  /** Fetch replied message from PouchDB/Firebase for reply preview when not in loaded list */
  async loadReplyPreview(replyToMsgId: string): Promise<void> {
    if (!replyToMsgId || !this.roomId) return;

    // ✅ KEY CHECK: Agar cache mein already kuch bhi hai (null bhi)
    //    toh dobara fetch MAT KARO — yahi blink ka main cause tha
    if (this.replyPreviewCache.has(replyToMsgId)) return;

    if (this.loadingReplyIds.has(replyToMsgId)) return;
    this.loadingReplyIds.add(replyToMsgId);

    try {
      const msg = await this.chatService.getMessageByIdForReply(
        this.roomId,
        replyToMsgId
      );

      if (!msg) {
        this.replyPreviewCache.set(replyToMsgId, null);
        return;
      }

      const isDeletedEveryone =
        msg?.deletedFor?.everyone === true ||
        (msg as any)?.deletedForEveryone === true;

      const isDeletedForMe =
        Array.isArray(msg?.deletedFor?.users) &&
        (msg.deletedFor.users as string[])
          .map(String)
          .includes(String(this.senderId));

      if (isDeletedEveryone || isDeletedForMe) {
        // Deleted flag ke saath store karo — text preserve karo (no re-fetch)
        this.replyPreviewCache.set(replyToMsgId, {
          ...(msg as any),
          _deletedForEveryone: isDeletedEveryone,
        } as any);
      } else {
        // ✅ Normal case — decrypted message cache mein store karo
        this.replyPreviewCache.set(replyToMsgId, msg);
      }

      this.cdr.detectChanges();
    } catch (e) {
      console.warn('loadReplyPreview failed', e);
      this.replyPreviewCache.set(replyToMsgId, null);
    } finally {
      this.loadingReplyIds.delete(replyToMsgId);
      this.cdr.detectChanges();
    }
  }

  getReplyPreviewText(message: any): string {
    // console.log({message})
    if (message.text) {
      return message.text.length > 50
        ? message.text.substring(0, 50) + '...'
        : message.text;
    } else if (message.attachment) {
      const type = (message.attachment as any).type;
      switch (type) {
        case 'image':
          return '📷 Photo';
        case 'video':
          return '🎥 Video';
        case 'audio':
          return '🎵 Audio';
        case 'file':
          return '📄 Document';
        default:
          return '📎 Attachment';
      }
    }
    return 'Message';
  }

  async scrollToRepliedMessage(replyToMessageId: string) {
    if (!replyToMessageId) return;

    // Check if message exists in loaded messages first
    const messageExistsInArray = this.allMessage.some(
      (m) => m.msgId === replyToMessageId
    );

    const tryScroll = (): boolean => {
      const targetElement = document.querySelector(
        `[data-msg-key="${replyToMessageId}"]`
      ) as HTMLElement;

      if (targetElement) {
        let highlightTarget: HTMLElement = targetElement;
        const row = targetElement.closest('.msg-row') as HTMLElement;
        if (row) {
          highlightTarget = row;
        }

        // ✅ CRITICAL FIX: Use 'center' block positioning like pin message
        highlightTarget.scrollIntoView({
          behavior: 'smooth',
          block: 'center', // 👈 This centers the message on screen
          inline: 'nearest',
        });

        // ✅ Highlight after scroll completes
        setTimeout(() => {
          // Remove any existing highlights first
          document.querySelectorAll('.highlight-message').forEach((el) => {
            el.classList.remove('highlight-message');
          });

          // Add highlight to target
          highlightTarget.classList.add('highlight-message');

          // Remove after 3 seconds
          setTimeout(() => {
            highlightTarget?.classList.remove('highlight-message');
          }, 3000);
        }, 800); // Wait for scroll to complete

        return true;
      }
      return false;
    };

    // Virtual scroll support
    const tryVirtualScroll = async (): Promise<boolean> => {
      const isVirtualScroll =
        this.flatListForView.length > this.VIRTUAL_SCROLL_THRESHOLD;
      if (!isVirtualScroll) return false;

      const msgIndex = this.flatListForView.findIndex(
        (item) =>
          item.type === 'message' && item.message?.msgId === replyToMessageId
      );

      if (msgIndex === -1) return false;

      const viewport = document.querySelector('cdk-virtual-scroll-viewport');
      if (viewport) {
        const itemHeight = 88;
        // ✅ CRITICAL: Center the message in viewport
        const viewportHeight = (viewport as HTMLElement).clientHeight;
        const targetScrollTop =
          msgIndex * itemHeight - viewportHeight / 2 + itemHeight / 2;

        (viewport as HTMLElement).scrollTo({
          top: Math.max(0, targetScrollTop), // Prevent negative scroll
          behavior: 'smooth',
        });

        await new Promise((r) => setTimeout(r, 1000));

        const targetElement = document.querySelector(
          `[data-msg-key="${replyToMessageId}"]`
        ) as HTMLElement;
        if (targetElement) {
          let highlightTarget: HTMLElement = targetElement;
          const row = targetElement.closest('.msg-row') as HTMLElement;
          if (row) {
            highlightTarget = row;
          }

          highlightTarget.classList.add('highlight-message');
          setTimeout(
            () => highlightTarget?.classList.remove('highlight-message'),
            3000
          );
        }

        return true;
      }
      return false;
    };

    setTimeout(async () => {
      // First check if message is already in array
      if (messageExistsInArray) {
        // Try virtual scroll first (for large lists)
        if (await tryVirtualScroll()) return;

        // Fallback to normal scroll
        if (tryScroll()) return;

        // If still not visible, wait a bit and try again
        await new Promise((r) => setTimeout(r, 500));
        if (tryScroll()) return;
      }

      // Message not loaded yet - load progressively
      const maxAttempts = 25;
      let attempts = 0;

      while (attempts < maxAttempts) {
        const nowExists = this.allMessage.some(
          (m) => m.msgId === replyToMessageId
        );

        if (nowExists) {
          if (await tryVirtualScroll()) return;

          await new Promise((r) => setTimeout(r, 500));
          if (tryScroll()) return;

          await new Promise((r) => setTimeout(r, 800));
          if (tryScroll()) return;
        }

        if (this.chatService.hasMoreMessages && this.roomId) {
          console.log(
            `🔍 Attempt ${
              attempts + 1
            }: Loading older messages to find ${replyToMessageId}`
          );
          await this.loadOlderMessages();

          await new Promise((r) => setTimeout(r, 500));

          const foundInArray = this.allMessage.some(
            (m) => m.msgId === replyToMessageId
          );
          if (foundInArray) {
            for (let i = 0; i < 5; i++) {
              if (await tryVirtualScroll()) return;
              if (tryScroll()) return;
              await new Promise((r) => setTimeout(r, 200));
            }
          }
        } else {
          console.warn(
            '⚠️ No more messages available, target message not found'
          );
          this.showToast('Message not found', 'warning');
          break;
        }

        attempts++;
      }

      if (attempts >= maxAttempts) {
        console.warn('⚠️ Max attempts reached, could not scroll to message');
        this.showToast('Message not found in chat history', 'warning');
      }
    }, 100);
  }

  async deleteSelectedMessages() {
    if (!(await this.checkNetworkBeforeAction('delete'))) {
      return;
    }

    if (!this.selectedMessages || this.selectedMessages.length === 0) {
      return;
    }

    const currentUserId = this.senderId;
    const count = this.selectedMessages.length;

    // Build preview text
    let preview = '';
    if (count === 1) {
      const m = this.selectedMessages[0];
      if (m.text && m.text.trim())
        preview =
          m.text.length > 120 ? m.text.substring(0, 120) + '...' : m.text;
      else preview = this.getAttachmentPreview(m.attachment || {});
    } else {
      preview = `${count} messages`;
    }

    const allMine = this.selectedMessages.every(
      (m) => String(m.sender) === String(currentUserId) || m.isMe === true
    );
    const inputs: any[] = [
      {
        name: 'choice',
        type: 'radio',
        label: 'Delete for me',
        value: 'forMe',
        checked: true,
      },
      ...(allMine
        ? [
            {
              name: 'choice',
              type: 'radio',
              label: 'Delete for everyone',
              value: 'forEveryone',
              checked: false,
            },
          ]
        : []),
    ];

    const alert = await this.alertCtrl.create({
      header: 'Delete messages?',
      cssClass: 'delete-confirm-alert',
      inputs,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'OK',
          handler: async (selectedValue: any) => {
            let choice: string = '';
            if (typeof selectedValue === 'string') {
              choice = selectedValue;
            } else if (
              Array.isArray(selectedValue) &&
              selectedValue.length > 0
            ) {
              choice = selectedValue[0];
            } else if (selectedValue && typeof selectedValue === 'object') {
              const keys = Object.keys(selectedValue).filter(
                (k) => selectedValue[k]
              );
              choice = keys[0] || '';
            }

            const doForMe = choice === 'forMe';
            const doForEveryone = choice === 'forEveryone' && allMine;

            if (!doForMe && !doForEveryone) return;

            try {
              await alert.dismiss();

              // Optimistic deletion with smooth animation
              const messageIdsToDelete = this.selectedMessages.map(
                (m) => m.msgId
              );

              // Step 1: Preserve scroll position before deletion
              let scrollPosition = 0;
              try {
                const scrollEl = await this.ionContent.getScrollElement();
                scrollPosition = scrollEl.scrollTop;
              } catch (e) {
                console.warn('Could not get scroll position:', e);
              }

              this.selectedMessages.forEach((msg) => {
                msg.fadeOut = true;
              });
              await this.waitForFadeOut(messageIdsToDelete);

              if (doForEveryone) {
                this.allMessage = this.allMessage.map((msg) => {
                  if (messageIdsToDelete.includes(msg.msgId)) {
                    const users = (msg as any)?.deletedFor?.users || [];
                    return {
                      ...msg,
                      fadeOut: false,
                      deletedFor: { everyone: true, users },
                    } as any;
                  }
                  return msg;
                });
                this.groupMessagesByDate(this.allMessage as any[])
                  .then((grouped) => {
                    this.groupedMessages = grouped as any[];
                    this.buildFlatListForView();
                  })
                  .catch(() => {});
              } else {
                this.allMessage = this.allMessage.filter(
                  (msg) => !messageIdsToDelete.includes(msg.msgId)
                );
                this.groupMessagesByDate(this.allMessage as any[])
                  .then((grouped) => {
                    this.groupedMessages = grouped as any[];
                    this.buildFlatListForView();
                  })
                  .catch(() => {});
                this.chatService.removeMessagesFromRoom(
                  this.roomId,
                  messageIdsToDelete
                );
              }

              setTimeout(() => {
                this.ionContent
                  .getScrollElement()
                  .then((scrollEl) => {
                    scrollEl.scrollTop = scrollPosition;
                  })
                  .catch(() => {});
              }, 50);

              // Step 5: Delete from Firebase/PouchDB in background (non-blocking)
              this.chatService
                .deleteMessagesWithLastMessageUpdate(
                  this.selectedMessages,
                  this.roomId,
                  currentUserId,
                  this.receiverId,
                  doForEveryone
                )
                .then(() => {
                  // Update pinned messages if needed
                  if (this.pinnedMessages.length > 0) {
                    this.findPinnedMessageDetails();
                  }
                })
                .catch((e) => {
                  console.error('Background deletion failed:', e);
                  // Optionally show error toast, but don't block UI
                });

              // Step 6: Show success toast immediately
              const toast = await this.toastCtrl.create({
                message: doForEveryone
                  ? 'Deleted for everyone'
                  : 'Deleted for you',
                duration: 1600,
                color: 'medium',
              });
              await toast.present();

              // Step 7: Clear selection
              this.selectedMessages = [];
              this.lastPressedMessage = null;
            } catch (e) {
              console.error('deleteSelectedMessages handler err', e);
              const t = await this.toastCtrl.create({
                message: 'Failed to delete messages',
                duration: 2000,
                color: 'danger',
              });
              t.present();
            }
          },
        },
      ],
    });

    await alert.present();
  }

  async onForward() {
    if (!(await this.checkNetworkBeforeAction('forward'))) {
      return;
    }
    this.chatService.setForwardMessage(this.selectedMessages);
    this.selectedMessages = [];
    this.router.navigate(['/forwardmessage']);
  }

  async onMore(ev?: Event) {
    const hasText = !!this.lastPressedMessage?.text;
    console.log({ hasText });
    const hasAttachment = !!(
      this.lastPressedMessage?.attachment ||
      this.lastPressedMessage?.file ||
      this.lastPressedMessage?.image ||
      this.lastPressedMessage?.media
    );
    console.log({ hasAttachment });
    console.log('onMore', this.lastPressedMessage);

    // const isPinned =
    // this.pinnedMessage?.messageId === this.lastPressedMessage?.msgId;
    const isPinned = !!this.lastPressedMessage?.isPinned;
    console.log({ isPinned });

    const popover = await this.popoverController.create({
      component: MessageMorePopoverComponent,
      event: ev,
      translucent: true,
      showBackdrop: true,
      componentProps: {
        hasText: hasText,
        hasAttachment: hasAttachment,
        isPinned: isPinned,
        message: this.lastPressedMessage,
        currentUserId: this.senderId,
      },
    });

    await popover.present();

    const { data } = await popover.onDidDismiss();
    if (data) {
      this.handlePopoverAction(data);
    }
  }

  async handlePopoverAction(action: string) {
    switch (action) {
      case 'info':
        this.messageInfo();
        break;
      case 'copy':
        this.copySelectedMessages();
        break;
      case 'share':
        this.shareMessage();
        break;
      case 'pin':
        if (this.chatType === 'group' && !this.canPinMessage) {
          const alert = await this.alertCtrl.create({
            header: 'Permission Denied',
            message: 'Only admins can pin messages in this group.',
            buttons: [{ text: 'OK', role: 'cancel' }],
          });
          await alert.present();
          this.selectedMessages = [];
          this.lastPressedMessage = null;
          return;
        }
        this.pinMessage(this.lastPressedMessage);
        break;
      case 'unpin':
        if (this.chatType === 'group' && !this.canPinMessage) {
          const alert = await this.alertCtrl.create({
            header: 'Permission Denied',
            message: 'Only admins can unpin messages in this group.',
            buttons: [{ text: 'OK', role: 'cancel' }],
          });
          await alert.present();
          this.selectedMessages = [];
          this.lastPressedMessage = null;
          return;
        }
        this.unpinMessage();
        break;
      case 'edit':
        this.editMessage(this.lastPressedMessage);
        break;
    }
  }
  async messageInfo() {
    // pick the message: prefer lastPressedMessage then fallback to first selectedMessages
    const msg =
      this.lastPressedMessage ||
      (this.selectedMessages && this.selectedMessages[0]);
    if (!msg) {
      const t = await this.toastCtrl.create({
        message: 'No message selected',
        duration: 1500,
        color: 'medium',
      });
      await t.present();
      return;
    }

    try {
      this.chatService.setSelectedMessageInfo(msg);

      // clear UI selection state
      this.selectedMessages = [];
      this.lastPressedMessage = null;

      this.router.navigate(['/message-info'], {
        queryParams: {
          messageKey: msg.msgId || '',
          receiverId: this.receiverId || '',
        },
      });
    } catch (err) {
      console.error('messageInfo error', err);
      const t = await this.toastCtrl.create({
        message: 'Failed to open message info',
        duration: 1500,
        color: 'danger',
      });
      await t.present();
    }
  }

  async editMessage(message: IMessage) {
    if (!(await this.checkNetworkBeforeAction('edit'))) {
      return;
    }

    let currentText = message.translations?.original?.text || message.text || '';
    try {
      if (currentText) {
        const decrypted = await this.encryptionService.decrypt(currentText);
        if (decrypted) {
          currentText = decrypted;
        }
      }
    } catch (e) {
      // already decrypted or not encrypted
    }

    const alert = await this.alertCtrl.create({
      header: 'Edit Message',
      inputs: [
        {
          name: 'text',
          type: 'text',
          value: currentText,
        },
      ],
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Save',
          handler: async (data: any) => {
            const newText = data.text?.trim();
            if (!newText) return;

            try {
              await this.chatService.editMessage(
                this.roomId,
                message.msgId,
                newText
              );

              message.text = newText;
              message.isEdit = true;
              // message.editedAt = Date.now();

              if (message.translations?.original) {
                message.translations.original.text = newText;
              }

              this.cdr.detectChanges();

              this.selectedMessages = [];
              this.lastPressedMessage = null;

              this.showToast('Message edited successfully', 'success', 'bottom');
            } catch (err) {
              console.error('Failed to edit message:', err);
              this.showToast('Failed to edit message', 'error', 'bottom');
            }
          },
        },
      ],
    });

    await alert.present();
  }

  async copyMessage() {
    if (this.lastPressedMessage?.text) {
      await Clipboard.write({ string: this.lastPressedMessage.text });
      this.selectedMessages = [];
      this.lastPressedMessage = null;
    }
  }

  shareMessage() {
    //console.log('Share clicked for attachment:', this.lastPressedMessage);
  }

  async pinMessage(message: IMessage) {
    if (!(await this.checkNetworkBeforeAction('pin'))) {
      return;
    }

    try {
      // 🔥 Use visible pinned messages (excludes deleted-for-me) for limit check
      const visiblePinnedMessages =
        await this.chatService.getVisiblePinnedMessages(
          this.roomId,
          this.senderId
        );

      const isAlreadyPinned = visiblePinnedMessages.some(
        (p) => p.messageId === message.msgId
      );

      if (!isAlreadyPinned && visiblePinnedMessages.length >= 3) {
        const alert = await this.alertCtrl.create({
          header: 'Pin Limit Reached',
          message:
            'You can only pin up to 3 messages. Please unpin a message first to pin this one.',
          buttons: [
            {
              text: 'OK',
              role: 'cancel',
            },
          ],
        });

        await alert.present();

        this.selectedMessages = [];
        this.lastPressedMessage = null;
        return;
      }

      const pin: PinnedMessage = {
        messageId: message.msgId as string,
        pinnedAt: Date.now(),
        pinnedBy: this.senderId,
        roomId: this.roomId,
        scope: 'global',
      };

      await this.chatService.pinMessage(pin);

      this.selectedMessages = [];
      this.lastPressedMessage = null;

      // ✅ Show success toast
      // this.showToast('Message pinned successfully', 'success');
    } catch (error) {
      console.error('❌ Error pinning message:', error);
      this.showToast('Failed to pin message', 'error');
    }
  }

  async unpinMessage(messageDetails?: any) {
    if (!(await this.checkNetworkBeforeAction('unpin'))) {
      return;
    }
    // If called from pinned message banner, use current pinned message details
    // Otherwise use lastPressedMessage
    const raw =
      messageDetails ||
      this.getCurrentPinnedMessageDetails() ||
      this.lastPressedMessage;

    if (!raw) {
      console.warn('unpinMessage: no message available');
      return;
    }

    // Normalize: PinnedMessage uses .messageId, IMessage uses .msgId
    const msgId = raw.msgId || raw.messageId;
    const roomId = raw.roomId || this.roomId;

    if (!msgId) {
      console.warn('unpinMessage: could not resolve msgId', raw);
      return;
    }

    await this.chatService.unpinMessage({ ...raw, msgId, roomId });
    this.selectedMessages = [];
    this.lastPressedMessage = null;
    // Reset index if needed
    if (this.currentPinnedIndex >= this.pinnedMessages.length) {
      this.currentPinnedIndex = Math.max(0, this.pinnedMessages.length - 1);
    }
  }

  setupPinnedMessageListener() {
    // 🔥 IMPROVED: Listen to pinned message changes and update banner in real-time
    console.log('📌 Setting up pinned message listener for room:', this.roomId);

    let isFirstFire = true; // Skip the initial fire

    this.pinnedMessageSubscription = this.chatService.listenToPinnedMessage(
      this.roomId,
      async (pinnedMessages: PinnedMessage[]) => {
        console.log(
          `📌 Listener detected ${pinnedMessages.length} pinned messages`,
          pinnedMessages
        );

        // Skip the initial listener fire - we already loaded visible pins in ionViewWillEnter
        if (isFirstFire) {
          console.log(
            '⏭️ Skipping initial listener fire (already loaded visible pins on enter)'
          );
          isFirstFire = false;
          return;
        }

        // 🔥 Only process actual changes from other devices
        console.log(
          '🔄 Processing real-time pinned message change from another device'
        );
        await this.loadVisiblePinnedMessages();

        // Force UI update to reflect changes immediately
        this.cdr.detectChanges();
      }
    );
  }

  /**
   * 🔥 Load visible pinned messages (filters out deleted-for-me)
   * Called on enter AND on every pin change via listener
   */
  async loadVisiblePinnedMessages(): Promise<void> {
    try {
      const visiblePinned = await this.chatService.getVisiblePinnedMessages(
        this.roomId,
        this.senderId
      );
      console.log(
        `📌 Loaded ${visiblePinned.length} visible pinned messages (filtered for current user)`
      );

      if (visiblePinned.length > 0) {
        this.pinnedMessages = visiblePinned;
        this.findPinnedMessageDetails();
        // Only reset index if currently out of bounds
        if (this.currentPinnedIndex >= this.pinnedMessages.length) {
          this.currentPinnedIndex = 0;
        }
        console.log(
          `✅ Header banner now shows ${visiblePinned.length} visible pinned messages`
        );
      } else {
        this.pinnedMessages = [];
        this.pinnedMessageDetails = [];
        this.currentPinnedIndex = 0;
        console.log('📌 No visible pinned messages for this user');
      }

      // Force UI update
      this.cdr.detectChanges();
    } catch (error) {
      console.error('❌ Error loading visible pinned messages:', error);
    }
  }

  findPinnedMessageDetails() {
    this.pinnedMessageDetails = [];
    let validCount = 0;

    for (const pinnedMsg of this.pinnedMessages) {
      let foundMessage = null;
      for (const group of this.groupedMessages) {
        const msg = group.messages.find((m) => m.msgId === pinnedMsg.messageId);
        if (msg) {
          foundMessage = msg;
          validCount++;
          break;
        }
      }
      // 🔥 Only add found messages (skip deleted-for-me which return null)
      if (foundMessage) {
        this.pinnedMessageDetails.push(foundMessage);
      } else {
        console.warn(
          `⚠️ Pinned message ${pinnedMsg.messageId} not found in chat (deleted for me?)`
        );
      }
    }

    console.log(
      `📌 Found ${validCount}/${this.pinnedMessages.length} pinned messages in chat`
    );

    // Reset index if no valid pinned messages found
    if (this.pinnedMessageDetails.length === 0) {
      this.currentPinnedIndex = 0;
    } else if (this.currentPinnedIndex >= this.pinnedMessageDetails.length) {
      this.currentPinnedIndex = 0;
    }
  }

  // Get currently displayed pinned message
  getCurrentPinnedMessage(): PinnedMessage | null {
    if (
      this.pinnedMessages.length === 0 ||
      this.currentPinnedIndex >= this.pinnedMessages.length
    ) {
      return null;
    }
    return this.pinnedMessages[this.currentPinnedIndex];
  }

  // Get currently displayed pinned message details
  getCurrentPinnedMessageDetails(): any | null {
    if (
      !this.pinnedMessageDetails ||
      this.pinnedMessageDetails.length === 0 ||
      this.currentPinnedIndex >= this.pinnedMessageDetails.length
    ) {
      return null;
    }
    const details = this.pinnedMessageDetails[this.currentPinnedIndex];
    // Return null if details is null/undefined (message deleted-for-me)
    return details || null;
  }

  // Navigate to next pinned message
  // nextPinnedMessage() {
  //   if (this.pinnedMessages.length > 0) {
  //     this.currentPinnedIndex = (this.currentPinnedIndex + 1) % this.pinnedMessages.length;
  //   }
  // }

  // // Navigate to previous pinned message
  // previousPinnedMessage() {
  //   if (this.pinnedMessages.length > 0) {
  //     this.currentPinnedIndex = (this.currentPinnedIndex - 1 + this.pinnedMessages.length) % this.pinnedMessages.length;
  //   }
  // }

  scrollToCurrentPinnedMessage() {
    const currentDetails = this.getCurrentPinnedMessageDetails();
    if (currentDetails) {
      this.scrollToPinnedMessage(currentDetails);
    }
  }

  /** Load older messages until the current pinned message is in the list, then scroll to it */
  // async ensurePinnedMessageLoadedThenScroll() {
  //   const pinned = this.getCurrentPinnedMessage();
  //   if (!pinned) return;

  //   const targetMsgId = pinned.messageId;
  //   const maxAttempts = 25;
  //   let attempts = 0;

  //   while (attempts < maxAttempts) {
  //     const inList = this.allMessage.some((m) => m.msgId === targetMsgId);
  //     if (inList) {
  //       this.findPinnedMessageDetails();
  //       this.scrollToCurrentPinnedMessage();
  //       return;
  //     }
  //     if (!this.chatService.hasMoreMessages || !this.roomId) break;
  //     await this.loadOlderMessages();
  //     await new Promise((r) => setTimeout(r, 120));
  //     attempts++;
  //   }

  //   this.findPinnedMessageDetails();
  //   this.scrollToCurrentPinnedMessage();
  // }

  async ensurePinnedMessageLoadedThenScroll() {
    const pinned = this.getCurrentPinnedMessage();
    if (!pinned) return;

    const targetMsgId = pinned.messageId;

    // Check if message exists in array first
    const messageExistsInArray = this.allMessage.some(
      (m) => m.msgId === targetMsgId
    );

    if (messageExistsInArray) {
      // Message is loaded, just scroll to it
      this.findPinnedMessageDetails();
      this.scrollToCurrentPinnedMessage();
      return;
    }

    // Message not loaded yet - load progressively
    const maxAttempts = 25;
    let attempts = 0;

    while (attempts < maxAttempts) {
      // Check if message is now in array
      const inList = this.allMessage.some((m) => m.msgId === targetMsgId);

      if (inList) {
        console.log(`✅ Found pinned message after ${attempts} attempts`);
        this.findPinnedMessageDetails();

        // Wait for UI to update
        await new Promise((r) => setTimeout(r, 500));

        this.scrollToCurrentPinnedMessage();
        return;
      }

      // Load more messages
      if (!this.chatService.hasMoreMessages || !this.roomId) {
        console.warn('⚠️ No more messages to load, pinned message not found');
        this.showToast('Pinned message not found in chat history', 'warning');
        break;
      }

      console.log(
        `🔍 Loading older messages to find pinned message (attempt ${
          attempts + 1
        })`
      );
      await this.loadOlderMessages();
      await new Promise((r) => setTimeout(r, 500));

      attempts++;
    }

    if (attempts >= maxAttempts) {
      console.warn('⚠️ Max attempts reached for pinned message');
      this.showToast('Pinned message not found', 'warning');
    }

    // Fallback: scroll with whatever we have
    this.findPinnedMessageDetails();
    this.scrollToCurrentPinnedMessage();
  }

  nextPinnedMessage() {
    if (this.pinnedMessages.length > 0) {
      this.currentPinnedIndex =
        (this.currentPinnedIndex + 1) % this.pinnedMessages.length;

      // 🔥 NEW: Scroll to the new pinned message
      setTimeout(() => {
        this.scrollToCurrentPinnedMessage();
      }, 100);
    }
  }

  // 🔥 UPDATED: Handle previous pinned message with scroll
  previousPinnedMessage() {
    if (this.pinnedMessages.length > 0) {
      this.currentPinnedIndex =
        (this.currentPinnedIndex - 1 + this.pinnedMessages.length) %
        this.pinnedMessages.length;

      // 🔥 NEW: Scroll to the new pinned message
      setTimeout(() => {
        this.scrollToCurrentPinnedMessage();
      }, 100);
    }
  }

  // Check if a message is currently highlighted (the one shown in preview)
  isPinnedMessageHighlighted(msg: any): boolean {
    const currentDetails = this.getCurrentPinnedMessageDetails();
    return currentDetails && currentDetails.msgId === msg.msgId;
  }

  // 🔥 IMPROVED: Scroll to pinned message function
  // scrollToPinnedMessage(messageDetails?: any) {
  //   const targetMessage =
  //     messageDetails || this.getCurrentPinnedMessageDetails();

  //   if (!targetMessage) {
  //     console.warn('No pinned message details found');
  //     return;
  //   }

  //   console.log('🔍 Looking for message with ID:', targetMessage.msgId);

  //   // Wait for DOM to update
  //   setTimeout(() => {
  //     // Try to find the message element (bubble or audio wrapper)
  //     let element: HTMLElement | null = null;

  //     // Method 1: Try data-msg-key attribute (works for both text bubbles and audio)
  //     element = document.querySelector(
  //       `[data-msg-key="${targetMessage.msgId}"]`
  //     ) as HTMLElement;

  //     // Method 2: If not found, try class-based selector
  //     if (!element) {
  //       const allMessageElements =
  //         document.querySelectorAll('.message-container');
  //       element = Array.from(allMessageElements).find((el: any) => {
  //         const msgIdAttr = el.getAttribute('data-msg-key');
  //         return msgIdAttr === targetMessage.msgId;
  //       }) as HTMLElement;
  //     }

  //           // Method 3: If still not found, try audio-specific selector
  //           if (!element) {
  //             const audioWrappers = document.querySelectorAll('.wa-audio-wrapper');
  //             element = Array.from(audioWrappers).find((el: any) => {
  //               const msgIdAttr = el.getAttribute('data-msg-key');
  //               return msgIdAttr === targetMessage.msgId;
  //             }) as HTMLElement;
  //           }

  //           // Method 4: If still not found, try by text content (fallback)
  //     if (!element) {
  //       const allTextElements = document.querySelectorAll('.message-text');
  //       element = Array.from(allTextElements).find((el: any) =>
  //         el.textContent?.includes(targetMessage.text?.substring(0, 50) || '')
  //       ) as HTMLElement;
  //     }

  //     // Prefer to highlight the outer row that wraps the bubble
  //     let highlightTarget: HTMLElement | null = element;
  //     if (element) {
  //         // Try to find parent row container
  //       const row = element.closest('.msg-row') as HTMLElement | null;
  //       if (row) {
  //         highlightTarget = row;
  //       }
  //     }

  //     if (highlightTarget) {
  //       console.log('✅ Found element, scrolling...', highlightTarget);

  //       // Remove any existing highlights
  //       document.querySelectorAll('.pinned-message-highlight').forEach((el) => {
  //         el.classList.remove('pinned-message-highlight');
  //       });

  //      // Add highlight class ONLY to the row (or bubble/audio fallback)
  //       highlightTarget.classList.add('pinned-message-highlight');

  //       // Scroll to element
  //       highlightTarget.scrollIntoView({
  //         behavior: 'smooth',
  //         block: 'center',
  //         inline: 'nearest',
  //       });

  //       // Remove highlight after 3 seconds
  //       setTimeout(() => {
  //         highlightTarget?.classList.remove('pinned-message-highlight');
  //       }, 3000);

  //       if (this.ionContent) {
  //         // Calculate the position of the element relative to the scroll container
  //         const scrollElement = this.ionContent.getScrollElement();
  //         scrollElement.then((scrollEl) => {
  //           const elementRect = highlightTarget!.getBoundingClientRect();
  //           const containerRect = scrollEl.getBoundingClientRect();
  //           const scrollTop = scrollEl.scrollTop;
  //           const elementTop = elementRect.top - containerRect.top + scrollTop;

  //           // Scroll to element with offset
  //           this.ionContent.scrollToPoint(0, elementTop - 100, 300);
  //         });
  //       }
  //     } else {
  //       console.warn(
  //         '❌ Target message element not found in DOM for msgId:',
  //         targetMessage.msgId
  //       );

  //       // Show toast notification
  //       this.showToast('Message not found in current view', 'warning');
  //     }
  //   }, 200); // Increased timeout for better DOM readiness
  // }

  scrollToPinnedMessage(messageDetails?: any) {
    const targetMessage =
      messageDetails || this.getCurrentPinnedMessageDetails();

    if (!targetMessage) {
      console.warn('No pinned message details found');
      return;
    }

    console.log('🔍 Looking for pinned message with ID:', targetMessage.msgId);

    const tryScroll = (): boolean => {
      let element: HTMLElement | null = null;

      // Method 1: Try data-msg-key attribute
      element = document.querySelector(
        `[data-msg-key="${targetMessage.msgId}"]`
      ) as HTMLElement;

      // Method 2: Try class-based selector
      if (!element) {
        const allMessageElements =
          document.querySelectorAll('.message-container');
        element = Array.from(allMessageElements).find((el: any) => {
          const msgIdAttr = el.getAttribute('data-msg-key');
          return msgIdAttr === targetMessage.msgId;
        }) as HTMLElement;
      }

      // Method 3: Try audio-specific selector
      if (!element) {
        const audioWrappers = document.querySelectorAll('.wa-audio-wrapper');
        element = Array.from(audioWrappers).find((el: any) => {
          const msgIdAttr = el.getAttribute('data-msg-key');
          return msgIdAttr === targetMessage.msgId;
        }) as HTMLElement;
      }

      if (!element) return false;

      // Find parent row for better highlighting
      let highlightTarget: HTMLElement | null = element;
      const row = element.closest('.msg-row') as HTMLElement | null;
      if (row) {
        highlightTarget = row;
      }

      console.log('✅ Found element, scrolling...', highlightTarget);

      // Remove existing highlights
      document.querySelectorAll('.pinned-message-highlight').forEach((el) => {
        el.classList.remove('pinned-message-highlight');
      });

      // 🔥 CHANGED: Use smooth scrollIntoView for continuous scroll
      highlightTarget.scrollIntoView({
        behavior: 'smooth', // Continuous smooth scroll from current position
        block: 'center', // Center the message in viewport
        inline: 'nearest',
      });

      // Add highlight after scroll completes
      setTimeout(() => {
        highlightTarget?.classList.add('pinned-message-highlight');
        setTimeout(() => {
          highlightTarget?.classList.remove('pinned-message-highlight');
        }, 3000);
      }, 800);

      return true;
    };

    // Virtual scroll support
    const tryVirtualScroll = async (): Promise<boolean> => {
      const isVirtualScroll =
        this.flatListForView.length > this.VIRTUAL_SCROLL_THRESHOLD;
      if (!isVirtualScroll) return false;

      // Find message index in flatListForView
      const msgIndex = this.flatListForView.findIndex(
        (item) =>
          item.type === 'message' && item.message?.msgId === targetMessage.msgId
      );

      if (msgIndex === -1) return false;

      console.log(`📍 Found pinned message at virtual index: ${msgIndex}`);

      // Scroll virtual viewport smoothly
      const viewport = document.querySelector('cdk-virtual-scroll-viewport');
      if (viewport) {
        const itemHeight = 88; // itemSize from viewport
        const targetScrollTop = msgIndex * itemHeight;

        // 🔥 CHANGED: Use smooth scroll behavior
        (viewport as HTMLElement).scrollTo({
          top: targetScrollTop,
          behavior: 'smooth', // Continuous smooth scroll from current position
        });

        // Wait for scroll to complete, then highlight
        await new Promise((r) => setTimeout(r, 1000));

        if (tryScroll()) return true;
      }

      return false;
    };

    // Wait for DOM to update
    setTimeout(async () => {
      // Try virtual scroll first
      if (await tryVirtualScroll()) return;

      // Try normal scroll
      if (tryScroll()) return;

      console.warn(
        '❌ Target message element not found in DOM for msgId:',
        targetMessage.msgId
      );
      this.showToast('Message not found in current view', 'warning');
    }, 200);
  }

  // Handle click on pinned message preview
  // onPinnedMessageClick() {
  //   const currentDetails = this.getCurrentPinnedMessageDetails();
  //   if (currentDetails) {
  //     this.scrollToPinnedMessage(currentDetails);
  //   }
  // }

  async onPinnedMessageClick() {
    await this.ensurePinnedMessageLoadedThenScroll();
  }

  getPinnedMessagePreview(message: any): string {
    if (message.text) {
      return message.text.length > 60
        ? message.text.substring(0, 60) + '...'
        : message.text;
    }
    return '';
  }

  checkMobileView() {
    this.showMobilePinnedBanner = window.innerWidth < 480;
  }

  openChatInfo() {
    //console.log('Opening chat info');
  }

  async loadInitialMessages() {
    this.isLoadingMore = true;
    try {
      this.chatService.resetPagination(this.roomId);
      await this.chatService.initialLoad(this.roomId);
    } catch (error) {
      console.error('Error loading initial messages:', error);
    } finally {
      this.isLoadingMore = false;
    }
  }

  getAttachmentIcon(type: string): string {
    switch (type) {
      case 'image':
        return 'image-outline';
      case 'video':
        return 'videocam-outline';
      case 'audio':
        return 'musical-note-outline';
      case 'file':
        return 'document-outline';
      default:
        return 'attach-outline';
    }
  }

  getAttachmentPreviewText(attachment: any): string {
    if (!attachment) return '';
    const type = attachment.type;
    switch (type) {
      case 'image':
        return 'Photo';
      case 'video':
        return 'Video';
      case 'audio':
        return 'Audio';
      case 'file':
        return attachment.fileName || 'Document';
      default:
        return 'Attachment';
    }
  }

  private setupTypingListener() {
    // ✅ Block Validation: Do not listen to typing signals if blocked
    if (this.iBlocked || this.theyBlocked) {
      this.typingUsers = [];
      this.typingFrom = null;
      this.typingCount = 0;
      return;
    }
    try {
      const db = getDatabase();

      try {
        if (this.typingUnsubscribe) this.typingUnsubscribe();
      } catch (e) {}

      const unsubscribe = onValue(
        dbRef(db, `typing/${this.roomId}`),
        (snap) => {
          const val = snap.val() || {};
          const now = Date.now();

          const entries = Object.keys(val).map((k) => ({
            userId: k,
            typing: val[k]?.typing ?? false,
            lastUpdated: val[k]?.lastUpdated ?? 0,
            name: val[k]?.name ?? null,
          }));

          const recent = entries.filter(
            (e) =>
              e.userId !== this.senderId &&
              e.typing &&
              now - (e.lastUpdated || 0) < 10000
          );

          this.typingCount = recent.length;

          if (this.chatType === 'private') {
            if (recent.length === 0) {
              this.typingUsers = [];
              this.typingFrom = null;
              return;
            }
            const other = recent[0];
            this.typingUsers = [
              {
                userId: other.userId,
                name: other.name || `User ${other.userId}`,
                avatar: 'assets/images/default-avatar.png',
              },
            ];
            this.typingFrom = this.typingUsers[0].name || null;
            return;
          }

          const usersForDisplay: {
            userId: string;
            name: string | null;
            avatar: string | null;
          }[] = [];

          recent.forEach((e) => {
            let member = this.groupMembers.find(
              (m) => String(m.user_id) === String(e.userId)
            );
            if (!member) {
              member = this.groupMembers.find(
                (m) =>
                  m.phone_number && String(m.phone_number) === String(e.userId)
              );
            }

            const avatar = member?.avatar || null;
            const displayName = member?.name || e.name || e.userId;

            usersForDisplay.push({
              userId: e.userId,
              name: displayName,
              avatar: avatar || 'assets/images/default-avatar.png',
            });
          });

          const uniq: { [k: string]: boolean } = {};
          this.typingUsers = usersForDisplay.filter((u) => {
            if (uniq[u.userId]) return false;
            uniq[u.userId] = true;
            return true;
          });

          this.typingFrom = this.typingUsers.length
            ? this.typingUsers[0].name
            : null;
        }
      );

      this.typingUnsubscribe = () => {
        try {
          unsubscribe();
        } catch (e) {}
      };
      this.onValueUnsubs.push(this.typingUnsubscribe);
    } catch (err) {
      console.warn('setupTypingListener error', err);
    }
  }

  //for minimal rerendering
  trackByMessageId(index: number, message: any): string {
    return message.msgId;
  }

  async ngAfterViewInit() {
    if (this.ionContent) {
      this.ionContent.ionScroll.subscribe(async (event: any) => {
        await this.handleScroll(event);
      });

      const scrollElement = await this.ionContent.getScrollElement();
      scrollElement.addEventListener('scroll', () => {
        this.trackUserScroll();
        // ✅ Track isNearBottom from native scroll (virtual scroll ke liye zaroori)
        const distanceFromBottom =
          scrollElement.scrollHeight -
          (scrollElement.scrollTop + scrollElement.clientHeight);
        this.isNearBottom = distanceFromBottom < this.scrollThreshold;
      });
    }

    // ✅ FIX: Yahan scroll mat karo — data aane ke baad ionViewWillEnter karta hai
    this.isInitialLoad = true;
    this.ensureAudioMetadataLoaded();
  }

  private updateNearBottomFromNativeScroll(scrollElement: HTMLElement): void {
    const distanceFromBottom =
      scrollElement.scrollHeight -
      (scrollElement.scrollTop + scrollElement.clientHeight);
    this.isNearBottom = distanceFromBottom < this.scrollThreshold;
  }

  private async scrollToBottomForBothViews(): Promise<void> {
    try {
      const isVirtualScroll =
        this.flatListForView.length > this.VIRTUAL_SCROLL_THRESHOLD;

      if (isVirtualScroll) {
        await this.scrollToBottomVirtualWithRetry();
      } else {
        await this.scrollToBottomWithMediaRetry();
      }

      this.isNearBottom = true;
      this.isInitialLoad = false;
      console.log(
        `📍 Bottom reached (${isVirtualScroll ? 'virtual' : 'normal'})`
      );
    } catch (error) {
      console.warn('scrollToBottomForBothViews failed:', error);
      this.isInitialLoad = false;
    }
  }

  private async scrollToBottomWithMediaRetry(): Promise<void> {
    if (!this.ionContent) return;

    // Pehla scroll — turant
    await this.ionContent.scrollToBottom(0);

    // Media load hone ke baad bhi scroll karo
    // Delays: 150ms, 400ms, 800ms, 1200ms, 2000ms
    const delays = [150, 400, 800, 1200, 2000];

    for (const delay of delays) {
      await new Promise((r) => setTimeout(r, delay));

      try {
        const scrollEl = await this.ionContent.getScrollElement();
        const distanceFromBottom =
          scrollEl.scrollHeight - (scrollEl.scrollTop + scrollEl.clientHeight);

        if (distanceFromBottom > 5) {
          // Abhi bottom nahi hai — media ne height badhayi hogi
          await this.ionContent.scrollToBottom(0);
          console.log(
            `🔄 Media retry scroll (${delay}ms, gap: ${Math.round(
              distanceFromBottom
            )}px)`
          );
        } else {
          // Bottom par hain — aage retry ki zaroorat nahi
          console.log(`✅ At bottom after ${delay}ms`);
          break;
        }
      } catch (e) {
        // View destroy ho gayi hogi, ignore karo
        break;
      }
    }
  }

  // -------------------------------------------------------
  // 4️⃣  NEW FUNCTION: scrollToBottomVirtualWithRetry  — ADD karo
  // -------------------------------------------------------
  private async scrollToBottomVirtualWithRetry(): Promise<void> {
    // Viewport DOM mein aane ka wait karo
    let viewport: HTMLElement | null = null;
    for (let i = 0; i < 8; i++) {
      viewport = document.querySelector(
        'cdk-virtual-scroll-viewport'
      ) as HTMLElement | null;
      if (viewport) break;
      await new Promise((r) => setTimeout(r, 80));
    }

    if (!viewport) {
      console.warn('Virtual scroll viewport not found');
      return;
    }

    // Pehla scroll
    viewport.scrollTop = viewport.scrollHeight;

    // Media ke baad retry
    const delays = [150, 400, 800, 1200];
    for (const delay of delays) {
      await new Promise((r) => setTimeout(r, delay));
      const vp = document.querySelector(
        'cdk-virtual-scroll-viewport'
      ) as HTMLElement | null;
      if (!vp) break;
      const distanceFromBottom =
        vp.scrollHeight - (vp.scrollTop + vp.clientHeight);
      if (distanceFromBottom > 5) {
        vp.scrollTop = vp.scrollHeight;
        console.log(
          `🔄 Virtual retry scroll (${delay}ms, gap: ${Math.round(
            distanceFromBottom
          )}px)`
        );
      } else {
        break;
      }
    }
  }

  /**
   * ✅ Scroll to bottom in virtual scroll viewport
   */
  // private async scrollToBottomVirtual(): Promise<void> {
  //   // Wait for DOM to fully render
  //   await new Promise((resolve) => setTimeout(resolve, 100));

  //   const viewport = document.querySelector('cdk-virtual-scroll-viewport');
  //   if (!viewport) {
  //     console.warn('Virtual scroll viewport not found');
  //     return;
  //   }

  //   // Scroll to the last item
  //   const lastIndex = this.flatListForView.length - 1;
  //   if (lastIndex >= 0) {
  //     // Get the viewport element and scroll it to bottom
  //     const viewportElement = viewport as HTMLElement;
  //     viewportElement.scrollTop = viewportElement.scrollHeight;
  //   }
  // }

  private async scrollToBottomVirtual(): Promise<void> {
    let viewport: HTMLElement | null = null;

    // Retry up to 500 ms for the viewport to appear
    for (let i = 0; i < 6; i++) {
      viewport = document.querySelector(
        'cdk-virtual-scroll-viewport'
      ) as HTMLElement | null;
      if (viewport) break;
      await new Promise((r) => setTimeout(r, 80));
    }

    if (!viewport) {
      console.warn('Virtual scroll viewport not found');
      return;
    }

    // Scroll to absolute bottom
    viewport.scrollTop = viewport.scrollHeight;
  }

  async handleScroll(event: any) {
    const scrollTop = event.detail?.scrollTop ?? 0;

    try {
      const scrollElement = await this.ionContent.getScrollElement();
      const distanceFromBottom =
        scrollElement.scrollHeight - (scrollTop + scrollElement.clientHeight);
      this.isNearBottom = distanceFromBottom < this.scrollThreshold;

      if (
        scrollTop < 100 &&
        !this.isLoadingMore &&
        this.chatService.hasMoreMessages
      ) {
        await this.loadOlderMessages();
      }
    } catch (e) {
      // View teardown ke time ignore
    }
  }
  /**
   * 🎯 Track if user is actively scrolling
   */
  private trackUserScroll() {
    this.isUserScrolling = true;

    // Reset flag after scroll stops
    if (this.scrollDebounceTimer) {
      clearTimeout(this.scrollDebounceTimer);
    }

    this.scrollDebounceTimer = setTimeout(() => {
      this.isUserScrolling = false;
    }, 150);
  }

  /**
   * 🎯 Load older messages with scroll position preservation
   */
  // async loadOlderMessages() {
  //   if (this.isLoadingMore || !this.chatService.hasMoreMessages || !this.roomId) return;

  //   this.isLoadingMore = true;
  //   console.log('⬆️ Loading older messages...');

  //   try {
  //     const scrollElement = await this.ionContent.getScrollElement();
  //     const oldScrollHeight = scrollElement.scrollHeight;
  //     const oldScrollTop = scrollElement.scrollTop;

  //     await this.chatService.loadOlderMessages(this.roomId);

  //     await new Promise((resolve) => setTimeout(resolve, 100));

  //     const newScrollHeight = scrollElement.scrollHeight;
  //     const scrollDiff = newScrollHeight - oldScrollHeight;
  //     if (scrollDiff > 0) {
  //       await this.ionContent.scrollToPoint(0, oldScrollTop + scrollDiff, 0);
  //     }
  //     console.log('✅ Older messages loaded, scroll position maintained');
  //   } catch (error) {
  //     console.error('❌ Error loading older messages:', error);
  //   } finally {
  //     this.isLoadingMore = false;
  //   }
  // }

  //   async loadOlderMessages() {
  //   if (this.isLoadingMore || !this.chatService.hasMoreMessages || !this.roomId) return;

  //   this.isLoadingMore = true;
  //   console.log('⬆️ Loading older messages...');

  //   try {
  //     const scrollElement = await this.ionContent.getScrollElement();
  //     const oldScrollHeight = scrollElement.scrollHeight;
  //     const oldScrollTop = scrollElement.scrollTop;

  //     // ✅ Store current message count before loading
  //     const messageCountBefore = this.allMessage.length;

  //     await this.chatService.loadOlderMessages(this.roomId);

  //     // ✅ Wait for DOM to update
  //     await new Promise((resolve) => setTimeout(resolve, 100));

  //     const newScrollHeight = scrollElement.scrollHeight;
  //     const scrollDiff = newScrollHeight - oldScrollHeight;

  //     if (scrollDiff > 0) {
  //       // ✅ Preserve scroll position by adjusting for new content
  //       await this.ionContent.scrollToPoint(0, oldScrollTop + scrollDiff, 0);
  //     }

  //     // ✅ Get message count after loading
  //     const messageCountAfter = this.allMessage.length;
  //     const loadedCount = messageCountAfter - messageCountBefore;

  //     console.log(`✅ Loaded ${loadedCount} older messages, scroll position maintained`);
  //   } catch (error) {
  //     console.error('❌ Error loading older messages:', error);
  //   } finally {
  //     this.isLoadingMore = false;
  //   }
  // }

  async loadOlderMessages() {
    if (this.isLoadingMore || !this.chatService.hasMoreMessages || !this.roomId)
      return;

    this.isLoadingMore = true;
    console.log('⬆️ Loading older messages...');

    try {
      const isVirtualScroll =
        this.flatListForView.length > this.VIRTUAL_SCROLL_THRESHOLD;

      let scrollElement: HTMLElement;
      let oldScrollHeight: number;
      let oldScrollTop: number;

      if (isVirtualScroll) {
        // ✅ Virtual scroll viewport
        const viewport = document.querySelector(
          'cdk-virtual-scroll-viewport'
        ) as HTMLElement;
        if (!viewport) return;

        scrollElement = viewport;
        oldScrollHeight = viewport.scrollHeight;
        oldScrollTop = viewport.scrollTop;
      } else {
        // ✅ Normal ion-content
        scrollElement = await this.ionContent.getScrollElement();
        oldScrollHeight = scrollElement.scrollHeight;
        oldScrollTop = scrollElement.scrollTop;
      }

      // ✅ Store current message count before loading
      const messageCountBefore = this.allMessage.length;

      await this.chatService.loadOlderMessages(this.roomId);

      // ✅ Wait for DOM to update
      await new Promise((resolve) => setTimeout(resolve, 150));

      const newScrollHeight = scrollElement.scrollHeight;
      const scrollDiff = newScrollHeight - oldScrollHeight;

      if (scrollDiff > 0) {
        // ✅ Preserve scroll position by adjusting for new content
        if (isVirtualScroll) {
          scrollElement.scrollTop = oldScrollTop + scrollDiff;
        } else {
          await this.ionContent.scrollToPoint(0, oldScrollTop + scrollDiff, 0);
        }
      }

      // ✅ Get message count after loading
      const messageCountAfter = this.allMessage.length;
      const loadedCount = messageCountAfter - messageCountBefore;

      console.log(
        `✅ Loaded ${loadedCount} older messages, scroll position maintained`
      );
    } catch (error) {
      console.error('❌ Error loading older messages:', error);
    } finally {
      this.isLoadingMore = false;
    }
  }

  /**
   * 🎯 Handle message updates intelligently
   */
  private async handleMessageUpdate(previousCount: number, newCount: number) {
    // Wait for DOM update
    await this.waitForDOM();

    if (this.isInitialLoad) {
      // Initial load - always scroll to bottom
      this.scrollToBottomInstant();
      return;
    }

    if (newCount > previousCount) {
      // New messages received
      if (this.isNearBottom) {
        // User is near bottom - auto scroll to new message
        this.scrollToBottomSmooth();
      } else {
        // User is reading older messages - don't disturb
        console.log(
          '📨 New message received but user is scrolling up - not auto-scrolling'
        );
      }
    }
  }

  async scrollToBottomSmooth() {
    try {
      const isVirtualScroll =
        this.flatListForView.length > this.VIRTUAL_SCROLL_THRESHOLD;

      if (isVirtualScroll) {
        let viewport: HTMLElement | null = null;
        for (let i = 0; i < 5; i++) {
          viewport = document.querySelector(
            'cdk-virtual-scroll-viewport'
          ) as HTMLElement | null;
          if (viewport) break;
          await new Promise((r) => setTimeout(r, 80));
        }
        if (viewport)
          viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
      } else {
        if (!this.ionContent) return;
        await this.ionContent.scrollToBottom(300);
      }

      this.isNearBottom = true;
    } catch (error) {
      console.warn('scrollToBottomSmooth failed:', error);
    }
  }
  /**
   * 🎯 Scroll to bottom instantly (for initial load)
   */
  async scrollToBottomInstant() {
    try {
      const isVirtualScroll =
        this.flatListForView.length > this.VIRTUAL_SCROLL_THRESHOLD;

      if (isVirtualScroll) {
        let viewport: HTMLElement | null = null;
        for (let i = 0; i < 5; i++) {
          viewport = document.querySelector(
            'cdk-virtual-scroll-viewport'
          ) as HTMLElement | null;
          if (viewport) break;
          await new Promise((r) => setTimeout(r, 80));
        }
        if (viewport) viewport.scrollTop = viewport.scrollHeight;
      } else {
        if (!this.ionContent) return;
        await this.ionContent.scrollToBottom(0);
      }

      this.isNearBottom = true;
    } catch (error) {
      console.warn('scrollToBottomInstant failed:', error);
    }
  }
  /**
   * 🎯 Wait for DOM to update
   */
  private waitForDOM(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        setTimeout(() => resolve(), 50);
      });
    });
  }

  async loadMoreMessages() {
    if (this.isLoadingMore || !this.chatService.hasMoreMessages) return;
    await this.loadOlderMessages();
  }

  getRoomId(a: string, b: string): string {
    // ✅ FIX: Numeric comparison - single source of truth
    const numA = Number(a);
    const numB = Number(b);

    if (!isNaN(numA) && !isNaN(numB) && numA > 0 && numB > 0) {
      return numA < numB ? `${numA}_${numB}` : `${numB}_${numA}`;
    }

    return a < b ? `${a}_${b}` : `${b}_${a}`;
  }

  async listenForMessages() {
    this.observeVisibleMessages();
  }

  private async markDisplayedMessagesAsRead() {
    const unreadMessages = this.allMessage.filter(
      (msg: any) =>
        !(msg as any).read && (msg as any).receiver_id === this.senderId
    );
    for (const msg of unreadMessages) {
      await this.chatService.markRead(
        this.roomId,
        (msg as any).key ?? msg.msgId
      );
    }
  }

  observeVisibleMessages() {
    const allMessageElements = document.querySelectorAll('[data-msg-key]');

    allMessageElements.forEach((el: any) => {
      const msgKey = el.getAttribute('data-msg-key');
      const msgIndex = this.allMessage.findIndex(
        (m: any) => (m.key ?? m.msgId) === msgKey
      );
      if (msgIndex === -1) return;

      const msg = this.allMessage[msgIndex] as any;
      if (!msg.read && msg.receiver_id === this.senderId) {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                this.chatService.markRead(this.roomId, msgKey);
                observer.unobserve(entry.target);
              }
            });
          },
          {
            threshold: 1.0,
          }
        );

        observer.observe(el);
      }
    });
  }

  isLoadingIndicatorVisible(): boolean {
    return this.isLoadingMore;
  }

  async refreshMessages(event?: any) {
    try {
      this.lastMessageKey = null;
      this.chatService.resetPagination(this.roomId);
      await this.chatService.initialLoad(this.roomId);
      if (event) event.target.complete();
    } catch (error) {
      console.error('Error refreshing messages:', error);
      if (event) event.target.complete();
    }
  }

  /** No longer used: messages are loaded from PouchDB/Firebase only (localStorage removed). */
  async loadFromLocalStorage() {
    // Intentional no-op; kept for any legacy call sites.
  }

  blobToFile(blob: Blob, fileName: string, mimeType?: string): File {
    return new File([blob], fileName, {
      type: mimeType || blob.type,
      lastModified: Date.now(),
    });
  }

  async pickAttachment() {
    if (!(await this.checkNetworkBeforeAction('attachment'))) {
      return;
    }
    const result = await FilePicker.pickFiles({ readData: true });

    if (result?.files?.length) {
      const file = result.files[0];
      const mimeType = file.mimeType;
      const type = mimeType?.startsWith('image')
        ? 'image'
        : mimeType?.startsWith('video')
        ? 'video'
        : 'file';

      let blob = file.blob as Blob;

      if (!blob && file.data) {
        blob = this.FileService.convertToBlob(
          `data:${mimeType};base64,${file.data}`,
          mimeType
        );
      }

      const previewUrl = URL.createObjectURL(blob);
      // console.log({previewUrl})

      this.selectedAttachment = {
        type,
        blob,
        fileName: `${Date.now()}.${this.getFileExtension(file.name)}`,
        mimeType,
        fileSize: blob.size,
        previewUrl,
      };

      this.showPreviewModal = true;
    }
  }

  getFileExtension(fileName: string): string {
    const parts = fileName.split('.');
    return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
  }

  private async compressImage(blob: Blob): Promise<Blob> {
    if (!blob.type.startsWith('image/')) {
      return blob;
    }

    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1024,
      useWebWorker: true,
    };

    try {
      return await imageCompression(blob as any, options);
    } catch (err) {
      console.warn('Image compression failed:', err);
      return blob;
    }
  }

  // cancelAttachment() {
  //   this.selectedAttachment = null;
  //   this.showPreviewModal = false;
  //   this.messageText = '';
  // }

  cancelAttachment() {
    if (this.selectedAttachment?.previewUrl) {
      try {
        URL.revokeObjectURL(this.selectedAttachment.previewUrl);
      } catch (e) {
        console.warn('Failed to revoke preview URL:', e);
      }
    }

    this.selectedAttachment = null;
    this.showPreviewModal = false;
    this.messageText = '';
  }

  setReplyTo(message: IMessage) {
    this.replyToMessage = message;
  }

  /**
   * 🎯 Send message with smart scroll with spinner loader
   */
  async viewChannelInvite(event: Event, inviteData: any) {
    event.stopPropagation();

    const modal = await this.modalCtrl.create({
      component: InviteAdminPreviewModalComponent,
      componentProps: {
        inviteData: inviteData,
      },
      cssClass: 'invite-admin-preview-modal',
    });

    await modal.present();

    const { data } = await modal.onWillDismiss();
    if (data?.accepted) {
      // Logic after accepting invite is already handled in modal (redirection)
    }
  }

  onEnterKey(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey && this.enterToSend) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  async sendMessage() {
    if (!(await this.checkNetworkBeforeAction('send'))) {
      return;
    }
    if (this.isSending) {
      console.log('⚠️ Already sending, ignoring duplicate click');
      return;
    }

    // ✅ Set loading flag IMMEDIATELY
    this.isSending = true;

    try {
      // ✅ Group send permission check
      if (!this.canSendMessage) {
        const toast = await this.toastCtrl.create({
          message: 'Only admins can send messages in this group.',
          duration: 2000,
          color: 'warning',
        });
        await toast.present();
        return;
      }

      const plainText = (this.messageText || '').trim();

      // ✅ Validation
      if (!plainText && !this.selectedAttachment) {
        const toast = await this.toastCtrl.create({
          message: 'Type something to send',
          duration: 1500,
          color: 'warning',
        });
        await toast.present();
        return;
      }

      // Build message
      const msgId = uuidv4();
      const timestamp = Date.now();

      const localMessage: Partial<IMessage & { attachment?: IAttachment }> = {
        sender: this.senderId,
        sender_name: this.sender_name,
        sender_phone: this.sender_phone,
        receiver_id: this.receiverId,
        text: plainText || '',
        timestamp,
        msgId,
        replyToMsgId: this.replyTo?.message?.msgId || '',
        isEdit: false,
        isPinned: false,
        type: 'text',
        reactions: [],
        translations: {
          original: {
            code: 'en',
            label: 'English (Original)',
            text: plainText || '',
          },
        },
      };

      // ✅ Handle attachment if present
      if (this.selectedAttachment) {
        try {
          const mediaId = await this.uploadAttachmentToS3(
            this.selectedAttachment
          );

          localMessage.attachment = {
            type: this.selectedAttachment.type,
            msgId,
            mediaId,
            fileName: this.selectedAttachment.fileName,
            mimeType: this.selectedAttachment.mimeType,
            fileSize: this.selectedAttachment.fileSize,
            caption: plainText || '',
          };
          // copy duration if computed earlier
          if ((this.selectedAttachment as any).duration) {
            localMessage.attachment.duration = (
              this.selectedAttachment as any
            ).duration;
          }

          localMessage.attachment.localUrl =
            await this.FileService.saveFileToSent(
              this.selectedAttachment.fileName,
              this.selectedAttachment.blob
            );
        } catch (error) {
          console.error('❌ Failed to upload attachment:', error);

          const toast = await this.toastCtrl.create({
            message: 'Failed to upload attachment. Please try again.',
            duration: 3000,
            color: 'danger',
          });
          await toast.present();
          return;
        }
      }

      // ✅ Send message to Firebase
      await this.chatService.sendMessage(localMessage);

      // ✅ Clear UI
      this.messageText = '';
      this.showSendButton = false;
      this.selectedAttachment = null;
      this.showPreviewModal = false;
      this.replyToMessage = null;
      this.replyTo = null;

      await this.stopTypingSignal();

      // ✅ Scroll to bottom
      await this.waitForDOM();
      this.scrollToBottomSmooth();

      this.chatService.setTypingStatus(false);
      if (this.typingTimeout) {
        clearTimeout(this.typingTimeout);
      }
    } catch (error) {
      console.error('❌ Error sending message:', error);

      const toast = await this.toastCtrl.create({
        message: 'Failed to send message. Please try again.',
        duration: 3000,
        color: 'danger',
      });
      await toast.present();
    } finally {
      // ✅ ALWAYS reset loading flags
      this.isSending = false;
      // 📤 Reset audio sending state only if it was in progress
      if (this.isAudioSending) {
        this.isAudioSending = false;
      }
      // ✅ Force UI update
      try {
        this.cdr.detectChanges();
      } catch (e) {
        console.warn('detectChanges warning:', e);
      }
    }
  }

  /**
   * 🎯 Group messages by date (filter empty/deleted)
   */
  // async groupMessagesByDate(messages: Message[]) {
  //   const grouped: { [date: string]: any[] } = {};
  //   const today = new Date();
  //   const yesterday = new Date();
  //   yesterday.setDate(today.getDate() - 1);

  //   if (!messages || messages.length === 0) {
  //     return [];
  //   }

  //   // Filter out hidden messages
  //   const visibleMessages = messages.filter(
  //     (msg) => !this.isMessageHiddenForUser(msg)
  //   );

  //   for (const msg of visibleMessages) {
  //     const timestamp = new Date(msg.timestamp);

  //     const hours = timestamp.getHours();
  //     const minutes = timestamp.getMinutes();
  //     const ampm = hours >= 12 ? 'PM' : 'AM';
  //     const formattedHours = hours % 12 || 12;
  //     const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
  //     (msg as any).time = `${formattedHours}:${formattedMinutes} ${ampm}`;

  //     const isToday =
  //       timestamp.getDate() === today.getDate() &&
  //       timestamp.getMonth() === today.getMonth() &&
  //       timestamp.getFullYear() === today.getFullYear();

  //     const isYesterday =
  //       timestamp.getDate() === yesterday.getDate() &&
  //       timestamp.getMonth() === yesterday.getMonth() &&
  //       timestamp.getFullYear() === yesterday.getFullYear();

  //     let label = '';
  //     if (isToday) {
  //       label = 'Today';
  //     } else if (isYesterday) {
  //       label = 'Yesterday';
  //     } else {
  //       const dd = timestamp.getDate().toString().padStart(2, '0');
  //       const mm = (timestamp.getMonth() + 1).toString().padStart(2, '0');
  //       const yyyy = timestamp.getFullYear();
  //       label = `${dd}/${mm}/${yyyy}`;
  //     }

  //     if (!grouped[label]) {
  //       grouped[label] = [];
  //     }
  //     grouped[label].push(msg);
  //   }

  //   return Object.keys(grouped)
  //     .filter((date) => grouped[date].length > 0)
  //     .map((date) => ({
  //       date,
  //       messages: grouped[date],
  //     }));
  // }

  async groupMessagesByDate(messages: Message[]) {
    const grouped: { [date: string]: any[] } = {};
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (!messages || messages.length === 0) {
      return [];
    }

    // Filter out hidden messages
    const visibleMessages = messages.filter(
      (msg) => !this.isMessageHiddenForUser(msg)
    );

    for (const msg of visibleMessages) {
      // ✅ FIX 1: isMe normalize karo — sender type mismatch (number vs string) handle karna
      // Yeh "delete for everyone" ke baad order change hone ka root cause tha
      if ((msg as any).isMe === undefined || (msg as any).isMe === null) {
        (msg as any).isMe =
          String((msg as any).sender) === String(this.senderId);
      } else {
        // Already set hai lekin re-confirm karo — Firebase onChildChanged ke baad
        // isMe galat value aa sakti thi
        (msg as any).isMe =
          (msg as any).isMe === true
            ? true
            : String((msg as any).sender) === String(this.senderId);
      }

      const timestamp = new Date(msg.timestamp);

      const hours = timestamp.getHours();
      const minutes = timestamp.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const formattedHours = hours % 12 || 12;
      const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
      (msg as any).time = `${formattedHours}:${formattedMinutes} ${ampm}`;

      // ✅ Initialize audio message properties to prevent blinking
      if ((msg as any).attachment?.type === 'audio') {
        (msg as any)._isPlaying = (msg as any)._isPlaying || false;
        (msg as any)._speed = (msg as any)._speed || '1x';
        // initialize duration from persisted field so we never show 00:00
        const stored = (msg as any).attachment.duration;
        if (stored) {
          (msg as any)._duration = stored;
          (msg as any)._currentTime = stored;
        }
      }

      const isToday =
        timestamp.getDate() === today.getDate() &&
        timestamp.getMonth() === today.getMonth() &&
        timestamp.getFullYear() === today.getFullYear();

      const isYesterday =
        timestamp.getDate() === yesterday.getDate() &&
        timestamp.getMonth() === yesterday.getMonth() &&
        timestamp.getFullYear() === yesterday.getFullYear();

      let label = '';
      if (isToday) {
        label = 'Today';
      } else if (isYesterday) {
        label = 'Yesterday';
      } else {
        const dd = timestamp.getDate().toString().padStart(2, '0');
        const mm = (timestamp.getMonth() + 1).toString().padStart(2, '0');
        const yyyy = timestamp.getFullYear();
        label = `${dd}/${mm}/${yyyy}`;
      }

      if (!grouped[label]) {
        grouped[label] = [];
      }
      grouped[label].push(msg);
    }

    return Object.keys(grouped)
      .filter((date) => grouped[date].length > 0)
      .map((date) => ({
        date,
        messages: grouped[date],
      }));
  }

  /** Build flat list for CDK virtual scroll (date + message items) */
  buildFlatListForView(): void {
    const flat: Array<
      { type: 'date'; date: string } | { type: 'message'; message: any }
    > = [];
    for (const group of this.groupedMessages) {
      if (group.messages?.length) {
        flat.push({ type: 'date', date: group.date });
        for (const m of group.messages) {
          flat.push({ type: 'message', message: m });
        }
      }
    }
    this.flatListForView = flat;
  }

  trackByFlatItem(
    _idx: number,
    item: { type: string; date?: string; message?: any }
  ): string {
    if (item.type === 'date') return `date-${item.date}`;
    return `msg-${item.message?.msgId ?? item.message?.key ?? _idx}`;
  }

  /** Called when virtual scroll viewport is scrolled; load older messages near top */
  onVirtualViewportScroll(event: Event): void {
    const el = event.target as HTMLElement;
    const scrollTop = el.scrollTop || 0;
    if (
      scrollTop < 100 &&
      !this.isLoadingMore &&
      this.chatService.hasMoreMessages &&
      this.roomId
    ) {
      this.loadOlderMessages();
    }
  }

  /**
   * 🎯 Check if message is hidden for current user
   */
  isMessageHiddenForUser(msg: any): boolean {
    if (!msg) return false;
    // if (msg.isSystemMessage === true || msg.type === 'system') return true;
    if (msg.isDisappeared === true) return true;

    // ✅ BLOCK FILTER: If message was sent while sender was blocked, hide it from the receiver
    // The receiver should NOT see messages sent by someone they have blocked
    if (msg.blockedSend === true && msg.sender !== this.senderId) {
      return true;
    }

    // User-specific deletion — handles new format { users: [] } and old flat format { userId: true }
    if (msg.deletedFor) {
      if (Array.isArray(msg.deletedFor.users)) {
        const users = msg.deletedFor.users.map((u: any) => String(u));
        if (users.includes(String(this.senderId))) return true;
      }
      // Old flat format backward compat
      if (msg.deletedFor[String(this.senderId)] === true) return true;
    }

    return false;
  }

  getDeletedPlaceholderText(msg: any): string {
    if (msg?.deletedFor?.everyone) {
      return msg?.sender === this.senderId
        ? 'You deleted this message'
        : 'This message was deleted';
    }
    return '';
  }

  startLongPress(msg: any, event?: TouchEvent) {
    if (msg?.deletedFor?.everyone) return;

    if (event?.touches?.[0]) {
      this.msgTouchStartX = event.touches[0].clientX;
      this.msgTouchStartY = event.touches[0].clientY;
    }

    this.isLongPressing = false;

    this.longPressTimeout = setTimeout(async () => {
      this.isLongPressing = true;
      try {
        await Haptics.impact({ style: ImpactStyle.Medium });
      } catch (e) {
        /* No haptics on web */
      }
      this.onLongPress(msg);
    }, 500); // 500ms is standard
  }

  onMessageTouchMove(event: TouchEvent) {
    if (!this.longPressTimeout || this.isLongPressing) return;

    const touch = event.touches[0];
    const deltaX = Math.abs(touch.clientX - this.msgTouchStartX);
    const deltaY = Math.abs(touch.clientY - this.msgTouchStartY);

    if (deltaX > 10 || deltaY > 10) {
      this.cancelLongPress();
    }
  }

  cancelLongPress() {
    if (this.longPressTimeout) {
      clearTimeout(this.longPressTimeout);
      this.longPressTimeout = null;
    }
    this.isLongPressing = false;
  }

  onLongPress(msg: any) {
    this.selectedMessages = [msg];
    this.lastPressedMessage = msg;
  }

  onMessageClick(msg: any) {
    if (msg?.deletedFor?.everyone) return;
    if (this.selectedMessages.length > 0) {
      this.toggleSelection(msg);
      this.lastPressedMessage = msg;
    }
  }

  toggleSelection(msg: any) {
    if (msg?.deletedFor?.everyone) return;
    const index = this.selectedMessages.findIndex((m) => m.msgId === msg.msgId);
    if (index > -1) {
      this.selectedMessages.splice(index, 1);
    } else {
      this.selectedMessages.push(msg);
    }
    this.lastPressedMessage = msg;
  }

  private waitForFadeOut(ids: string[]): Promise<void> {
    const timeoutMs = 1300;
    const selectors = (id: string) => [
      `[data-msg-key="${id}"].message-bubble.fade-out`,
      `[data-msg-key="${id}"].wa-audio-wrapper.fade-out`,
      `.message-bubble[data-msg-key="${id}"].fade-out`,
      `.wa-audio-wrapper[data-msg-key="${id}"].fade-out`,
    ];
    const waits = ids.map((id) => {
      return new Promise<void>((resolve) => {
        const resolveOnce = () => {
          resolved = true;
          resolve();
        };
        let resolved = false;
        const start = Date.now();
        const tryAttach = () => {
          if (resolved) return;
          const sel = selectors(id).join(',');
          const el = document.querySelector(sel) as HTMLElement | null;
          if (el) {
            const onEnd = () => {
              el.removeEventListener('animationend', onEnd);
              resolveOnce();
            };
            el.addEventListener('animationend', onEnd, { once: true });
            setTimeout(() => {
              if (!resolved) {
                el.removeEventListener('animationend', onEnd);
                resolveOnce();
              }
            }, timeoutMs);
          } else {
            if (Date.now() - start > timeoutMs) {
              resolveOnce();
            } else {
              setTimeout(tryAttach, 50);
            }
          }
        };
        tryAttach();
      });
    });
    return Promise.all(waits).then(() => undefined);
  }

  async getPreviewUrl(msg: any) {
    return await this.chatService.getPreviewUrl(msg);
  }

  startReceiverStatusPoll(pollIntervalMs = 30000) {
    if (!this.receiverId) return;

    this.presence
      .getStatus(Number(this.receiverId))
      .subscribe((res) => this.handleStatusResponse(res));
    // Start polling while view is active:
    this.statusPollSub = timer(pollIntervalMs, pollIntervalMs)
      .pipe(switchMap(() => this.presence.getStatus(Number(this.receiverId))))
      .subscribe((res) => this.handleStatusResponse(res));
  }

  handleStatusResponse(res: any) {
    if (!res || !res.data) {
      this.receiverOnline = false;
      this.receiverLastSeen = null;
      return;
    }
    this.receiverOnline = Number(res.data.is_online) === 1;
    this.receiverLastSeen = res.data.last_seen
      ? this.formatLastSeen(res.data.last_seen)
      : null;
  }

  isEmptyObject(obj: any): boolean {
    return obj && Object.keys(obj).length === 0;
  }

  private async uploadAttachmentToS3(attachment: any): Promise<string> {
    try {
      const uploadResponse = await firstValueFrom(
        this.service.getUploadUrl(
          parseInt(this.senderId),
          attachment.type,
          attachment.fileSize,
          attachment.mimeType,
          {
            caption: this.messageText.trim(),
            fileName: attachment.fileName,
          }
        )
      );

      if (!uploadResponse?.status || !uploadResponse.upload_url) {
        throw new Error('Failed to get upload URL');
      }

      const uploadResult = await firstValueFrom(
        this.service.uploadToS3(
          uploadResponse.upload_url,
          this.blobToFile(
            attachment.blob,
            attachment.fileName,
            attachment.mimeType
          )
        )
      );

      return uploadResponse.media_id;
    } catch (error) {
      console.error('S3 upload error:', error);
      throw error;
    }
  }

  async openAttachmentModal(msg: any) {
    if (!msg.attachment?.type) return;

    try {
      let localUrl = msg.attachment.localUrl;

      if (!localUrl) {
        if (!msg.isMe) {
          const relativePath = await this.downloadAndSaveLocally(
            this.escapeUrl(msg.attachment.cdnUrl),
            msg.attachment.fileName
          );

          if (relativePath) {
            localUrl = await this.FileService.getFilePreview(relativePath);

            await this.chatPouchDb.updateAttachment(msg.msgId, { localUrl });
          }
        }
      }

      const modal = await this.modalCtrl.create({
        component: AttachmentPreviewModalComponent,
        componentProps: {
          attachment: {
            ...msg.attachment,
            url: localUrl || this.escapeUrl(msg.attachment.cdnUrl),
          },
          message: msg,
        },
        cssClass: 'attachment-modal',
      });

      await modal.present();

      const { data } = await modal.onDidDismiss();
      if (data?.action === 'reply') {
        this.setReplyToMessage(data.message);
      }
    } catch (error) {
      console.error('Failed to load attachment:', error);
      const toast = await this.toastCtrl.create({
        message: 'Failed to load attachment',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  private async downloadAndSaveLocally(url: string, fileName: string) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return await this.FileService.saveFileToReceived(fileName, blob);
    } catch (error) {
      console.warn('Failed to save file locally:', error);
      return null;
    }
  }

  getAttachmentPreview(attachment: any): string {
    if (attachment.caption) {
      return attachment.caption.length > 30
        ? attachment.caption.substring(0, 30) + '...'
        : attachment.caption;
    }

    switch (attachment.type) {
      case 'image':
        return '📷 Photo';
      case 'video':
        return '🎥 Video';
      case 'audio':
        return '🎵 Audio';
      case 'file':
        return attachment.fileName || '📄 File';
      default:
        return '📎 Attachment';
    }
  }

  async showAttachmentPreviewPopup() {
    const alert = await this.alertController.create({
      header: 'Send Attachment',
      message: this.getAttachmentPreviewHtml(),
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          handler: () => {
            this.selectedAttachment = null;
          },
        },
        {
          text: 'Send',
          handler: () => {
            this.sendMessage();
          },
        },
      ],
    });

    await alert.present();
  }

  getAttachmentPreviewHtml(): string {
    if (!this.selectedAttachment) return '';

    const { type, base64Data, fileName } = this.selectedAttachment;

    if (type === 'image') {
      return `<img src="${base64Data}" style="max-width: 100%; border-radius: 8px;" />`;
    } else if (type === 'video') {
      return `<video controls style="max-width: 100%; border-radius: 8px;">
              <source src="${base64Data}" type="video/mp4" />
            </video>`;
    } else if (type === 'audio') {
      return `<audio controls>
              <source src="${base64Data}" type="audio/mpeg" />
            </audio>`;
    } else {
      return `<p>📎 ${fileName || 'File attached'}</p>`;
    }
  }

  getMimeTypeFromName(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'pdf':
        return 'application/pdf';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      default:
        return '';
    }
  }

  async addReaction(msg: IMessage, emoji: string) {
    if (!(await this.checkNetworkBeforeAction('reaction'))) {
      return;
    }
    const userId = this.senderId;
    const current =
      msg.reactions?.find(
        (r: { userId: string; emoji?: string | null }) => r.userId == userId
      ) || null;
    const newVal = current?.emoji === emoji ? null : emoji;

    try {
      await this.chatService.setQuickReaction({
        msgId: msg.msgId,
        userId,
        emoji: newVal,
      });
      this.selectedMessages = [];
    } catch (error) {
      console.error('Reaction not save', error);
    }
  }

  async openEmojiKeyboardForInput() {
    try {
      const modal = await this.modalCtrl.create({
        component: EmojiPickerModalComponent,
        cssClass: 'emoji-picker-modal',
        breakpoints: [0, 0.5, 0.75, 1],
        initialBreakpoint: 0.75,
        backdropDismiss: true,
      });

      await modal.present();

      const { data } = await modal.onDidDismiss();

      if (data && data.selected && data.emoji) {
        console.log('✅ Emoji selected:', data.emoji);

        // Add emoji to the message input
        const currentText = this.messageText || '';
        this.messageText = currentText + data.emoji;

        // Update send button visibility
        this.showSendButton = this.messageText.trim().length > 0;

        // Focus back on input
        setTimeout(() => {
          const textareaElement = document.querySelector(
            'ion-textarea'
          ) as HTMLIonTextareaElement;
          if (textareaElement) {
            textareaElement.setFocus();
          }
        }, 100);
      }
    } catch (error) {
      console.error('❌ Error opening emoji picker:', error);

      const toast = await this.toastCtrl.create({
        message: 'Failed to open emoji picker',
        duration: 2000,
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
    }
  }

  async openEmojiKeyboard(msg: IMessage) {
    try {
      const modal = await this.modalCtrl.create({
        component: EmojiPickerModalComponent,
        cssClass: 'emoji-picker-modal',
        breakpoints: [0, 0.5, 0.75, 1],
        initialBreakpoint: 0.75,
        backdropDismiss: true,
      });

      await modal.present();

      const { data } = await modal.onDidDismiss();

      if (data && data.selected && data.emoji) {
        console.log('✅ Emoji selected:', data.emoji);

        // Add reaction to the message
        await this.addReaction(msg, data.emoji);

        // Clear selection
        this.selectedMessages = [];

        // Show success toast
        const toast = await this.toastCtrl.create({
          message: `Reaction added: ${data.emoji}`,
          duration: 1500,
          color: 'success',
          position: 'top',
        });
        await toast.present();
      }
    } catch (error) {
      console.error('❌ Error opening emoji picker:', error);

      const toast = await this.toastCtrl.create({
        message: 'Failed to open emoji picker',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  onEmojiPicked(ev: CustomEvent) {
    const val = (ev.detail as any)?.value || '';
    const emoji = val?.trim();
    if (!emoji || !this.emojiTargetMsg) return;
    // this.addReaction(this.emojiTargetMsg, emoji);

    // clear input so next pick fires change again
    const native = (ev.target as any)?.querySelector?.(
      'input'
    ) as HTMLInputElement;
    if (native) native.value = '';
    this.emojiTargetMsg = null;
  }

  /** Summary already exists; re-use it to build compact badges */
  getReactionSummary(
    msg: Message
  ): Array<{ emoji: string; count: number; mine: boolean }> {
    const map = msg.reactions || {};
    const byEmoji: Record<string, number> = {};
    Object.values(map).forEach((e: any) => {
      const em = String(e || '');
      if (!em) return;
      byEmoji[em] = (byEmoji[em] || 0) + 1;
    });
    return Object.keys(byEmoji)
      .map((emoji) => ({
        emoji,
        count: byEmoji[emoji],
        mine: map[this.senderId] === emoji,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /** Return max 3 badges; prefer user's reaction first */
  getReactionBadges(
    msg: Message
  ): Array<{ emoji: string; count: number; mine: boolean }> {
    const list = this.getReactionSummary(msg);
    // Put "mine" first if exists
    const mineIdx = list.findIndex((x) => x.mine);
    if (mineIdx > 0) {
      const mine = list.splice(mineIdx, 1)[0];
      list.unshift(mine);
    }
    return list.slice(0, 3);
  }

  getReactionsCount(msg: IMessage) {
    return (
      msg.reactions?.filter((r: { emoji?: string | null }) => !!r.emoji)
        .length || 0
    );
  }

  async onReactionBadgeClick(
    ev: Event,
    msg: IMessage,
    badge: { emoji: string | null; userId: string }
  ) {
    ev.stopPropagation();

    const currentUserId = this.senderId;

    // If user clicks any reaction badge, toggle their reaction with same emoji
    const currentReaction = msg.reactions?.find(
      (r: { userId: string; emoji?: string | null }) =>
        r.userId === currentUserId
    );
    const newEmoji =
      currentReaction?.emoji === badge.emoji ? null : badge.emoji;

    try {
      await this.chatService.setQuickReaction({
        msgId: msg.msgId,
        userId: currentUserId,
        emoji: newEmoji,
      });
    } catch (error) {
      console.error('Failed to update reaction:', error);
    }
  }

  goToProfile() {
    // const isGroup = this.chatType === 'group';
    const queryParams: any = {
      receiverId: this.receiverId,
      isGroup: this.chatType === 'group' ? 'true' : 'false',
    };

    this.router.navigate(['/profile-screen'], { queryParams });
  }

  /** No longer used: messages are not stored in localStorage (PouchDB only). */
  saveToLocalStorage() {
    // Intentional no-op.
  }

  scrollToBottom() {
    requestAnimationFrame(() => {
      this.scrollToBottomSmooth().catch(() => {});
    });
  }

  onInputChange() {
    this.showSendButton = this.messageText?.trim().length > 0;
  }

  onInputFocus() {
    this.setDynamicPadding();
  }

  onInputBlur() {
    this.onInputBlurTyping();
    this.setDynamicPadding();
  }

  goToCallingScreen() {
    // this.router.navigate(['/calling-screen']);
    console.log('will work in future');
  }

  async openCamera() {
    if (!(await this.checkNetworkBeforeAction('camera'))) {
      return;
    }
    try {
      // Capture photo from camera
      const image = await Camera.getPhoto({
        source: CameraSource.Camera,
        quality: 90,
        resultType: CameraResultType.Uri,
      });

      if (!image.webPath) {
        throw new Error('No image path returned');
      }

      // Fetch the image blob from the webPath
      const response = await fetch(image.webPath);
      const blob = await response.blob();

      // Generate filename with timestamp
      const timestamp = Date.now();
      const fileName = `camera_${timestamp}.${image.format || 'jpg'}`;
      const mimeType = `image/${image.format || 'jpeg'}`;

      // Create preview URL
      const previewUrl = URL.createObjectURL(blob);

      this.selectedAttachment = {
        type: 'image',
        blob: blob,
        fileName: fileName,
        mimeType: mimeType,
        fileSize: blob.size,
        previewUrl: previewUrl,
      };
      console.log('this selected attachment', this.selectedAttachment);

      // Show preview modal
      this.showPreviewModal = true;
    } catch (error) {
      console.error('Camera error:', error);

      const toast = await this.toastCtrl.create({
        message: 'Failed to capture photo. Please try again.',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  // ========================================
  // 📸 CROPPER MODAL INTEGRATION
  // ========================================

  async openCropperModal() {
    if (!this.selectedAttachment || this.selectedAttachment.type !== 'image') {
      return;
    }

    try {
      const modal = await this.modalCtrl.create({
        component: ImageCropperModalComponent,
        componentProps: {
          imageUrl: this.selectedAttachment.previewUrl,
          aspectRatio: 0, // Free aspect ratio
          cropQuality: 0.9,
        },
        cssClass: 'image-cropper-modal',
      });

      await modal.present();

      const { data } = await modal.onDidDismiss();

      if (data && data.success && data.originalBlob) {
        if (this.selectedAttachment.previewUrl) {
          URL.revokeObjectURL(this.selectedAttachment.previewUrl);
        }

        // ✅ Create new preview URL from cropped blob
        const newPreviewUrl = URL.createObjectURL(data.originalBlob);

        // ✅ Generate new filename with timestamp
        const timestamp = Date.now();
        const fileExtension =
          this.selectedAttachment.fileName.split('.').pop() || 'jpg';
        const newFileName = `cropped_${timestamp}.${fileExtension}`;

        // ✅ Update selectedAttachment with cropped image data
        this.selectedAttachment = {
          ...this.selectedAttachment,
          blob: data.originalBlob,
          previewUrl: newPreviewUrl,
          fileName: newFileName,
          fileSize: data.originalBlob.size,
          mimeType: data.originalBlob.type || this.selectedAttachment.mimeType,
        };

        // ✅ Show success toast
        const toast = await this.toastCtrl.create({
          message: 'Image cropped successfully',
          duration: 1500,
          color: 'success',
        });
        await toast.present();
      } else if (data && data.cancelled) {
        // User cancelled cropping
        console.log('Cropping cancelled by user');
      } else if (data && data.error) {
        // Show error toast
        const toast = await this.toastCtrl.create({
          message: data.error,
          duration: 2000,
          color: 'danger',
        });
        await toast.present();
      }
    } catch (error) {
      console.error('Error opening cropper modal:', error);
      const toast = await this.toastCtrl.create({
        message: 'Failed to open image editor',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  openKeyboard() {
    setTimeout(() => {
      const textareaElement = document.querySelector(
        'ion-textarea'
      ) as HTMLIonTextareaElement;
      if (textareaElement) {
        textareaElement.setFocus();
      }
    }, 100);
  }

  ngOnDestroy() {
    this.clearAllExpiryTimers();
    this.keyboardListeners.forEach((listener) => listener?.remove());
    this.messageSub?.unsubscribe();
    if (this.pinnedMessageSubscription) {
      try {
        this.pinnedMessageSubscription();
      } catch (e) {}
    }
    this.typingRxSubs.forEach((s) => s.unsubscribe());
    try {
      if (this.typingUnsubscribe) this.typingUnsubscribe();
    } catch (e) {}
    this.stopTypingSignal();

    window.removeEventListener('resize', this.resizeHandler);
    if ((this as any)._ro) {
      (this as any)._ro.disconnect();
    }

    if (this.groupMembershipUnsubscribe) {
      this.groupMembershipUnsubscribe();
      this.groupMembershipUnsubscribe = null;
    }

    // for back btn subscription
    //   if (this.backButtonSubscription) {
    //   this.backButtonSubscription.unsubscribe();
    //   this.backButtonSubscription = null;
    // }
    try {
      if (this.iBlockedRef) off(this.iBlockedRef);
      if (this.theyBlockedRef) off(this.theyBlockedRef);
      clearTimeout(this.blockBubbleTimeout);
    } catch (e) {}

    this.onValueUnsubs.forEach((fn) => {
      try {
        fn();
      } catch (e) {}
    });
    this.onValueUnsubs = [];
    this.statusPollSub?.unsubscribe();

    this.presenceSubscription?.unsubscribe();
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    if (this.loadingController) {
      this.loadingController.dismiss().catch(() => {});
      this.loadingController = undefined;
    }

    this.batchSub?.unsubscribe();

    // ✅ Save sync state if still syncing
    if (this.isSyncing && this.roomId) {
      localStorage.setItem('lastSyncRoomId', this.roomId);
      localStorage.setItem(
        'lastSyncMessageCount',
        String(this.lastSyncedMessageCount)
      );
    }
  }

  private isGestureNavigation(): boolean {
    const screenHeight = window.screen.height || 0;
    const innerHeight = window.innerHeight || 0;
    const diff = screenHeight - innerHeight;
    return diff < 40;
  }

  private isTransparentButtonNav(): boolean {
    const screenHeight = window.screen.height || 0;
    const innerHeight = window.innerHeight || 0;
    const diff = screenHeight - innerHeight;
    return diff < 5;
  }

  setDynamicPadding() {
    const footerEl = this.el.nativeElement.querySelector(
      '.footer-fixed'
    ) as HTMLElement;
    if (!footerEl) return;

    if (this.platform.is('ios')) {
      const safeAreaBottom =
        parseInt(
          getComputedStyle(document.documentElement).getPropertyValue(
            '--ion-safe-area-bottom'
          )
        ) || 0;

      if (safeAreaBottom > 0) {
        this.renderer.setStyle(footerEl, 'padding-bottom', '16px');
      } else {
        this.renderer.setStyle(footerEl, 'padding-bottom', '6px');
      }
    } else {
      if (this.isGestureNavigation()) {
        this.renderer.setStyle(footerEl, 'padding-bottom', '35px');
      } else if (this.isTransparentButtonNav()) {
        this.renderer.setStyle(footerEl, 'padding-bottom', '35px');
      } else {
        this.renderer.setStyle(footerEl, 'padding-bottom', '6px');
      }
    }
  }

  onKeyboardOrInputChange() {
    this.setDynamicPadding();
  }

  // ---------- small helpers ----------
  private escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  //for removing query params from local or cdn url
  escapeUrl(url: any) {
    return url.replace(/[?#].*$/, '');
  }

  // --------------------------translation module added on 1 nov-----

  // // ============================================
  // // UPDATED TRANSLATION MODULE - 3 CASES LOGIC
  // // ============================================

  showTranslationOptions = false;
  // ✅ NEW: Flag to track if send is in progress
  isSendingFromTranslationCard = false;
  myLangCode = 'en';
  receiverLangCode = 'hi';
  myLangLabel = 'English';
  receiverLangLabel = 'English';
  translatedPreview: string | null = null;
  // consent storage key
  readonly TRANSLATION_CONSENT_KEY = 'translationConsent'; // values: 'granted' | 'denied'

  // UI flag (optional) to show a small consent banner in the footer if needed
  showTranslationConsentBanner = false;

  /** Return true if user has already granted translation consent */
  hasTranslationConsent(): boolean {
    try {
      const v = localStorage.getItem(this.TRANSLATION_CONSENT_KEY);
      return v === 'granted';
    } catch {
      return false;
    }
  }
  /**
   * Shows an Alert asking user to allow using the translation API.
   * Returns true if user grants consent, false otherwise.
   */
  async askForTranslationConsent(): Promise<boolean> {
    // If already granted, skip
    if (this.hasTranslationConsent()) return true;

    // If explicitly denied previously, still show prompt? Here we re-prompt — change if you want.
    return new Promise<boolean>(async (resolve) => {
      const alert = await this.alertCtrl.create({
        header: 'Allow translations?',
        subHeader:
          'Translation requires sending message text to an external service',
        message: `
        To provide message translations we send the message text to a third-party translation service.
       
        We do not collect personal account details. Only the message text is sent.
        If you agree, translations will be fetched and cached locally. You can revoke this permission anytime.
      `,
        buttons: [
          {
            text: 'Decline',
            role: 'cancel',
            handler: () => {
              try {
                localStorage.setItem(this.TRANSLATION_CONSENT_KEY, 'denied');
              } catch {}
              this.showToast('Translation declined', 'medium');
              resolve(false);
            },
          },
          {
            text: 'Allow & Proceed',
            handler: () => {
              try {
                localStorage.setItem(this.TRANSLATION_CONSENT_KEY, 'granted');
              } catch {}
              this.showToast('Translation allowed', 'success');
              resolve(true);
            },
          },
        ],
        backdropDismiss: false,
      });

      await alert.present();
    });
  }
  /**
   * Ensure consent exists — if not, prompt the user. Returns true only if consent granted.
   */
  async ensureTranslationConsent(): Promise<boolean> {
    if (this.hasTranslationConsent()) return true;
    const granted = await this.askForTranslationConsent();
    return granted;
  }

  // ✅ NEW: Loading states for translation buttons
  isTranslatingToMy = false;
  isTranslatingToReceiver = false;
  isTranslatingOriginal = false;
  isTranslatingCustom = false; // ✅ NEW: For custom language selection

  translationApiBase =
    'https://script.google.com/macros/s/AKfycbz069QioIcP8CO2ly7j29cyQPQjzQKywYcrDicxqG35_bQ3Ch_fcuVORsMAdAWu5-uh/exec';

  languageMap: Record<string, string> = {
    'ar-EG': 'Arabic (Egypt)',
    'ar-SA': 'Arabic (Saudi Arabia)',
    'bn-BD': 'Bengali (Bangladesh)',
    'de-DE': 'German (Germany)',
    'en-GB': 'English (UK)',
    'en-IN': 'English (India)',
    'en-US': 'English (US)',
    'es-ES': 'Spanish (Spain)',
    'es-MX': 'Spanish (Mexico)',
    'fa-IR': 'Persian (Iran)',
    'fr-FR': 'French (France)',
    'gu-IN': 'Gujarati (India)',
    'hi-IN': 'Hindi (India)',
    'it-IT': 'Italian (Italy)',
    'ja-JP': 'Japanese',
    'ko-KR': 'Korean',
    'mr-IN': 'Marathi (India)',
    'pa-IN': 'Punjabi (India)',
    'pt-BR': 'Portuguese (Brazil)',
    'pt-PT': 'Portuguese (Portugal)',
    'ru-RU': 'Russian',
    'ta-IN': 'Tamil (India)',
    'te-IN': 'Telugu (India)',
    'th-TH': 'Thai',
    'tr-TR': 'Turkish',
    'ur-PK': 'Urdu (Pakistan)',
    'vi-VN': 'Vietnamese',
    'zh-CN': 'Chinese (Simplified)',
    'zh-TW': 'Chinese (Traditional)',
  };

  // ✅ NEW: Get all languages as array for dropdown
  get languagesList() {
    return Object.entries(this.languageMap).map(([code, label]) => ({
      code,
      label,
    }));
  }

  /**
   * ✅ UPDATED: languageName method - removes country codes in parentheses
   */
  languageName(code: string): string {
    const full = this.languageMap[code] || code;

    // Remove anything inside parentheses: (India), (Mexico), etc.
    const cleaned = full.replace(/\s*\(.*?\)/g, '');

    return cleaned.trim();
  }

  apiLanguageCode(localeCode: string): string {
    const specialCases: Record<string, string> = {
      'zh-CN': 'zh',
      'zh-TW': 'zh-TW',
      'pt-BR': 'pt',
      'pt-PT': 'pt',
      'en-GB': 'en',
      'en-IN': 'en',
      'es-ES': 'es',
      'es-MX': 'es',
    };

    if (specialCases[localeCode]) {
      return specialCases[localeCode];
    }

    return localeCode.split('-')[0];
  }

  async loadLanguages() {
    try {
      const myLang = localStorage.getItem('app_language');
      this.myLangCode = myLang || this.myLangCode;
      this.myLangLabel = this.languageName(this.myLangCode) || 'My Language';

      const receiverId = this.route.snapshot.queryParamMap.get('receiverId');

      if (receiverId) {
        this.chatService.getUserLanguage(receiverId).subscribe(
          (res) => {
            if (res && res.language) {
              this.receiverLangCode = res.language;
              this.receiverLangLabel =
                this.languageName(res.language) || 'Receiver Language';
              localStorage.setItem('receiverLang', res.language);
            } else {
              console.warn('⚠️ Receiver language not found in API response');
            }
          },
          (err) => {
            console.error('❌ Error fetching receiver language:', err);
          }
        );
      } else {
        const storedReceiverLang = localStorage.getItem('receiverLang');
        this.receiverLangCode = storedReceiverLang || this.receiverLangCode;
        this.receiverLangLabel =
          this.languageName(this.receiverLangCode) || 'Receiver Language';
      }
    } catch (err) {
      console.warn('Failed to load language preferences', err);
    }
  }

  normalizeLocaleCode(code: string): string {
    if (!code) return code;

    const lower = code.trim().toLowerCase();
    const keys = Object.keys(this.languageMap);

    const exactKey = keys.find((k) => k.toLowerCase() === lower);
    if (exactKey) return exactKey;

    const partialKey = keys.find((k) =>
      k.toLowerCase().startsWith(lower + '-')
    );
    if (partialKey) return partialKey;

    const fallbackMap: Record<string, string> = {
      en: 'en-IN',
      hi: 'hi-IN',
      bn: 'bn-BD',
      ta: 'ta-IN',
      te: 'te-IN',
      gu: 'gu-IN',
      mr: 'mr-IN',
      pa: 'pa-IN',
      pt: 'pt-BR',
      es: 'es-ES',
      fr: 'fr-FR',
      de: 'de-DE',
      ar: 'ar-SA',
      zh: 'zh-CN',
    };
    if (fallbackMap[lower]) return fallbackMap[lower];

    return code;
  }

  // Card state
  translationCard: {
    visible: boolean;
    mode: 'translateCustom' | 'translateToReceiver' | 'sendOriginal' | null;
    items: TranslationItem[];
    createdAt: Date;
  } | null = null;

  parseTranslationResponse(raw: any): string | null {
    let result: string | null = null;

    if (raw == null) {
      return null;
    }

    if (typeof raw === 'string') {
      const trimmed = raw.trim();

      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.translatedText) {
            result = parsed.translatedText;
          } else if (parsed.data?.translations?.[0]) {
            result = parsed.data.translations[0].translatedText;
          } else if (parsed.text) {
            result = parsed.text;
          } else {
            result = JSON.stringify(parsed);
          }
        } catch {
          result = raw;
        }
      } else {
        result = raw;
      }
    } else if (typeof raw === 'object') {
      if (raw.translatedText) result = raw.translatedText;
      else if (raw.text) result = raw.text;
      else if (raw.data?.translations?.[0])
        result = raw.data.translations[0].translatedText;
      else result = JSON.stringify(raw);
    }

    return result;
  }

  closeTranslationCard() {
    if (this.translationCard) {
      this.translationCard.visible = false;
    }
  }

  messageToggleMap: Map<string, { activeCode: string }> = new Map();

  getAllTranslationsArray(
    msg: any
  ): { code: string; label: string; text: string }[] {
    if (!msg?.translations) return [];
    const arr: { code: string; label: string; text: string }[] = [];

    // Original language (auto-detected, not always English)
    if (msg.translations.original) {
      arr.push({
        code: msg.translations.original.code || 'unknown',
        label: msg.translations.original.label || 'Original',
        text: msg.translations.original.text || '',
      });
    }

    // Other custom language translation
    if (msg.translations.otherLanguage) {
      arr.push({
        code: msg.translations.otherLanguage.code,
        label: msg.translations.otherLanguage.label,
        text: msg.translations.otherLanguage.text || '',
      });
    }

    // Receiver's language translation
    if (msg.translations.receiverLanguage) {
      arr.push({
        code: msg.translations.receiverLanguage.code,
        label: msg.translations.receiverLanguage.label,
        text: msg.translations.receiverLanguage.text || '',
      });
    }

    // Deduplicate by code
    const seen = new Set<string>();
    return arr.filter((item) => {
      if (!item.code) return false;
      if (seen.has(item.code)) return false;
      seen.add(item.code);
      return true;
    });
  }

  /**
   * Check if message has multiple translations (more than just original)
   */
  hasMultipleTranslations(msg: any): boolean {
    // console.log("this hasMultipleTranslations is called");
    if (!msg?.translations) return false;
    const arr = this.getAllTranslationsArray(msg);
    // console.log("hasMultipleTranslations", arr)
    return arr.length > 1;
  }

  ensureToggleState(msg: any) {
    if (!this.messageToggleMap.has(msg.msgId)) {
      let active = 'original';
      if (msg.translations) {
        const all = this.getAllTranslationsArray(msg);
        const matched = all.find(
          (t) => t.text && (msg.text || '').trim() === t.text.trim()
        );
        if (matched) active = matched.code;
        else if (msg.translations.otherLanguage)
          active = msg.translations.otherLanguage.code;
        else if (msg.translations.receiverLanguage)
          active = msg.translations.receiverLanguage.code;
        else active = msg.translations.original?.code || 'original';
      }
      this.messageToggleMap.set(msg.msgId, { activeCode: active });
    }
  }

  getActiveTranslationLabel(msg: any): string | null {
    if (!msg.translations) return null;
    this.ensureToggleState(msg);
    const st = this.messageToggleMap.get(msg.msgId)!;
    const all = this.getAllTranslationsArray(msg);
    const found = all.find((x) => x.code === st.activeCode);
    return found
      ? found.label
      : st.activeCode === 'original'
      ? 'English (Original)'
      : null;
  }

  getActiveTranslationShortCode(msg: any) {
    this.ensureToggleState(msg);
    const st = this.messageToggleMap.get(msg.msgId)!;
    return st.activeCode;
  }

  isTranslationLabelled(msg: any) {
    this.ensureToggleState(msg);
    const st = this.messageToggleMap.get(msg.msgId)!;
    return st.activeCode !== 'original';
  }

  // getDisplayedText(msg: any) {
  //   this.ensureToggleState(msg);
  //   const st = this.messageToggleMap.get(msg.msgId)!;
  //   if (!msg.translations) return msg.text || '';
  //   const all = this.getAllTranslationsArray(msg);
  //   const found = all.find((x) => x.code === st.activeCode);
  //   if (found) return found.text;
  //   if (st.activeCode === 'original' && msg.translations.original)
  //     return msg.translations.original.text;
  //   return msg.text || '';
  // }

  getDisplayedText(msg: any) {
    this.ensureToggleState(msg);
    const st = this.messageToggleMap.get(msg.msgId)!;

    if (!msg.translations) {
      return msg.text || '';
    }

    const all = this.getAllTranslationsArray(msg);
    const found = all.find((x) => x.code === st.activeCode);

    if (found) return found.text;

    if (st.activeCode === 'original' && msg.translations.original) {
      return msg.translations.original.text;
    }

    return msg.text || '';
  }

  cycleTranslation(msg: any) {
    if (!msg.translations) return;
    this.ensureToggleState(msg);
    const st = this.messageToggleMap.get(msg.msgId)!;
    const arr = this.getAllTranslationsArray(msg);
    const codes = arr.map((a) => a.code);
    if (
      msg.translations.original &&
      !codes.includes(msg.translations.original.code || 'original')
    ) {
      codes.push(msg.translations.original.code || 'original');
    }
    const idx = codes.indexOf(st.activeCode);
    const next =
      idx === -1 || idx === codes.length - 1 ? codes[0] : codes[idx + 1];
    st.activeCode = next;
    this.messageToggleMap.set(msg.msgId, st);
  }

  // Removed: setActiveTranslation, toggleShowAllTranslations, isShowingAllTranslations, copyToClipboard
  // These are no longer needed with the simplified bubble

  /**
   * ✅ NEW: Handle language selection from dropdown
   */
  async onSelectTranslateLanguage(event: any) {
    if (!(await this.checkNetworkBeforeAction('translate'))) {
      return;
    }
    const selectedLang = event.detail.value;
    if (!selectedLang) return;

    const text = this.messageText?.trim();
    if (!text) {
      this.showToast('Type something to translate', 'warning');
      return;
    }

    const allowed = await this.ensureTranslationConsent();
    if (!allowed) return;

    this.isTranslatingCustom = true;

    const targetApiLang = this.apiLanguageCode(selectedLang.code);

    await this.fetchCustomTranslation(
      'translateCustom',
      text,
      selectedLang.code,
      selectedLang.label,
      targetApiLang
    );
  }

  /**
   * ✅ UPDATED: Fetch custom language translation + receiver language (parallel)
   * Prevents translation when source and target are the same
   */
  async fetchCustomTranslation(
    mode: 'translateCustom',
    originalText: string,
    targetCode: string,
    targetLabel: string,
    targetApiLang: string
  ) {
    const recvApiLang = this.apiLanguageCode(this.receiverLangCode);

    // First, detect source language
    const detectParams = new HttpParams()
      .set('text', originalText)
      .set('to', targetApiLang);

    try {
      const detectResponse: any = await this.http
        .get(this.translationApiBase, {
          params: detectParams,
          responseType: 'json',
        })
        .toPromise();

      if (!detectResponse?.success) {
        this.showToast(
          'Translation service is currently unavailable. Please try again later.',
          'warning'
        );
        this.isTranslatingCustom = false;
        return;
      }

      const detectedLang = detectResponse.detectedSource || 'unknown';
      const detectedApiLang = this.apiLanguageCode(detectedLang);
      const detectedLabel =
        this.languageName(this.normalizeLocaleCode(detectedLang)) ||
        detectedLang;

      // ✅ Check if source and target are the same
      if (detectedApiLang === targetApiLang) {
        this.showToast(
          `Already in ${targetLabel}. No translation needed.`,
          'warning'
        );
        this.isTranslatingCustom = false;
        return;
      }

      const promises: Promise<any>[] = [];
      let needsReceiverTranslation = false;

      // ✅ Custom language translation (already fetched above)
      const customTranslation = detectResponse.translatedText;

      // ✅ Fetch receiver language translation only if different from both source and custom
      if (recvApiLang !== targetApiLang && recvApiLang !== detectedApiLang) {
        needsReceiverTranslation = true;
        const recvParams = new HttpParams()
          .set('text', originalText)
          .set('to', recvApiLang);

        promises.push(
          this.http
            .get(this.translationApiBase, {
              params: recvParams,
              responseType: 'json',
            })
            .toPromise()
        );
      }

      let receiverTranslation = null;
      if (needsReceiverTranslation) {
        const results = await Promise.all(promises);
        const receiverResponse = results[0];
        if (receiverResponse?.success && receiverResponse.translatedText) {
          receiverTranslation = receiverResponse.translatedText;
        }
      }

      this.showCustomTranslationCard(
        mode,
        originalText,
        targetCode,
        targetLabel,
        customTranslation,
        detectedLang,
        detectedLabel,
        receiverTranslation
      );

      this.isTranslatingCustom = false;
    } catch (err) {
      console.error('Translation error', err);
      this.showToast(
        'Translation service is not working right now. Please try again later.',
        'error'
      );
      this.isTranslatingCustom = false;
    }
  }
  showCustomTranslationCard(
    mode: 'translateCustom',
    originalText: string,
    targetCode: string,
    targetLabel: string,
    translation: string,
    detectedSourceCode?: string,
    detectedSourceLabel?: string,
    receiverTranslation?: string | null
  ) {
    const items: TranslationItem[] = [];

    // [0] Add detected source language (original)
    if (detectedSourceCode) {
      items.push({
        code: detectedSourceCode,
        label: detectedSourceLabel || 'Original',
        text: originalText,
      });
    }

    // [1] Add custom selected language translation
    items.push({
      code: targetCode,
      label: targetLabel,
      text: translation,
    });

    // [2] Add receiver language translation (if available and different from custom)
    if (receiverTranslation && targetCode !== this.receiverLangCode) {
      items.push({
        code: this.receiverLangCode,
        label: this.languageName(this.receiverLangCode) + ' (Receiver)',
        text: receiverTranslation,
      });
    }

    this.translationCard = {
      visible: true,
      mode,
      items,
      createdAt: new Date(),
    };

    this.showToast('Translation ready', 'success');
    try {
      this.cdr.detectChanges();
    } catch {}
  }

  /**
   * UPDATED: Translate to Receiver
   */
  async translateTo(target: 'receiver') {
    if (!(await this.checkNetworkBeforeAction('translate'))) {
      return;
    }
    const text = this.messageText?.trim();
    if (!text) {
      this.showToast('Type something to translate', 'warning');
      return;
    }

    const allowed = await this.ensureTranslationConsent();
    if (!allowed) return;

    this.isTranslatingToReceiver = true;

    const recvApiLang = this.apiLanguageCode(this.receiverLangCode);

    await this.fetchReceiverTranslationOnly(
      'translateToReceiver',
      text,
      recvApiLang
    );
  }

  // ========================================
  // 🎨 SHOW RECEIVER ONLY CARD
  // ========================================
  /**
   * ✅ UPDATED: Fetch ONLY receiver translation (with source check)
   */

  /**
   * ✅ UPDATED: Fetch ONLY receiver translation (with source check)
   */
  async fetchReceiverTranslationOnly(
    mode: 'translateToReceiver',
    originalText: string,
    recvApiLang: string
  ) {
    const params = new HttpParams()
      .set('text', originalText)
      .set('to', recvApiLang);

    this.http
      .get(this.translationApiBase, { params, responseType: 'json' })
      .subscribe({
        next: (response: any) => {
          if (response.success && response.translatedText) {
            const detectedLang = response.detectedSource || 'unknown';
            const detectedApiLang = this.apiLanguageCode(detectedLang);
            const detectedLabel =
              this.languageName(this.normalizeLocaleCode(detectedLang)) ||
              detectedLang;

            // ✅ Check if source and target are the same
            if (detectedApiLang === recvApiLang) {
              this.showToast(
                `Already in ${this.receiverLangLabel}. No translation needed.`,
                'warning'
              );
              this.isTranslatingToReceiver = false;
              return;
            }

            this.showReceiverOnlyCard(
              mode,
              originalText,
              response.translatedText,
              detectedLang,
              detectedLabel
            );
          } else {
            this.showToast(
              'Translation service is currently unavailable. Please try again later.',
              'warning'
            );
          }

          this.isTranslatingToReceiver = false;
        },
        error: (err) => {
          console.error('Translation error', err);
          this.showToast(
            'Translation service is not working right now. Please try again later.',
            'error'
          );
          this.isTranslatingToReceiver = false;
        },
      });
  }
  showReceiverOnlyCard(
    mode: 'translateToReceiver',
    originalText: string,
    receiverTranslation: string,
    detectedSourceCode?: string,
    detectedSourceLabel?: string
  ) {
    const items: TranslationItem[] = [];

    // [0] Add detected source language (original)
    if (detectedSourceCode) {
      items.push({
        code: detectedSourceCode,
        label: detectedSourceLabel || 'Original',
        text: originalText,
      });
    }

    // [1] Add Receiver Language
    items.push({
      code: this.receiverLangCode,
      label: this.languageName(this.receiverLangCode) + ' (Receiver)',
      text: receiverTranslation,
    });

    this.translationCard = {
      visible: true,
      mode,
      items,
      createdAt: new Date(),
    };

    this.showToast('Translation ready', 'success');
    try {
      this.cdr.detectChanges();
    } catch {}
  }

  // ========================================
  // 🎨 SHOW SEND ORIGINAL CARD
  // ========================================

  showSendOriginalCard(
    originalText: string,
    receiverTranslation: string,
    detectedSourceCode: string,
    detectedSourceLabel: string
  ) {
    const items: TranslationItem[] = [
      // [0] Original
      {
        code: detectedSourceCode,
        label: detectedSourceLabel + ' (Original)',
        text: originalText,
      },
      // [1] Receiver will see
      {
        code: this.receiverLangCode,
        label:
          this.languageName(this.receiverLangCode) + ' (Receiver will see)',
        text: receiverTranslation,
      },
    ];

    this.translationCard = {
      visible: true,
      mode: 'sendOriginal',
      items,
      createdAt: new Date(),
    };

    this.showToast('Preview ready', 'success');
    try {
      this.cdr.detectChanges();
    } catch {}
  }

  // ========================================
  // 🔧 HELPER: CLOSE TRANSLATION CARD
  // ========================================

  /**
   * ✅ UPDATED: Send Original with auto-translation (with source check)
   */
  async sendOriginalWithTranslation() {
    if (!(await this.checkNetworkBeforeAction('translate'))) {
      return;
    }
    const text = this.messageText?.trim();
    if (!text) {
      this.showToast('Type something to send', 'warning');
      return;
    }

    const allowed = await this.ensureTranslationConsent();
    if (!allowed) return;

    this.isTranslatingOriginal = true;

    const recvApiLang = this.apiLanguageCode(this.receiverLangCode);

    const params = new HttpParams().set('text', text).set('to', recvApiLang);

    this.http
      .get(this.translationApiBase, { params, responseType: 'json' })
      .subscribe({
        next: (response: any) => {
          if (response.success && response.translatedText) {
            const detectedLang = response.detectedSource || 'unknown';
            const detectedApiLang = this.apiLanguageCode(detectedLang);
            const detectedLabel =
              this.languageName(this.normalizeLocaleCode(detectedLang)) ||
              detectedLang;

            // ✅ Check if source and target are the same
            if (detectedApiLang === recvApiLang) {
              // Same language - just send without translation card
              this.messageText = text;
              this.sendMessage(); // Call your existing sendMessage method
              this.isTranslatingOriginal = false;
              return;
            }

            const items: TranslationItem[] = [
              {
                code: detectedLang,
                label: detectedLabel,
                text: text,
              },
              {
                code: this.receiverLangCode,
                label: this.languageName(this.receiverLangCode) + ' (Receiver)',
                text: response.translatedText,
              },
            ];

            this.translationCard = {
              visible: true,
              mode: 'sendOriginal',
              items,
              createdAt: new Date(),
            };

            this.showToast('Preview ready', 'success');
          } else {
            this.showToast(
              'Translation service is currently unavailable. Please try again later.',
              'warning'
            );
          }

          this.isTranslatingOriginal = false;
        },
        error: (err) => {
          console.error('Translation error', err);
          this.showToast(
            'Translation service is not working right now. Please try again later.',
            'error'
          );
          this.isTranslatingOriginal = false;
        },
      });
  }

  async sendFromTranslationCard() {
    // ✅ Loading flag ON
    if (this.isSendingFromTranslationCard) return;
    this.isSendingFromTranslationCard = true;

    if (!this.translationCard) return;

    console.log('📋 Translation Card:', this.translationCard);

    const mode = this.translationCard.mode;
    const items = this.translationCard.items || [];
    const originalText = this.messageText?.trim() || '';
    const now = Date.now();

    // ✅ FIXED: Identify items by array position (reliable & predictable)
    // Array structure based on mode:
    // - translateCustom:    [0]=Original, [1]=Custom, [2]=Receiver (if different)
    // - translateToReceiver: [0]=Original, [1]=Receiver
    // - sendOriginal:        [0]=Original, [1]=Receiver

    const originalItem = items[0]; // First item is always the detected source

    let customItem: TranslationItem | null = null;
    let receiverItem: TranslationItem | null = null;

    // Determine which items are custom vs receiver based on mode
    if (mode === 'translateCustom') {
      // Custom translation mode
      if (items.length === 3) {
        // We have: Original, Custom, Receiver
        customItem = items[1];
        receiverItem = items[2];
      } else if (items.length === 2) {
        // We have: Original, and one translation
        // Check if it's the receiver language or custom
        if (items[1]?.code === this.receiverLangCode) {
          // User selected receiver language as custom = treat as receiver only
          receiverItem = items[1];
          customItem = null;
        } else {
          // User selected different language = custom without receiver
          customItem = items[1];
          receiverItem = null;
        }
      }
    } else if (mode === 'translateToReceiver') {
      // Direct to receiver mode: only receiver translation
      receiverItem = items[1];
    } else if (mode === 'sendOriginal') {
      // Send original with receiver preview
      receiverItem = items[1];
    }

    // ✅ Build translations payload
    const translationsPayload: MessageTranslations = {
      original: {
        code: originalItem?.code || 'unknown',
        label: originalItem?.label || 'Original',
        text: originalItem?.text || originalText,
      },
    };

    let visibleTextForSender: string = originalText;

    // Set payload based on mode
    if (mode === 'translateCustom') {
      // Custom language translation - sender sees custom translation
      if (customItem) {
        translationsPayload.otherLanguage = {
          code: customItem.code,
          label: customItem.label,
          text: customItem.text,
        };
        visibleTextForSender = customItem.text;
      }

      // Also include receiver translation if available
      if (receiverItem) {
        translationsPayload.receiverLanguage = {
          code: receiverItem.code,
          label: receiverItem.label,
          text: receiverItem.text,
        };
      }
    } else if (mode === 'translateToReceiver') {
      // Receiver translation - sender sees receiver translation
      if (receiverItem) {
        translationsPayload.receiverLanguage = {
          code: receiverItem.code,
          label: receiverItem.label,
          text: receiverItem.text,
        };
        visibleTextForSender = receiverItem.text;
      }
    } else if (mode === 'sendOriginal') {
      // Original with receiver translation - sender sees original
      visibleTextForSender = originalText;

      if (receiverItem) {
        translationsPayload.receiverLanguage = {
          code: receiverItem.code,
          label: receiverItem.label,
          text: receiverItem.text,
        };
      }
    }
    const msgId = uuidv4();
    const timestamp = Date.now();

    // ✅ Build final message
    const localMessage: Partial<IMessage & { attachment?: any }> = {
      sender: this.senderId,
      sender_name: this.sender_name,
      sender_phone: this.sender_phone,
      text: visibleTextForSender,
      receiver_id: this.receiverId,
      translations: translationsPayload,
      timestamp,
      msgId,
      replyToMsgId: this.replyTo?.message.msgId || '',
      isEdit: false,
      isPinned: false,
      type: 'text',
      reactions: [],
    };

    console.log('✅ Local Message:djkfsllllllllllllllllllllllll', localMessage);

    // Send message
    await this.chatService.sendMessage(localMessage);

    // Reset state
    this.messageText = '';
    this.translationCard.visible = false;
    this.translationCard = null;
    this.showSendButton = false;
    this.replyToMessage = null;
    this.replyTo = null;

    this.showToast('Message sent', 'success');

    try {
      this.stopTypingSignal();
      this.scrollToBottom();
    } catch {
    } finally {
      // ✅ Loading flag OFF (always executed)
      this.isSendingFromTranslationCard = false;
      try {
        this.cdr.detectChanges();
      } catch {}
    }
  }

  async sendDirectMessage(senderText: string, receiverText: string) {
    const now = Date.now();

    const translationsPayload: IMessage['translations'] = {
      original: {
        code: 'en',
        label: 'English (Original)',
        text: this.messageText?.trim() || '',
      },
    };

    if (receiverText !== this.messageText) {
      translationsPayload.receiverLanguage = {
        code: this.receiverLangCode,
        label: this.languageName(this.receiverLangCode),
        text: receiverText,
      };
    }

    const localMessage: Partial<IMessage & { attachment?: any }> = {
      sender: this.senderId,
      text: senderText,
      translations: translationsPayload,
      timestamp: now,
      msgId: uuidv4(),
      replyToMsgId: this.replyTo?.message.msgId || '',
      isEdit: false,
      isPinned: false,
      type: 'text',
      reactions: [],
    };

    await this.chatService.sendMessage(localMessage);

    this.messageText = '';
    this.showSendButton = false;
    this.showToast('Message sent', 'success');
  }
  // showTranslationOptions = false;

  toggleTranslationOptions() {
    this.showTranslationOptions = !this.showTranslationOptions;
    // // For quick test, run this in component init or console:
    // this.isSendingFromTranslationCard = true;
    // setTimeout(() => this.isSendingFromTranslationCard = false, 3000);
  }

  async showToast(
    message: string,
    color:
      | 'success'
      | 'warning'
      | 'error'
      | 'info'
      | 'primary'
      | 'secondary'
      | 'medium' = 'info',
    position: 'top' | 'middle' | 'bottom' = 'top',
    duration: number = 2000
  ) {
    const toast = await this.toastController.create({
      message: message, // Keep it simple - just the message
      duration,
      position,
      cssClass: `md-toast ${color} toast-with-dust`, // Add extra class
      enterAnimation: (el) => this.getToastAnimation(el),
      leaveAnimation: (el) => this.getToastLeaveAnimation(el),
      buttons: [
        {
          text: 'Dismiss',
          role: 'cancel',
        },
      ],
    });

    await toast.present();
  }

  async showToastSimple(
    message: string,
    color: 'success' | 'warning' | 'error' | 'info' = 'info',
    duration: number = 1500
  ) {
    const toast = await this.toastController.create({
      message: message,
      duration,
      position: 'top',
      cssClass: `md-toast ${color} toast-with-dust`,
      enterAnimation: (el) => this.getToastAnimation(el),
      leaveAnimation: (el) => this.getToastLeaveAnimation(el),
    });

    await toast.present();
  }

  async showToastWithIcon(
    message: string,
    color: 'success' | 'warning' | 'error' | 'info' | 'primary' = 'success',
    icon: string = 'checkmark-circle'
  ) {
    const toast = await this.toastController.create({
      message: message,
      duration: 2000,
      position: 'top',
      icon,
      cssClass: `md-toast ${color} toast-with-dust`,
      enterAnimation: (el) => this.getToastAnimation(el),
      leaveAnimation: (el) => this.getToastLeaveAnimation(el),
      buttons: [{ text: 'OK', role: 'cancel' }],
    });

    await toast.present();
  }

  getToastAnimation(baseEl: HTMLElement) {
    const wrapper = baseEl.shadowRoot?.querySelector('.toast-wrapper');

    return this.animationCtrl
      .create()
      .addElement(wrapper!)
      .duration(280)
      .easing('cubic-bezier(0.32, 0.72, 0, 1)')
      .fromTo('transform', 'translateY(-16px)', 'translateY(0)')
      .fromTo('opacity', '0', '1');
  }

  getToastLeaveAnimation(baseEl: HTMLElement) {
    const wrapper = baseEl.shadowRoot?.querySelector('.toast-wrapper');

    return this.animationCtrl
      .create()
      .addElement(wrapper!)
      .duration(200)
      .easing('cubic-bezier(0.4, 0, 1, 1)')
      .fromTo('opacity', '1', '0')
      .fromTo('transform', 'translateY(0)', 'translateY(-10px)');
  }

  //dissappearing messages methods
  private scheduleMessageExpiry(msg: any): void {
    if (!msg.expiresAt || msg.isDisappeared) return;
    if (this._messageExpiryTimers.has(msg.msgId)) return;

    const msUntilExpiry = msg.expiresAt - Date.now();

    if (msUntilExpiry <= 0) {
      // Already expired — mark immediately
      this.markMessageDisappeared(msg);
      return;
    }

    const timer = setTimeout(() => {
      this.markMessageDisappeared(msg);
      this._messageExpiryTimers.delete(msg.msgId);
    }, msUntilExpiry);

    this._messageExpiryTimers.set(msg.msgId, timer);
  }

  private markMessageDisappeared(msg: any): void {
    this.zone.run(async () => {
      // UI se remove karo
      this.allMessage = this.allMessage.filter((m) => m.msgId !== msg.msgId);

      for (const group of this.groupedMessages) {
        const gIdx = group.messages.findIndex(
          (m: any) => m.msgId === msg.msgId
        );
        if (gIdx >= 0) {
          group.messages.splice(gIdx, 1);
          break;
        }
      }

      await this.chatService.cleanupExpiredMessages(this.roomId);

      this.buildFlatListForView();
      try {
        this.cdr.detectChanges();
      } catch {}
    });
  }
  private clearAllExpiryTimers(): void {
    this._messageExpiryTimers.forEach((t) => clearTimeout(t));
    this._messageExpiryTimers.clear();
  }
  openDefaultTimer() {
    this.router.navigate(['/default-message-timer']);
  }
  async reportUser() {
    const currentChat = this.currentConv;

    if (!currentChat) {
      console.error('❌ No current chat found');
      return;
    }

    try {
      // 1️⃣ Fetch last 5 messages for evidence (excluding reporter's own messages)
      let evidence: any[] = [];
      try {
        const messages = await this.chatPouchDb.getMessages(currentChat.roomId);
        const reporterId = String(this.authService.authData?.userId);

        // Sort by timestamp descending, filter out reporter's messages, and take last 5
        evidence = messages
          .filter((m) => String(m.sender) !== reporterId)
          .sort((a, b) => (b.timestamp as number) - (a.timestamp as number))
          .slice(0, 5)
          .map((m) => ({
            id: `msg_${m.timestamp}`,
            senderId: parseInt(m.sender) || this.receiverId,
            content: m.text || '',
            type: m.type || 'text',
            timestamp: new Date(m.timestamp).toISOString(),
          }));
      } catch (err) {
        console.warn('⚠️ Failed to fetch evidence messages:', err);
      }

      // Check if at least one message is available for evidence
      if (evidence.length === 0) {
        const toast = await this.toastCtrl.create({
          message:
            'At least one message is required as evidence for the report.',
          duration: 3000,
          color: 'warning',
        });
        toast.present();
        return;
      }

      // 2️⃣ Prepare report data
      const reporter = this.authService.authData;
      const reporterSnapshot = {
        name: reporter?.name || 'Unknown',
        phone: reporter?.phone_number || '',
      };

      const reportedSnapshot = {
        name:
          this.chatType === 'group' ? currentChat.title : this.receiver_name,
        phone: this.receiver_phone || '',
        avatar: this.receiverProfile || '',
      };

      // 3️⃣ Open report modal
      const modal = await this.modalCtrl.create({
        component: ReportModalComponent,
        componentProps: {
          reportedUserId: this.receiverId,
          roomId: currentChat.roomId,
          chatType: this.chatType,
          chatTitle:
            this.chatType === 'group' ? currentChat.title : this.receiver_name,
          reporterSnapshot,
          reportedSnapshot,
          evidence,
          showBlockOption: this.chatType === 'private',
          isAlreadyBlocked: !!this.iBlocked,
        },
        breakpoints: [0, 0.8, 1],
        initialBreakpoint: 0.8,
        backdropDismiss: true,
      });

      await modal.present();

      const { data } = await modal.onDidDismiss();

      if (data?.success) {
        // 4️⃣ Handle "Also Block" if checked (only for private chats)
        if (data.alsoBlock && this.chatType === 'private' && !this.iBlocked) {
          await this.blockUserSilently();
        }

        // 5️⃣ Show success message
        const msg =
          data.alsoBlock && this.chatType === 'private'
            ? this.translate.instant('userabout.toasts.reportedAndBlocked', {
                name: this.receiver_name,
              })
            : this.translate.instant('userabout.toasts.reported', {
                name:
                  this.chatType === 'group'
                    ? currentChat.title
                    : this.receiver_name,
              });

        const toast = await this.toastCtrl.create({
          message: msg,
          duration: 2500,
          color: 'success',
        });
        toast.present();
      }
    } catch (error: any) {
      console.error('❌ Failed to report:', error);
      const toast = await this.toastCtrl.create({
        message: `Failed to send report: ${error.message || 'Unknown error'}`,
        duration: 3000,
        color: 'danger',
      });
      toast.present();
    }
  }

  private async blockUserSilently() {
    try {
      await this.chatService.applySecuredBatchUpdates({
        [`usersBlocks/${this.senderId}/${this.receiverId}/status`]: 'active',
        [`usersBlocks/${this.senderId}/${this.receiverId}/updatedAt`]: Date.now(),
      });
      this.iBlocked = true;
      console.log('✅ User blocked silently after report');
    } catch (error) {
      console.error('❌ Failed to block user silently:', error);
    }
  }

  /**
   * ✅ Check if message text contains a Telldemm invite link
   */
  getInviteLinkFromText(text: string): string | null {
    if (!text) return null;
    const match = text.match(/https?:\/\/telldemm\.com\/join\/\S+/);
    return match ? match[0] : null;
  }

  /**
   * ✅ Parse message text into: text before link | link | text after link
   */
  parseMessageWithLink(text: string): {
    before: string;
    link: string | null;
    after: string;
  } {
    if (!text) return { before: '', link: null, after: '' };
    const match = text.match(
      /([\s\S]*?)(https?:\/\/telldemm\.com\/join\/\S+)([\s\S]*)/
    );
    if (!match) return { before: text, link: null, after: '' };
    return {
      before: match[1],
      link: match[2].trim(),
      after: match[3],
    };
  }

  /**
   * ✅ Handle invite link tap — open GroupInviteModalComponent
   */
  // async onInviteLinkTap(link: string, event?: Event): Promise<void> {
  //   if (event) event.stopPropagation();

  //   // Extract groupId from the link: https://telldemm.com/join/group_XXXXX
  //   const match = link.match(/\/join\/(group_\d+|\d+)$/);
  //   if (!match) {
  //     const toast = await this.toastCtrl.create({
  //       message: 'Invalid invite link',
  //       duration: 2000,
  //       color: 'warning',
  //     });
  //     await toast.present();
  //     return;
  //   }

  //   const groupId = match[1];

  //   const modal = await this.modalCtrl.create({
  //     component: GroupInviteModalComponent,
  //     componentProps: {
  //       groupId,
  //       inviteLink: link,
  //     },
  //     breakpoints: [0, 0.6, 0.85],
  //     initialBreakpoint: 0.6,
  //     backdropDismiss: true,
  //     cssClass: 'group-invite-modal',
  //   });

  //   await modal.present();
  // }

  async onInviteLinkTap(link: string, event?: Event): Promise<void> {
    if (event) event.stopPropagation();

    // Extract the ID token after /join/
    const match = link.match(/\/join\/(.+)$/);
    if (!match) {
      const toast = await this.toastCtrl.create({
        message: 'Invalid invite link',
        duration: 2000,
        color: 'warning',
      });
      await toast.present();
      return;
    }

    const rawToken = match[1].trim();
    const parsed = this.decodeInviteId(rawToken);

    if (!parsed) {
      const toast = await this.toastCtrl.create({
        message: 'Invalid invite link',
        duration: 2000,
        color: 'warning',
      });
      await toast.present();
      return;
    }

    const modal = await this.modalCtrl.create({
      component: GroupInviteModalComponent,
      componentProps: {
        groupId: parsed.type === 'group' ? parsed.id : '',
        communityId: parsed.type === 'community' ? parsed.id : '',
        inviteType: parsed.type, // 'group' | 'community'
        inviteLink: link,
      },
      breakpoints: [0, 0.6, 0.85],
      initialBreakpoint: 0.6,
      backdropDismiss: true,
      cssClass: 'group-invite-modal',
    });

    await modal.present();
  }

  private decodeInviteId(
    raw: string
  ): { type: 'group' | 'community'; id: string } | null {
    if (raw.startsWith('c_')) {
      try {
        const decoded = atob(raw.slice(2));
        if (decoded.startsWith('comm_')) {
          return { type: 'community', id: decoded.slice(5) };
        }
      } catch {
        return null;
      }
    }

    if (raw.startsWith('g_')) {
      try {
        const decoded = atob(raw.slice(2));
        if (decoded.startsWith('grp_')) {
          return { type: 'group', id: decoded.slice(4) };
        }
      } catch {
        return null;
      }
    }

    // Legacy plain group: group_XXXXX (old links still work)
    if (raw.startsWith('group_')) {
      return { type: 'group', id: raw };
    }

    // Legacy numeric
    if (/^\d+$/.test(raw)) {
      return { type: 'group', id: raw };
    }

    return null;
  }
}
