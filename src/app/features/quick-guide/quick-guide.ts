import { Component, InjectionToken, inject, signal } from '@angular/core';

export const QUICK_GUIDE_KEY = 'soundia.guia.vista';

/** Donde se recuerda que la guia ya se vio (localStorage); null si no hay. */
export const QUICK_GUIDE_STORAGE = new InjectionToken<Pick<Storage, 'getItem' | 'setItem'> | null>('QUICK_GUIDE_STORAGE', {
  providedIn: 'root',
  factory: () => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null; // algunos navegadores lanzan al acceder al almacenamiento cuando esta bloqueado
    }
  },
});

/**
 * Guia rapida para quien usa SoundIA por primera vez: los cinco pasos del flujo y el aviso de los servidores gratuitos.
 * Se muestra abierta la primera vez; cuando el usuario la cierra se recuerda y la siguiente vez aparece plegada.
 */
@Component({
  selector: 'app-quick-guide',
  template: `
    <details class="plegable guia-rapida" [open]="isOpen()" (toggle)="onToggle($event)">
      <summary>Guia rapida: como empezar</summary>
      <ol>
        <li>
          <strong>Sube tus canciones</strong> en la Biblioteca (puedes elegir varias; mejor MP3 de menos de 12 MB) y
          ponles el genero.
        </li>
        <li><strong>Cargalas en los decks</strong>: una en el Deck A, otra en el Deck B, y dale Play.</li>
        <li>
          <strong>Enciende «Grabar mis mezclas»</strong> en Aprendizaje y mezcla a mano con el crossfader y el
          ecualizador: asi la IA aprende tu estilo.
        </li>
        <li>
          <strong>Revisa tus mezclas</strong> en Grabaciones: marca las buenas, descarta las malas y descarga la copia.
        </li>
        <li>
          Si algo tarda, los servidores gratuitos estan despertando (hasta 3 minutos): <strong>espera, no recargues</strong>. Con las
          canciones ya cargadas en los decks puedes seguir mezclando.
        </li>
      </ol>
    </details>
  `,
})
export class QuickGuideComponent {
  private readonly storage = inject(QUICK_GUIDE_STORAGE);

  /** Abierta hasta que el usuario la cierre por primera vez. */
  readonly isOpen = signal(this.isPending());

  private isPending(): boolean {
    try {
      return this.storage?.getItem(QUICK_GUIDE_KEY) !== '1';
    } catch {
      return true;
    }
  }

  onToggle(domEvent: Event): void {
    const isOpen = (domEvent.target as HTMLDetailsElement).open;
    this.isOpen.set(isOpen);
    if (!isOpen) {
      try {
        this.storage?.setItem(QUICK_GUIDE_KEY, '1');
      } catch {
        // sin espacio o bloqueado: solo se volvera a mostrar abierta tras recargar
      }
    }
  }
}
