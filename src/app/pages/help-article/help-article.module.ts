import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { HelpArticlePageRoutingModule } from './help-article-routing.module';

import { HelpArticlePage } from './help-article.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    HelpArticlePageRoutingModule
  ],
  // declarations: [HelpArticlePage]
})
export class HelpArticlePageModule {}
