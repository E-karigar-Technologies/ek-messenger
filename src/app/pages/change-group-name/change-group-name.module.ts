import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ChangeGroupNamePageRoutingModule } from './change-group-name-routing.module';

import { ChangeGroupNamePage } from './change-group-name.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ChangeGroupNamePageRoutingModule
  ],
  // declarations: [ChangeGroupNamePage]
})
export class ChangeGroupNamePageModule {}
