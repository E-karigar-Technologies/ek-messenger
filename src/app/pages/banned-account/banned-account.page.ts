import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, NavController } from '@ionic/angular';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-banned-account',
  templateUrl: './banned-account.page.html',
  styleUrls: ['./banned-account.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule]
})
export class BannedAccountPage implements OnInit {

  constructor(
    private router: Router,
    private navCtrl: NavController,
    private authService: AuthService
  ) { }

  ngOnInit() {
  }

  async registerNewNumber() {
    await this.authService.logout();
    this.router.navigate(['/welcome-screen'], { replaceUrl: true });
  }
}
