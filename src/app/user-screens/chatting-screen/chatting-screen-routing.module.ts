import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ChattingScreenPage } from './chatting-screen.page';

const routes: Routes = [
  {
    path: '',
    component: ChattingScreenPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ChattingScreenPageRoutingModule {}
