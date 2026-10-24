import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { WakeNoticeService } from './wake-notice';

/** Cuenta las peticiones al API Gateway en curso para avisar si alguna tarda demasiado (servidores dormidos). */
export const wakeNoticeInterceptor: HttpInterceptorFn = (req, next) => {
  const esDelApi = req.url === environment.apiRootUrl || req.url.startsWith(`${environment.apiRootUrl}/`);
  if (!esDelApi) {
    return next(req);
  }
  const aviso = inject(WakeNoticeService);
  aviso.begin();
  return next(req).pipe(
    tap({
      next: (evento) => {
        if (evento instanceof HttpResponse) {
          aviso.reachable.set(true);
        }
      },
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse) {
          // Un 401 o un 404 son respuestas del servidor: esta despierto. Lo que no lo esta es un 0 o un 502/503/504.
          aviso.reachable.set(![0, 502, 503, 504].includes(error.status));
        }
      },
    }),
    finalize(() => aviso.end()),
  );
};
