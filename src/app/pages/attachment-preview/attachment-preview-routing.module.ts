import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AttachmentPreviewPage } from './attachment-preview.page';

const routes: Routes = [
  {
    path: '',
    component: AttachmentPreviewPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AttachmentPreviewPageRoutingModule {}
