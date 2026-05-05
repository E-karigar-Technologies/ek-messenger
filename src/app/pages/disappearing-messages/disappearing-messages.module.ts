import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { DisappearingMessagesPageRoutingModule } from './disappearing-messages-routing.module';

import { DisappearingMessagesPage } from './disappearing-messages.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DisappearingMessagesPageRoutingModule
  ],
  // declarations: [DisappearingMessagesPage]
})
export class DisappearingMessagesPageModule {}
