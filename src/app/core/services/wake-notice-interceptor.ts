import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
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
  return next(req).pipe(finalize(() => aviso.end()));
};
