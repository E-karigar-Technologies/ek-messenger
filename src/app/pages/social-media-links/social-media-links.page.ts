import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-social-media-links',
  standalone: true,
  imports: [IonicModule, CommonModule, TranslateModule],
  templateUrl: './social-media-links.page.html',
  styleUrls: ['./social-media-links.page.scss'],
})
export class SocialMediaLinksPage implements OnInit {
  instagramUsername: string | null = null;
  private storageKey = 'instagram_username_v1';

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.loadFromStorage();
  }

  ionViewWillEnter() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    const raw = localStorage.getItem(this.storageKey);
    this.instagramUsername = raw ? raw : null;
  }

  openAddInstagram() {
    this.router.navigate(['/add-instagram']);
  }
}
