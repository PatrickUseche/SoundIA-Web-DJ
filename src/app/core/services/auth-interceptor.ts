import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth';

/** Es una direccion del API Gateway: la propia raiz o algo que cuelga de ella (no basta con empezar igual). */
function isApiUrl(url: string): boolean {
  return url === environment.apiRootUrl || url.startsWith(`${environment.apiRootUrl}/`);
}

const PUBLIC_PATHS = [`${environment.apiRootUrl}/auth/login`, `${environment.apiRootUrl}/auth/status`];

/**
 * Envia el token en cada peticion al API Gateway (y solo a el: nunca a otros servidores) y, si el API responde 401,
 * cierra la sesion y lleva al login recordando donde estaba el usuario.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiUrl(req.url)) {
    return next(req);
  }

  const auth = inject(AuthService);
  const router = inject(Router);
  const isPublic = PUBLIC_PATHS.includes(req.url);
  const token = auth.token();
  const authorized = token && !isPublic ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authorized).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && !isPublic) {
        auth.logout();
        if (!router.url.startsWith('/login')) {
          void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
        }
      }
      return throwError(() => error);
    }),
  );
};
