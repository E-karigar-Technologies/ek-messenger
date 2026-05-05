import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonicModule,
  NavController,
  ToastController,
  LoadingController,
  AlertController,
} from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { AuthService } from 'src/app/auth/auth.service';

@Component({
  selector: 'app-pending-groups',
  templateUrl: './pending-groups.page.html',
  styleUrls: ['./pending-groups.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class PendingGroupsPage implements OnInit {
  communityId: string = '';
  communityName: string = '';
  suggestions: any[] = [];
  loading = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private alertCtrl: AlertController,
    private firebaseService: FirebaseChatService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe(async (params) => {
      this.communityId = params['communityId'] || '';
      if (this.communityId) {
        try {
          this.communityName = await this.firebaseService.getCommunityName(this.communityId);
        } catch (e) {}
        await this.loadSuggestions();
      }
    });
  }

  async ionViewWillEnter() {
    if (this.communityId) await this.loadSuggestions();
  }

  async loadSuggestions() {
    this.loading = true;
    try {
      this.suggestions = await this.firebaseService.getPendingGroupSuggestions(this.communityId);
      console.log('Pending suggestions:', this.suggestions);
    } catch (e) {
      console.error('loadSuggestions error:', e);
    } finally {
      this.loading = false;
    }
  }

  async approve(suggestion: any) {
    const loading = await this.loadingCtrl.create({ message: 'Approving...' });
    await loading.present();

    try {
      const result = await this.firebaseService.approvePendingGroupSuggestion(
        this.communityId,
        suggestion.suggestionId,
        suggestion
      );

      await loading.dismiss();

      if (result.success) {
        const toast = await this.toastCtrl.create({
          message: 'Group approved and added to community!',
          duration: 2500,
          color: 'success',
        });
        await toast.present();
        await this.loadSuggestions();
      } else {
        throw new Error(result.message);
      }
    } catch (err: any) {
      await loading.dismiss();
      const toast = await this.toastCtrl.create({
        message: 'Failed to approve: ' + (err?.message || ''),
        duration: 2500,
        color: 'danger',
      });
      await toast.present();
    }
  }

  async reject(suggestion: any) {
    const alert = await this.alertCtrl.create({
      header: 'Reject group?',
      message: `"${suggestion.groupName}" will be rejected and removed.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Reject',
          role: 'destructive',
          handler: async () => {
            await this.performReject(suggestion);
          },
        },
      ],
    });
    await alert.present();
  }

  private async performReject(suggestion: any) {
    const loading = await this.loadingCtrl.create({ message: 'Rejecting...' });
    await loading.present();

    try {
      const result = await this.firebaseService.rejectPendingGroupSuggestion(
        this.communityId,
        suggestion.suggestionId,
        suggestion
      );
      await loading.dismiss();

      const toast = await this.toastCtrl.create({
        message: result.success ? 'Group suggestion rejected.' : result.message,
        duration: 2000,
        color: result.success ? 'medium' : 'danger',
      });
      await toast.present();

      if (result.success) await this.loadSuggestions();
    } catch (err: any) {
      await loading.dismiss();
      const toast = await this.toastCtrl.create({
        message: 'Failed to reject: ' + (err?.message || ''),
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  async approveAll() {
    if (this.suggestions.length === 0) return;

    const alert = await this.alertCtrl.create({
      header: 'Approve all?',
      message: `Approve all ${this.suggestions.length} pending group suggestions?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Approve all',
          handler: async () => {
            const loading = await this.loadingCtrl.create({ message: 'Approving all...' });
            await loading.present();
            for (const s of this.suggestions) {
              try {
                await this.firebaseService.approvePendingGroupSuggestion(
                  this.communityId, s.suggestionId, s
                );
              } catch (e) {
                console.warn('Approve failed for:', s.suggestionId);
              }
            }
            await loading.dismiss();
            const toast = await this.toastCtrl.create({
              message: 'All groups approved!',
              duration: 2000,
              color: 'success',
            });
            await toast.present();
            await this.loadSuggestions();
          },
        },
      ],
    });
    await alert.present();
  }

  async rejectAll() {
    if (this.suggestions.length === 0) return;

    const alert = await this.alertCtrl.create({
      header: 'Reject all?',
      message: `Reject all ${this.suggestions.length} pending suggestions?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Reject all',
          role: 'destructive',
          handler: async () => {
            const loading = await this.loadingCtrl.create({ message: 'Rejecting all...' });
            await loading.present();
            for (const s of this.suggestions) {
              try {
                await this.firebaseService.rejectPendingGroupSuggestion(
                  this.communityId, s.suggestionId, s
                );
              } catch (e) {
                console.warn('Reject failed for:', s.suggestionId);
              }
            }
            await loading.dismiss();
            const toast = await this.toastCtrl.create({
              message: 'All suggestions rejected.',
              duration: 2000,
              color: 'medium',
            });
            await toast.present();
            await this.loadSuggestions();
          },
        },
      ],
    });
    await alert.present();
  }

  back() {
    this.navCtrl.back();
  }
}