import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ConfirmAddExistingGroupsPageRoutingModule } from './confirm-add-existing-groups-routing.module';

import { ConfirmAddExistingGroupsPage } from './confirm-add-existing-groups.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ConfirmAddExistingGroupsPageRoutingModule
  ],
  // declarations: [ConfirmAddExistingGroupsPage]
})
export class ConfirmAddExistingGroupsPageModule {}
