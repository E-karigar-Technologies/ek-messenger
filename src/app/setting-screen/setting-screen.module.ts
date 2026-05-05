import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
// import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SettingScreenPageRoutingModule } from './setting-screen-routing.module';

import { SettingScreenPage } from './setting-screen.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SettingScreenPageRoutingModule
  ],
  // declarations: [SettingScreenPage]
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class SettingScreenPageModule {}
