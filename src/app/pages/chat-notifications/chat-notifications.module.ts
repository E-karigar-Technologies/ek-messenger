import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ChatNotificationsPageRoutingModule } from './chat-notifications-routing.module';

import { ChatNotificationsPage } from './chat-notifications.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ChatNotificationsPageRoutingModule
  ],
  // declarations: [ChatNotificationsPage]
})
export class ChatNotificationsPageModule {}
