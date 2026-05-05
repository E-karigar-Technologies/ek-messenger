import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ViewPastMembersPageRoutingModule } from './view-past-members-routing.module';

import { ViewPastMembersPage } from './view-past-members.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ViewPastMembersPageRoutingModule
  ],
  // declarations: [ViewPastMembersPage]
})
export class ViewPastMembersPageModule {}
