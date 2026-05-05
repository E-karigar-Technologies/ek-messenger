import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { GroupDescriptionPageRoutingModule } from './group-description-routing.module';

import { GroupDescriptionPage } from './group-description.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    GroupDescriptionPageRoutingModule,
  ],
  // declarations: [GroupDescriptionPage]
})
export class GroupDescriptionPageModule {}
