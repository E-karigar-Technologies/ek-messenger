import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router'

@Component({
  selector: 'app-welcome-screen',
  templateUrl: './welcome-screen.page.html',
  styleUrls: ['./welcome-screen.page.scss'],
  imports: [IonicModule, CommonModule]
})

export class WelcomeScreenPage {
  constructor(private router: Router) { }

  goToLogin() {
    this.router.navigateByUrl('/login-screen');
  }

  ngOnInit() {
  }

}
