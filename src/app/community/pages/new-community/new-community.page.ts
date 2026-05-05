import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { NavController } from '@ionic/angular';
import { Router } from '@angular/router';

@Component({
  selector: 'app-new-community',
  templateUrl: './new-community.page.html',
  styleUrls: ['./new-community.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class NewCommunityPage implements OnInit {

  constructor(private navCtrl: NavController,private router: Router) {}

  ngOnInit() {}

  close() {
    this.navCtrl.back(); // or dismiss modal
  }

  getStarted() {
    //console.log('Get started clicked');
    // Navigate to create community form
    this.navCtrl.navigateForward('/create-community-form');
  }

    goToNewCommunityForm() {
    this.router.navigate(['/new-community-form']); // 👈 Navigate to that page
  }

}
