import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AddGroupCommunityPageRoutingModule } from './add-group-community-routing.module';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

import { AddGroupCommunityPage } from './add-group-community.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AddGroupCommunityPageRoutingModule,
  ],
  // declarations: [AddGroupCommunityPage]
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AddGroupCommunityPageModule {}
