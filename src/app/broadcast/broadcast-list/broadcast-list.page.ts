import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule, NavController } from '@ionic/angular';

@Component({
  selector: 'app-broadcast-list',
  templateUrl: './broadcast-list.page.html',
  styleUrls: ['./broadcast-list.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class BroadcastListPage implements OnInit {

  sentCount = 2;
  remainingCount = 33;
  totalLimit = 35;

  broadcasts = [
    {
      names: 'Ganesh, Ravi',
      count: 2
    },
    {
      names: 'karan',
      count: 4
    }
  ];

  constructor(
    private navCtrl: NavController,
    private router: Router,
  ) {}

  ngOnInit() {}

  createBroadcast() {
    console.log('Create broadcast clicked');
    this.router.navigate(['/select-broadcast-members']);
  }

}