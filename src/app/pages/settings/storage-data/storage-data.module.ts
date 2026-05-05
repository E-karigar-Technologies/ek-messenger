import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { StorageDataPageRoutingModule } from './storage-data-routing.module';

// import { StorageDataPage } from './storage-data.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    StorageDataPageRoutingModule
  ],
  // declarations: [StorageDataPage]
})
export class StorageDataPageModule {}
