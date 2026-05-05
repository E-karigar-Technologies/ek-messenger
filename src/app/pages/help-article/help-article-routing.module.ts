import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { HelpArticlePage } from './help-article.page';

const routes: Routes = [
  {
    path: '',
    component: HelpArticlePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HelpArticlePageRoutingModule {}
