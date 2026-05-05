import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { NewCommunityFormPageRoutingModule } from './new-community-form-routing.module';

import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

import { NewCommunityFormPage } from './new-community-form.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    NewCommunityFormPageRoutingModule,
  ],
  // declarations: [NewCommunityFormPage]
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class NewCommunityFormPageModule {}
