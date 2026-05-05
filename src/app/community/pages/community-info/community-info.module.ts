import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CommunityInfoPageRoutingModule } from './community-info-routing.module';

import { CommunityInfoPage } from './community-info.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    CommunityInfoPageRoutingModule
  ],
  // declarations: [CommunityInfoPage]
})
export class CommunityInfoPageModule {}
