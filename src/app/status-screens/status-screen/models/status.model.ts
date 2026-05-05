export type StatusPrivacyMode =
  | 'my_contacts'
  | 'my_contacts_except'
  | 'only_share_with';

export interface StatusDoc {
  statusId: string;
  ownerUid: string;
  ownerName: string;
  ownerAvatar: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  thumbnailUrl: string;
  caption: string;
  createdAt: number;
  expiresAt: number;
  contactSnapshotAt: number;
  privacyMode: StatusPrivacyMode;
  privacyUsers: Record<string, true>;
  allowReplies: boolean;
  fileKey: string;
  thumbnailKey: string;
  viewCount: number;
  replyCount: number;
  isDeleted: boolean;
  seen?: boolean;
}

export interface StatusOwnerGroup {
  ownerUid: string;
  ownerName: string;
  ownerAvatar: string;
  latestCreatedAt: number;
  unseenCount: number;
  statuses: StatusDoc[];
}

export interface StatusViewDoc {
  viewerUid: string;
  viewedAt: number;
  statusId: string;
}

export interface StatusFeedPayload {
  generatedAt: number;
  recentUpdates: StatusOwnerGroup[];
  mutedUpdates: StatusOwnerGroup[];
  hiddenUpdates: StatusOwnerGroup[];
}

export interface StatusPrivacyDefault {
  uid: string;
  privacyMode: StatusPrivacyMode;
  privacyUsers: Record<string, true>;
}

export interface StatusContactOption {
  uid: string;
  name: string;
  avatar?: string;
}

export interface StatusDraft {
  draftId: string;
  createdAt: number;
  caption: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  privacyMode: StatusPrivacyMode;
  privacyUsers: Record<string, true>;
}
