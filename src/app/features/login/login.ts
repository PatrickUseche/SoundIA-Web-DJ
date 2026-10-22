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
  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    // Si no hace falta login (o ya hay sesion) no tiene sentido quedarse aqui.
    this.auth.status().subscribe((enabled) => {
      if (!enabled || this.auth.authenticated()) {
        void this.router.navigateByUrl(this.destino());
      }
    });
  }

  alEscribir(campo: 'username' | 'password', evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    (campo === 'username' ? this.username : this.password).set(valor);
  }

  alEnviar(evento: Event): void {
    evento.preventDefault();
    if (this.enviando() || !this.username() || !this.password()) {
      return;
    }
    this.enviando.set(true);
    this.error.set(null);
    this.auth.login(this.username(), this.password()).subscribe({
      next: () => {
        this.password.set('');
        this.enviando.set(false);
        void this.router.navigateByUrl(this.destino());
      },
      error: (err: unknown) => {
        this.password.set('');
        this.error.set(this.mensajeDe(err));
        this.enviando.set(false);
      },
    });
  }

  private mensajeDe(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) {
        return 'Usuario o contrasena incorrectos.';
      }
      if (err.status === 429) {
        const segundos = Number(err.headers.get('Retry-After'));
        return Number.isFinite(segundos) && segundos > 0
          ? `Demasiados intentos fallidos. Espera ${segundos} s e intenta de nuevo.`
          : 'Demasiados intentos fallidos. Espera unos segundos e intenta de nuevo.';
      }
    }
    return httpErrorMessage(err, 'No se pudo iniciar sesion.');
  }

  /** A donde ir al terminar: la pantalla que se pedia, solo si es una ruta interna (nunca otro sitio). */
  private destino(): string {
    const pedido = this.route.snapshot.queryParamMap.get('returnUrl');
    return pedido && pedido.startsWith('/') && !pedido.startsWith('//') && !pedido.startsWith('/login') ? pedido : '/';
  }
}
