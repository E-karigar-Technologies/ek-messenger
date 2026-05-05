// import { Injectable } from '@angular/core';
// import { CanActivate, Router } from '@angular/router';
// import { AuthService } from '../auth/auth.service';

// @Injectable({
//   providedIn: 'root'
// })
// export class LoginRedirectGuard implements CanActivate {

//   constructor(private authService: AuthService, private router: Router) {}

// //   canActivate(): boolean {
// //     if (this.authService.isLoggedIn()) {
// //       this.router.navigate(['/home-screen']); 
// //       return false;
// //     }
// //     return true;
// //   }

// canActivate(): boolean {
//   // const isLoggedIn = !!localStorage.getItem('userId');
//   if (this.authService.isAuthenticated) {
//     this.router.navigate(['/home-screen']);
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
export class LoginRedirectGuard implements CanActivate {

  constructor(private authService: AuthService, private router: Router) {}

  async canActivate(): Promise<boolean> {
    
    if (!this.authService.isAuthenticated) {
      await this.authService.hydrateAuth();
    }

    if (this.authService.isAuthenticated) {
      this.router.navigateByUrl('/home-screen', { replaceUrl: true });
      return false;
    }
    return true;
  }
}