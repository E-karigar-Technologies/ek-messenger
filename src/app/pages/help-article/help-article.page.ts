import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonBackButton, IonButton, IonIcon } from "@ionic/angular/standalone";

@Component({
  selector: 'app-help-article',
  templateUrl: './help-article.page.html',
  styleUrls: ['./help-article.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class HelpArticlePage implements OnInit {

  constructor() { }

  ngOnInit() {
  }
  contactSupport() {
    console.log('Contact support clicked');
    // You can navigate or open mail/chat support here
  } 

}
