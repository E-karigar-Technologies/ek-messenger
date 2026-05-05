import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
// import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ForwardmessagePageRoutingModule } from './forwardmessage-routing.module';

// import { ForwardmessagePage } from './forwardmessage.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ForwardmessagePageRoutingModule
  ],
  // declarations: [ForwardmessagePage]
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ForwardmessagePageModule {}
