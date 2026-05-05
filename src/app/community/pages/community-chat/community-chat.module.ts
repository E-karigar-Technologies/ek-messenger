import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CommunityChatPageRoutingModule } from './community-chat-routing.module';

import { CommunityChatPage } from './community-chat.page';
import { ScrollingModule } from '@angular/cdk/scrolling';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ScrollingModule,
    CommunityChatPageRoutingModule
  ],
  // declarations: [CommunityChatPage]
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class CommunityChatPageModule {}
