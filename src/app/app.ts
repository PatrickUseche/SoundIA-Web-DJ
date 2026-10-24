import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth';
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
  private readonly router = inject(Router);

  protected cerrarSesion(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
