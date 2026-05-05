// // import { Component } from '@angular/core';
// import { Component, OnInit } from '@angular/core';
// import { Router } from '@angular/router';

// @Component({
//   selector: 'app-home',
//   templateUrl: 'home.page.html',
//   styleUrls: ['home.page.scss'],
//   standalone: false,
// })
// // export class HomePage {

// //   constructor() {}

// // }

// export class HomePage implements OnInit {

//   constructor(private router: Router) {}

//   ngOnInit() {
//     setTimeout(() => {
//       this.router.navigateByUrl('/welcome-screen');
//     }, 3000);
//   }

// }


import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit {

  constructor(private router: Router) {}

  ngOnInit() {
  }

  ionViewWillEnter(){
      setTimeout(() => {
      // 👀 Check if app was opened via notification
      const fromNotification = localStorage.getItem('fromNotification') === 'true';

      if (fromNotification) {
        //console.log("✅ Splash skipped → app opened from notification");
        // clear the flag here (not in AppComponent)
        localStorage.removeItem('fromNotification');
        return; // 🚫 Don’t navigate, notification handler already routed
      }

      // 🟢 Normal flow → go to welcome screen
      this.router.navigateByUrl('/welcome-screen');
    }, 2000);
  }
}
