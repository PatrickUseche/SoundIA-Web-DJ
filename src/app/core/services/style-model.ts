import { Injectable, inject, signal } from '@angular/core';
import { httpErrorMessage } from '../http-error-message';
import { StyleModelInfo } from '../models/autodj';
import { AutoDjApiService } from './autodj-api';

/**
 * El estado del modelo que aprende el estilo del DJ (solo de sus mezclas buenas). Lo comparten la pantalla de
 * grabaciones (que lo muestra y lo enciende) y quien cambie las grabaciones buenas (que pide recargarlo).
 */
@Injectable({ providedIn: 'root' })
export class StyleModelService {
  private readonly api = inject(AutoDjApiService);

  readonly info = signal<StyleModelInfo | null>(null);
  readonly error = signal<string | null>(null);
  readonly changing = signal(false);

  load(): void {
    this.api.styleModel().subscribe({
      next: (info) => {
        this.info.set(info);
        this.error.set(null);
      },
      error: (err) => this.error.set(httpErrorMessage(err, 'No se pudo consultar el modelo de tu estilo.')),
    });
  }

  /** Enciende o apaga el modelo. Apagarlo es la vuelta atras: el Auto-DJ vuelve a usar solo las reglas. */
  setEnabled(enabled: boolean): void {
    this.changing.set(true);
    this.api.setStyleModel(enabled).subscribe({
      next: (info) => {
        this.info.set(info);
        this.error.set(null);
        this.changing.set(false);
      },
      error: (err) => {
        this.error.set(httpErrorMessage(err, 'No se pudo cambiar el modelo de tu estilo.'));
        this.changing.set(false);
      },
    });
  }
}
