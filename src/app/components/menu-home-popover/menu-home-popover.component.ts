import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, PopoverController } from '@ionic/angular';

export type HomeMenuAction =
  | 'addShortcut' | 'viewContact' | 'markUnread' | 'markRead' | 'selectAll'
  | 'lockChat' | 'lockChats' | 'addToFavourite' | 'removeFromFavourite'
  | 'addToList' | 'block'
  | 'exitGroup' | 'exitGroups' | 'groupInfo' | 'deleteGroup'
  | 'communityInfo' | 'exitCommunity';

@Component({
  selector: 'app-menu-home-popover',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './menu-home-popover.component.html',
  styleUrls: ['./menu-home-popover.component.scss']
})
export class MenuHomePopoverComponent {

  // common helpers
  @Input() canLock           = true;
  @Input() allSelected       = false;
  @Input() isAllSelectedMode = false;

  // ★ NEW: whether the selected chat is already a favourite
  @Input() isFavourite = false;

  // selection buckets
  @Input() isSingleUser      = false;
  @Input() isMultiUsers      = false;
  @Input() isSingleGroup     = false;
  @Input() isMultiGroups     = false;
  @Input() isMixedChats      = false;
  @Input() isSingleCommunity = false;

  // unread visibility flags
  @Input() canMarkReadSingle    = false;
  @Input() canMarkUnreadSingle  = false;
  @Input() canMarkReadMulti     = false;
  @Input() canMarkUnreadMulti   = false;

  // group membership flags
  @Input() isCurrentUserMember = false;
  @Input() canDeleteGroup      = false;
  @Input() isCommunityAdmin    = false;
  @Input() isCommunityMember   = false;

  constructor(private popover: PopoverController) {}

  choose(action: HomeMenuAction) {
    this.popover.dismiss({ action });
  }

  close() {
    this.popover.dismiss();
  }
}