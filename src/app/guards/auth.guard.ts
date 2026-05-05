// import { Injectable } from '@angular/core';
// import { CanActivate, Router } from '@angular/router';
// import { AuthService } from '../auth/auth.service';

// @Injectable({
//   providedIn: 'root'
// })
// export class AuthGuard implements CanActivate {

//   constructor(private authService: AuthService, private router: Router) {}

// canActivate(): boolean {
//   // const isLoggedIn = !!localStorage.getItem('userId');
//   // this.router.url
//   if (!this.authService.isAuthenticated) {
//     this.router.navigate(['/login-screen']);
//     return false;
//   }
//   return true;
// }

// }

import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(private authService: AuthService, private router: Router) {}

  async canActivate(): Promise<boolean> {
    
    if (!this.authService.isAuthenticated) {
      await this.authService.hydrateAuth();
    }

    if (!this.authService.isAuthenticated) {
      this.router.navigateByUrl('/login-screen', { replaceUrl: true });
      return false;
    }
    return true;
  }
}



// import { Injectable } from '@angular/core';
// import { CanActivate, Router } from '@angular/router';
// import { AuthService } from '../auth/auth.service';

// @Injectable({
//   providedIn: 'root'
// })
// export class AuthGuard implements CanActivate {

//   constructor(private authService: AuthService, private router: Router) {}

//   async canActivate(): Promise<boolean> {
//     const isLoggedIn = await this.authService.isLoggedIn();
//     if (!isLoggedIn) {
//       this.router.navigate(['/login-screen']);
//       return false;
//     }
//     return true;
//   }
// }
