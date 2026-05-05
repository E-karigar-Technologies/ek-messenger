import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { UpdateUsernamePageRoutingModule } from './update-username-routing.module';

import { UpdateUsernamePage } from './update-username.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    UpdateUsernamePageRoutingModule
  ],
  // declarations: [UpdateUsernamePage]
})
export class UpdateUsernamePageModule {}
