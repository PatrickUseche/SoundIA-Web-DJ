import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth';
import { EngineStatusService } from './core/services/engine-status';
import { KeepAliveService } from './core/services/keep-alive';
import { WakeNoticeService } from './core/services/wake-notice';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('soundia-web-dj');
  protected readonly auth = inject(AuthService);
  protected readonly aviso = inject(WakeNoticeService);
  protected readonly motor = inject(EngineStatusService);
  private readonly keepAlive = inject(KeepAliveService);
  private readonly router = inject(Router);

  constructor() {
    // Mientras la pagina este abierta y alguien la use, los servidores gratuitos no se duermen.
    this.keepAlive.start();
    this.motor.start();
  }

  protected cerrarSesion(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
