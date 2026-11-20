import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { httpErrorMessage } from '../../core/http-error-message';
import { AuthService } from '../../core/services/auth';

/** Inicio de sesion del DJ. Solo hace falta cuando el API Gateway tiene la autenticacion encendida. */
@Component({
  selector: 'app-login',
  templateUrl: './login.html',
})
export class LoginComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly username = signal('');
  readonly password = signal('');
  readonly isSending = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    // Si no hace falta login (o ya hay sesion) no tiene sentido quedarse aqui.
    this.auth.status().subscribe((enabled) => {
      if (!enabled || this.auth.authenticated()) {
        void this.router.navigateByUrl(this.redirectTarget());
      }
    });
  }

  onType(field: 'username' | 'password', domEvent: Event): void {
    const rawValue = (domEvent.target as HTMLInputElement).value;
    (field === 'username' ? this.username : this.password).set(rawValue);
  }

  onSubmit(domEvent: Event): void {
    domEvent.preventDefault();
    if (this.isSending() || !this.username() || !this.password()) {
      return;
    }
    this.isSending.set(true);
    this.error.set(null);
    this.auth.login(this.username(), this.password()).subscribe({
      next: () => {
        this.password.set('');
        this.isSending.set(false);
        void this.router.navigateByUrl(this.redirectTarget());
      },
      error: (err: unknown) => {
        this.password.set('');
        this.error.set(this.messageFor(err));
        this.isSending.set(false);
      },
    });
  }

  private messageFor(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) {
        return 'Usuario o contraseña incorrectos.';
      }
      if (err.status === 429) {
        const secondsValue = Number(err.headers.get('Retry-After'));
        return Number.isFinite(secondsValue) && secondsValue > 0
          ? `Demasiados intentos fallidos. Espera ${secondsValue} s e intenta de nuevo.`
          : 'Demasiados intentos fallidos. Espera unos segundos e intenta de nuevo.';
      }
    }
    return httpErrorMessage(err, 'No se pudo iniciar sesión.');
  }

  /** A donde ir al terminar: la pantalla que se pedia, solo si es una ruta interna (nunca otro sitio). */
  private redirectTarget(): string {
    const requested = this.route.snapshot.queryParamMap.get('returnUrl');
    return requested && requested.startsWith('/') && !requested.startsWith('//') && !requested.startsWith('/login') ? requested : '/';
  }
}
