import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { StorageDataPage } from './storage-data.page';

const routes: Routes = [
  {
    path: '',
    component: StorageDataPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class StorageDataPageRoutingModule {}
