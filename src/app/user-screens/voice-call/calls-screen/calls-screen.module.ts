import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
// import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CallsScreenPageRoutingModule } from './calls-screen-routing.module';


import { CallsScreenPage } from './calls-screen.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    CallsScreenPageRoutingModule
  ],
  // declarations: [CallsScreenPage]
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class CallsScreenPageModule {}
