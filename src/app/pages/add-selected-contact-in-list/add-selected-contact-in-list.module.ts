import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AddSelectedContactInListPageRoutingModule } from './add-selected-contact-in-list-routing.module';

import { AddSelectedContactInListPage } from './add-selected-contact-in-list.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AddSelectedContactInListPageRoutingModule
  ],
  // declarations: [AddSelectedContactInListPage]
})
export class AddSelectedContactInListPageModule {}
