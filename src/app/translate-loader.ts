import { HttpClient } from '@angular/common/http';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

export function HttpLoaderFactory(http: HttpClient) {
  // loads: assets/i18n/en.json, assets/i18n/ar.json, etc.
  return new TranslateHttpLoader(http, 'assets/selected_i18n_files/', '.json');
}
