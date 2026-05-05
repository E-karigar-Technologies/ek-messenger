import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ProfileDpViewPageRoutingModule } from './profile-dp-view-routing.module';

import { ProfileDpViewPage } from './profile-dp-view.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ProfileDpViewPageRoutingModule
  ],
  // declarations: [ProfileDpViewPage]
})
export class ProfileDpViewPageModule {}
