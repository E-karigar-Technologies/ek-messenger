import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-privacy',
  templateUrl: './privacy.page.html',
  styleUrls: ['./privacy.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule],
})
export class PrivacyPage implements OnInit {
  // values are internal codes; labels come from i18n
  lastSeen: 'everyone' | 'contacts' | 'nobody' = 'contacts';
  profilePhoto: 'everyone' | 'contacts' | 'nobody' = 'everyone';
  about: 'everyone' | 'contacts' | 'nobody' = 'contacts';

  constructor(private router: Router, private translate: TranslateService) {}

  ngOnInit() {}

  goToStatusPrivacy() {
    this.router.navigateByUrl('/status-screen');
  }

  goToBlockedContacts() {
    this.router.navigateByUrl('privacy/blocked');
  }
}
