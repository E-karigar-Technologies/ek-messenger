import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Avatar } from 'src/app/services/avatar';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { GlobalSettingsSyncService } from 'src/app/services/global-settings-sync.service';

@Component({
  selector: 'app-avatar',
  templateUrl: './avatar.page.html',
  styleUrls: ['./avatar.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule],
})
export class AvatarPage implements OnInit {
  options: any = {};
  avatarUrl!: string;

  userId = 'current_user';
  isDownloading = false;

  constructor(
    public avatarService: Avatar,
    private translate: TranslateService,
    private globalSettingsSync: GlobalSettingsSyncService
  ) {}

  ngOnInit() {
    this.options = {
      topType: this.avatarService.topTypes[1],
      accessoriesType: this.avatarService.accessoriesTypes[0],
      hairColor: this.avatarService.hairColors[0],
      eyeType: this.avatarService.eyeTypes[0],
      mouthType: this.avatarService.mouthTypes[0],
      clotheType: this.avatarService.clotheTypes[0],
      skinColor: this.avatarService.skinColors[0]
    };

    const saved = localStorage.getItem(`avatar_opts:${this.userId}`);
    if (saved) {
      try { this.options = JSON.parse(saved); } catch {}
    }

    this.refresh();

    this.globalSettingsSync.initialize().then(() => {
      const synced = localStorage.getItem(`avatar_opts:${this.userId}`);
      if (!synced) return;
      try {
        this.options = JSON.parse(synced);
        this.refresh();
      } catch {
        // Ignore malformed local cache.
      }
    });
  }

  refresh() {
    this.avatarUrl = this.avatarService.generateAvatarUrl(this.options, { size: 250 } as any);
  }

  async downloadPng() {
    const url = this.avatarService.generateUrl(this.options, 512) + '&format=png';
    this.downloadFromUrl(url, 'avatar.png');
  }

  downloadFromUrl(url: string, filename: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async downloadFromServerless() {
    try {
      const serverlessEndpoint = 'https://avatarserverlesstwo.vercel.app/api/avatar'; // replace if needed
      const params = new URLSearchParams({
        avatarStyle: 'Circle',
        topType: this.options.topType || '',
        accessoriesType: this.options.accessoriesType || '',
        hairColor: this.options.hairColor || '',
        eyeType: this.options.eyeType || '',
        mouthType: this.options.mouthType || '',
        clotheType: this.options.clotheType || '',
        skinColor: this.options.skinColor || '',
        width: '1024',
        height: '1024'
      });
      const url = `${serverlessEndpoint}?${params.toString()}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
      const blob = await resp.blob();
      const a = document.createElement('a');
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      a.download = `avatar-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    } catch (err) {
      console.error('Download failed', err);
      alert(this.translate.instant('avatarPage.toast.downloadError'));
    }
  }

  async downloadAvatar() {
    this.isDownloading = true;

    const params = new URLSearchParams({
      avatarStyle: 'Circle',
      topType: this.options.topType || 'ShortHairShortFlat',
      accessoriesType: this.options.accessoriesType || 'Blank',
      hairColor: this.options.hairColor || 'BrownDark',
      eyeType: this.options.eyeType || 'Default',
      mouthType: this.options.mouthType || 'Smile',
      clotheType: this.options.clotheType || 'ShirtCrewNeck',
      skinColor: this.options.skinColor || 'Light',
      width: '1024',
      height: '1024'
    });

    const url = `https://avatarserverlesstwo.vercel.app/api/avatar?${params.toString()}`;
    window.open(url, '_blank');

    setTimeout(() => {
      this.isDownloading = false;
    }, 3000);
  }

  saveOptions() {
    this.globalSettingsSync.saveSection('avatarOptions', this.options);
    alert(this.translate.instant('avatarPage.toast.saved'));
  }
}
