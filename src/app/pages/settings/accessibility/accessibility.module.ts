import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AccessibilityPageRoutingModule } from './accessibility-routing.module';

// import { AccessibilityPage } from './accessibility.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AccessibilityPageRoutingModule
  ],
  // declarations: [AccessibilityPage]
})
export class AccessibilityPageModule {}
