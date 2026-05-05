import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SocialMediaLinksPageRoutingModule } from './social-media-links-routing.module';

import { SocialMediaLinksPage } from './social-media-links.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SocialMediaLinksPageRoutingModule
  ],
  // declarations: [SocialMediaLinksPage]
})
export class SocialMediaLinksPageModule {}
