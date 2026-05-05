import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
// import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CallingScreenPageRoutingModule } from './calling-screen-routing.module';

import { CallingScreenPage } from './calling-screen.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    CallingScreenPageRoutingModule
  ],
  // declarations: [CallingScreenPage]
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class CallingScreenPageModule {}


// import { NgModule } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { FormsModule } from '@angular/forms';
// import { IonicModule } from '@ionic/angular';

// import { CallingScreenPageRoutingModule } from './calling-screen-routing.module';
// import { CallingScreenPage } from './calling-screen.page';

// @NgModule({
//   imports: [
//     CommonModule,
//     FormsModule,
//     IonicModule,
//     CallingScreenPageRoutingModule,
//     CallingScreenPage
//   ],
// })
// export class CallingScreenPageModule {}

