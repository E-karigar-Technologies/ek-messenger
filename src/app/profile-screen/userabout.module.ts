import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
// import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { UseraboutPageRoutingModule } from './userabout-routing.module';

import { UseraboutPage } from './userabout.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    UseraboutPageRoutingModule
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
  // declarations: [UseraboutPage]
})
export class UseraboutPageModule { }
