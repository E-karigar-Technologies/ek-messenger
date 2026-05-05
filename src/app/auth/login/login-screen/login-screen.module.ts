import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
// import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { LoginScreenPageRoutingModule } from './login-screen-routing.module';

import { LoginScreenPage } from './login-screen.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    LoginScreenPageRoutingModule
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
  // declarations: [LoginScreenPage]
})
export class LoginScreenPageModule { }
