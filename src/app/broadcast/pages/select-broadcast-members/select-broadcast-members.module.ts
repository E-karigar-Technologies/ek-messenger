import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SelectBroadcastMembersPageRoutingModule } from './select-broadcast-members-routing.module';

import { SelectBroadcastMembersPage } from './select-broadcast-members.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SelectBroadcastMembersPageRoutingModule
  ],
  // declarations: [SelectBroadcastMembersPage]
})
export class SelectBroadcastMembersPageModule {}
