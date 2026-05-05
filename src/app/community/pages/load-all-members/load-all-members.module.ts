import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { LoadAllMembersPageRoutingModule } from './load-all-members-routing.module';

import { LoadAllMembersPage } from './load-all-members.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    LoadAllMembersPageRoutingModule
  ],
  // declarations: [LoadAllMembersPage]
})
export class LoadAllMembersPageModule {}
