import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { WelcomeScreenPage } from './welcome-screen.page';

const routes: Routes = [
  {
    path: '',
    component: WelcomeScreenPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class WelcomeScreenPageRoutingModule {}
