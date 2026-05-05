import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AddExistingGroupsPageRoutingModule } from './add-existing-groups-routing.module';

import { AddExistingGroupsPage } from './add-existing-groups.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AddExistingGroupsPageRoutingModule
  ],
  // declarations: [AddExistingGroupsPage]
})
export class AddExistingGroupsPageModule {}
