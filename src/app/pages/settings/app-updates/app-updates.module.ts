import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AppUpdatesPageRoutingModule } from './app-updates-routing.module';

// import { AppUpdatesPage } from './app-updates.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AppUpdatesPageRoutingModule
  ],
  // declarations: [AppUpdatesPage]
})
export class AppUpdatesPageModule {}
