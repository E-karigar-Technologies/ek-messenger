// import { NgModule } from '@angular/core';
import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SeeStatusScreenPageRoutingModule } from './see-status-screen-routing.module';

import { SeeStatusScreenPage } from './see-status-screen.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SeeStatusScreenPageRoutingModule
  ],
  // declarations: [SeeStatusScreenPage]
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class SeeStatusScreenPageModule {}
