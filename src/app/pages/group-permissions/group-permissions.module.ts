import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { GroupPermissionsPageRoutingModule } from './group-permissions-routing.module';

import { GroupPermissionsPage } from './group-permissions.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    GroupPermissionsPageRoutingModule
  ],
  // declarations: [GroupPermissionsPage]
})
export class GroupPermissionsPageModule {}
