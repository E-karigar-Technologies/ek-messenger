import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AddInstagramPageRoutingModule } from './add-instagram-routing.module';

import { AddInstagramPage } from './add-instagram.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AddInstagramPageRoutingModule
  ],
  // declarations: [AddInstagramPage]
})
export class AddInstagramPageModule {}
