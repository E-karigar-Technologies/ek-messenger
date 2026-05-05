import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ArchievedScreenPageRoutingModule } from './archieved-screen-routing.module';

import { ArchievedScreenPage } from './archieved-screen.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ArchievedScreenPageRoutingModule
  ],
  // declarations: [ArchievedScreenPage]
})
export class ArchievedScreenPageModule {}
