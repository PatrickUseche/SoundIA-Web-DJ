import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { WakeNoticeService } from './wake-notice';

/** Cuenta las peticiones al API Gateway en curso para avisar si alguna tarda demasiado (servidores dormidos). */
export const wakeNoticeInterceptor: HttpInterceptorFn = (req, next) => {
  const isFromApi = req.url === environment.apiRootUrl || req.url.startsWith(`${environment.apiRootUrl}/`);
  if (!isFromApi) {
    return next(req);
  }
  const noticeText = inject(WakeNoticeService);
  noticeText.begin();
  return next(req).pipe(
    tap({
      next: (domEvent) => {
        if (domEvent instanceof HttpResponse) {
          noticeText.reachable.set(true);
        }
      },
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse) {
          // Un 401 o un 404 son respuestas del servidor: esta despierto. Lo que no lo esta es un 0 o un 502/503/504.
          noticeText.reachable.set(![0, 502, 503, 504].includes(error.status));
        }
      },
    }),
    finalize(() => noticeText.end()),
  );
};
