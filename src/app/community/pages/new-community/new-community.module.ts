import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { NewCommunityPageRoutingModule } from './new-community-routing.module';

import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

import { NewCommunityPage } from './new-community.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    NewCommunityPageRoutingModule
  ],
  // declarations: [NewCommunityPage]
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class NewCommunityPageModule {}
