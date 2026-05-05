import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { DefaultMessageTimerPageRoutingModule } from './default-message-timer-routing.module';

import { DefaultMessageTimerPage } from './default-message-timer.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DefaultMessageTimerPageRoutingModule
  ],
  // declarations: [DefaultMessageTimerPage]
})
export class DefaultMessageTimerPageModule {}
