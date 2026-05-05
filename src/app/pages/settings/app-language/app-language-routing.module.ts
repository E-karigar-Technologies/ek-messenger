import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AppLanguagePage } from './app-language.page';

const routes: Routes = [
  {
    path: '',
    component: AppLanguagePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AppLanguagePageRoutingModule {}
