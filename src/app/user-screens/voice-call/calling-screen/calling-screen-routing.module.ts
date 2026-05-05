import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CallingScreenPage } from './calling-screen.page';

const routes: Routes = [
  {
    path: '',
    component: CallingScreenPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CallingScreenPageRoutingModule {}




// import { NgModule } from '@angular/core';
// import { RouterModule, Routes } from '@angular/router';
// import { CallingScreenPage } from './calling-screen.page';

// const routes: Routes = [
//   {
//     path: '',
//     component: CallingScreenPage
//   }
// ];

// @NgModule({
//   imports: [RouterModule.forChild(routes)],
//   exports: [RouterModule],
// })
// export class CallingScreenPageRoutingModule {}
