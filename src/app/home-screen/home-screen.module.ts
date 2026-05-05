import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
// import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { HomeScreenPageRoutingModule } from './home-screen-routing.module';

import { HomeScreenPage } from './home-screen.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    HomeScreenPageRoutingModule
  ],
  // declarations: [HomeScreenPage]
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class HomeScreenPageModule {}
