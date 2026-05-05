import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CommunityMembersPageRoutingModule } from './community-members-routing.module';

import { CommunityMembersPage } from './community-members.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    CommunityMembersPageRoutingModule
  ],
  // declarations: [CommunityMembersPage]
})
export class CommunityMembersPageModule {}
