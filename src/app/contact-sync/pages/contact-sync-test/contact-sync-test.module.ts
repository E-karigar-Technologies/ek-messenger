import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ContactSyncTestPageRoutingModule } from './contact-sync-test-routing.module';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ContactSyncTestPageRoutingModule
  ],
  declarations: []
})
export class ContactSyncTestPageModule {}
