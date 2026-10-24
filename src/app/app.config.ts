import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/services/auth-interceptor';
import { wakeNoticeInterceptor } from './core/services/wake-notice-interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(),
    // HttpClient es requerido por los servicios; un interceptor agrega el token de sesion a las peticiones al API y otro
    // cuenta las que tardan para avisar de que los servidores estan despertando.
    provideHttpClient(withInterceptors([authInterceptor, wakeNoticeInterceptor]))
  ],
};
