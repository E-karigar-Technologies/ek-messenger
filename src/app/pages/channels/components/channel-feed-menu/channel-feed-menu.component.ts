import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { IonicModule, PopoverController } from '@ionic/angular';

export interface MenuOption {
  label: string;
  icon: string;
  danger?: boolean;
}

@Component({
  selector: 'app-channel-feed-menu',
  templateUrl: './channel-feed-menu.component.html',
  styleUrls: ['./channel-feed-menu.component.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class ChannelFeedMenuComponent implements OnInit {
  @Input() isCreator: boolean = false;
  @Input() isFollowing: boolean = true;

  menuOptions: MenuOption[] = [];

  constructor(private popoverCtrl: PopoverController) {}

  ngOnInit() {
    if (this.isCreator) {
      // Admin / Creator
      this.menuOptions = [
        { label: 'Channel Info',    icon: 'information-circle-outline' },
        { label: 'Search',          icon: 'search-outline' },
        { label: 'Share',           icon: 'share-social-outline' },
        { label: 'Invite Admins',   icon: 'person-add-outline' },
        { label: 'Channel Settings',icon: 'settings-outline' },
      ];
    } else if (this.isFollowing) {
      // Follower (following but not admin)
      this.menuOptions = [
        { label: 'Channel Info',    icon: 'information-circle-outline' },
        { label: 'Search',          icon: 'search-outline' },
        { label: 'Share',           icon: 'share-social-outline' },
        { label: 'Report Wip',          icon: 'flag-outline' },
        { label: 'Unfollow',        icon: 'person-remove-outline', danger: true },
      ];
    } else {
      // Not following
      this.menuOptions = [
        { label: 'Channel Info',    icon: 'information-circle-outline' },
        { label: 'Search',          icon: 'search-outline' },
        { label: 'Share',           icon: 'share-social-outline' },
        { label: 'Report Wip',          icon: 'flag-outline' },
      ];
    }
  }

  dismiss(option?: string) {
    this.popoverCtrl.dismiss({ selected: option });
  }
}
