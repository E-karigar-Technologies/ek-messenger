import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { IonicModule, NavController } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-account',
  templateUrl: './account.page.html',
  styleUrls: ['./account.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, RouterModule, TranslateModule],
})
export class AccountPage implements OnInit {
  constructor(
    private navCtrl: NavController,
    private router: Router,
    private translate: TranslateService
  ) {}

  ngOnInit() {}

  navigateTo(page: string) {
    this.navCtrl.navigateForward(`/settings/${page}`);
  }

  async openDeleteConfirmation() {
    // Replace with your modal/alert controller as needed
    //console.log(this.translate.instant('accountPage.confirmDelete.log'));
  }

  goToEditEmail() {
    this.router.navigate(['/email-edit']);
  }
}
