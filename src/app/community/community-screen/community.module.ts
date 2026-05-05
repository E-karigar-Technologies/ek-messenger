import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CommunityPageRoutingModule } from './community-routing.module';
import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';

import { CommunityPage } from './community.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    CommunityPageRoutingModule
  ],
  // declarations: [CommunityPage]  
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class CommunityPageModule {}
