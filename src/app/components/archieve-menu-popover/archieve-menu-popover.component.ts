import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, PopoverController } from '@ionic/angular';

export type ArchMenuAction =
  // common
  | 'settings' | 'selectAll'
  | 'markUnread' | 'markRead'
  | 'lockChat' | 'lockChats'
  | 'favorite' | 'addToList'
  | 'addShortcut' | 'block'
  // groups
  | 'exitGroup' | 'exitGroups' | 'groupInfo'
  // people
  | 'viewContact';

@Component({
  selector: 'app-archieve-menu-popover',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './archieve-menu-popover.component.html',
  styleUrls: ['./archieve-menu-popover.component.scss']
})
export class ArchieveMenuPopoverComponent {
  @Input() mode:
    | 'none'
    | 'single-private'
    | 'multi-private'
    | 'single-group'
    | 'multi-group'
    | 'mixed' = 'none';

  /** helpers */
  @Input() allSelected = false;
  @Input() canLock = true;

  constructor(private popover: PopoverController) {}

  choose(action: ArchMenuAction) {
    this.popover.dismiss({ action });
  }
  close() { this.popover.dismiss(); }
}
