import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ContactMatchResponse } from './model/sync-queue.model';
import { environment } from 'src/environments/environment.prod';
import { AuthService } from '../auth/auth.service';

@Injectable({
  providedIn: 'root'
})
export class SyncApiService {

  private baseUrl = environment.apiBaseUrl;

  constructor(
    private http: HttpClient,
    private authService:AuthService
  ) {}

  /**
   * 🔐 Get Authorization Headers with JWT Token
   */
  private async getAuthHeaders(): Promise<HttpHeaders> {

    const auth = this.authService.authData?.app_token;

    if (!auth) return new HttpHeaders();

   
    const token = auth;

    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
  }

  /**
   * ✅ Stateless contact match API (new)
   * POST /api/contacts/match
   */
  matchContacts(payload: { hashes: string[] }): Observable<ContactMatchResponse> {
    return from(this.getAuthHeaders()).pipe(
      switchMap(headers => {
        return this.http.post<ContactMatchResponse>(
          `${this.baseUrl}/api/contacts/match`,
          payload,
          { headers }
        );
      })
    );
  }
}
