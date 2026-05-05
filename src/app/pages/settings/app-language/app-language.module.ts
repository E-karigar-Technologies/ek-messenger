import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AppLanguagePageRoutingModule } from './app-language-routing.module';

// import { AppLanguagePage } from './app-language.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AppLanguagePageRoutingModule
  ],
  // declarations: [AppLanguagePage]
})
export class AppLanguagePageModule {}
