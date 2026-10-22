import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth';

/** Deja pasar si el API no exige login o ya hay una sesion; si no, lleva al login recordando a donde iba. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth
    .status()
    .pipe(
      map((enabled) =>
        !enabled || auth.authenticated()
          ? true
          : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } }),
      ),
    );
};
