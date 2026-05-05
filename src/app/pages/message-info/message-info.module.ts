import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MessageInfoPageRoutingModule } from './message-info-routing.module';

import { MessageInfoPage } from './message-info.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MessageInfoPageRoutingModule
  ],
  // declarations: [MessageInfoPage]
})
export class MessageInfoPageModule {}
