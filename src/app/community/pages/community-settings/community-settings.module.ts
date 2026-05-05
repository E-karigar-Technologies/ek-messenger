import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CommunitySettingsPageRoutingModule } from './community-settings-routing.module';

import { CommunitySettingsPage } from './community-settings.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    CommunitySettingsPageRoutingModule
  ],
  // declarations: [CommunitySettingsPage]
})
export class CommunitySettingsPageModule {}
