import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ArchievedScreenPage } from './archieved-screen.page';

const routes: Routes = [
  {
    path: '',
    component: ArchievedScreenPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ArchievedScreenPageRoutingModule {}
