import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScrollingModule } from '@angular/cdk/scrolling';

import { IonicModule } from '@ionic/angular';

import { ChattingScreenPageRoutingModule } from './chatting-screen-routing.module';

import { ChattingScreenPage } from './chatting-screen.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ScrollingModule,
    ChattingScreenPageRoutingModule
  ],
  // declarations: [ChattingScreenPage]
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class ChattingScreenPageModule {}