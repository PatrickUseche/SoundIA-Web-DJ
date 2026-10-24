import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { httpErrorMessage } from '../../core/http-error-message';
import {
  RecordingCounts, RecordingQuality, RecordingSummary,
} from '../../core/models/recording';
import { RecordingApiService } from '../../core/services/recordings';
import { TrackApiService } from '../../core/services/tracks';

export type FiltroGrabaciones = 'todas' | RecordingQuality;

export const FILTROS: { valor: FiltroGrabaciones; texto: string }[] = [
  { valor: 'todas', texto: 'Todas' },
  { valor: 'unreviewed', texto: 'Sin revisar' },
  { valor: 'good', texto: 'Buenas' },
  { valor: 'discard', texto: 'Descartadas' },
];

const FORMA_CROSSFADER: Record<string, string> = { corte: 'Corte', gradual: 'Gradual', lento: 'Lento' };

/**
 * Revision de las mezclas que el DJ grabo con el modo aprendizaje: marcarlas como buenas o descartarlas y anotar por
 * que, porque solo las buenas deberian usarse para entrenar. Tambien baja y restaura la copia de seguridad.
 */
@Component({
  selector: 'app-recordings',
  imports: [DatePipe],
  templateUrl: './recordings.html',
  styleUrl: './recordings.css',
})
export class RecordingsComponent implements OnInit {
  private readonly api = inject(RecordingApiService);
  private readonly tracksApi = inject(TrackApiService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly filtros = FILTROS;

  readonly recordings = signal<RecordingSummary[]>([]);
  readonly counts = signal<RecordingCounts>({ unreviewed: 0, good: 0, discard: 0, total: 0 });
  readonly filtro = signal<FiltroGrabaciones>('todas');
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly mensaje = signal<string | null>(null);
  readonly errorAccion = signal<string | null>(null);
  /** Grabacion cuyo borrado espera confirmacion. */
  readonly confirmandoBorrado = signal<number | null>(null);
  readonly trabajando = signal(false);

  /** Titulos de las pistas por id, para decir de que pista a que pista fue cada mezcla. */
  private readonly titulos = signal<Map<number, string>>(new Map());

  readonly hayGrabaciones = computed(() => this.counts().total > 0);

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    const calidad = this.filtro() === 'todas' ? undefined : (this.filtro() as RecordingQuality);
    this.api
      .list(calidad)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (lista) => {
          this.recordings.set(lista.recordings);
          this.counts.set(lista.counts);
          this.cargando.set(false);
        },
        error: (err) => {
          this.error.set(httpErrorMessage(err, 'No se pudieron cargar las grabaciones.'));
          this.cargando.set(false);
        },
      });
    // Los titulos son un extra: si no se pueden leer, se muestra el numero de la pista.
    this.tracksApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (pistas) => this.titulos.set(new Map(pistas.map((p) => [p.id, p.title]))),
        error: () => undefined,
      });
  }

  elegirFiltro(valor: FiltroGrabaciones): void {
    this.filtro.set(valor);
    this.cargar();
  }

  /** "Titulo de A -> Titulo de B"; si una pista ya se borro se dice asi. */
  pistas(r: RecordingSummary): string {
    return `${this.nombre(r.fromTrackId)} → ${this.nombre(r.toTrackId)}`;
  }

  private nombre(id: number | null): string {
    if (id === null) {
      return '(pista borrada)';
    }
    return this.titulos().get(id) ?? `pista ${id}`;
  }

  genero(r: RecordingSummary): string {
    if (!r.genreA && !r.genreB) {
      return '';
    }
    return r.genreA === r.genreB || !r.genreB ? r.genreA : `${r.genreA || '?'} → ${r.genreB}`;
  }

  forma(r: RecordingSummary): string {
    const forma = r.features.crossfaderShape;
    return forma ? (FORMA_CROSSFADER[forma] ?? forma) : '';
  }

  /** Cambio de graves: en que punto del solape (en %) bajo el grave de la pista que sale. */
  cambioDeGraves(r: RecordingSummary): string {
    const punto = r.features.bassSwapAt;
    return punto === null || punto === undefined ? '' : `${Math.round(punto * 100)} %`;
  }

  desfase(r: RecordingSummary): string {
    const ms = r.features.phaseErrorMs;
    return ms === null || ms === undefined ? '' : `${Math.round(ms)} ms`;
  }

  /** Marca la grabacion como buena, descartada o sin revisar. */
  marcar(r: RecordingSummary, calidad: RecordingQuality): void {
    if (r.quality === calidad) {
      return;
    }
    this.errorAccion.set(null);
    this.api
      .review(r.id, { quality: calidad })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actualizada) => {
          this.cambiarConteo(r.quality, actualizada.quality);
          const filtro = this.filtro();
          // Con un filtro puesto, la que ya no encaja sale de la lista.
          if (filtro !== 'todas' && actualizada.quality !== filtro) {
            this.recordings.update((lista) => lista.filter((x) => x.id !== r.id));
          } else {
            this.recordings.update((lista) => lista.map((x) => (x.id === r.id ? { ...x, ...actualizada } : x)));
          }
        },
        error: (err) => this.errorAccion.set(httpErrorMessage(err, 'No se pudo guardar la revision.')),
      });
  }

  /** Guarda la nota al salir del campo; si no cambio, no llama al API. */
  guardarNotas(r: RecordingSummary, evento: Event): void {
    const campo = evento.target as HTMLInputElement;
    const notas = campo.value.trim();
    if (notas === r.notes) {
      return;
    }
    this.errorAccion.set(null);
    this.api
      .review(r.id, { notes: notas })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actualizada) =>
          this.recordings.update((lista) => lista.map((x) => (x.id === r.id ? { ...x, notes: actualizada.notes } : x))),
        error: (err) => {
          this.errorAccion.set(httpErrorMessage(err, 'No se pudo guardar la nota.'));
          campo.value = r.notes;
        },
      });
  }

  pedirBorrado(r: RecordingSummary): void {
    this.mensaje.set(null);
    this.errorAccion.set(null);
    this.confirmandoBorrado.set(r.id);
  }

  cancelarBorrado(): void {
    this.confirmandoBorrado.set(null);
  }

  borrar(r: RecordingSummary): void {
    this.confirmandoBorrado.set(null);
    this.api
      .remove(r.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.recordings.update((lista) => lista.filter((x) => x.id !== r.id));
          this.counts.update((c) => ({ ...c, [r.quality]: Math.max(0, c[r.quality] - 1), total: Math.max(0, c.total - 1) }));
          this.mensaje.set('Grabacion borrada.');
        },
        error: (err) => this.errorAccion.set(httpErrorMessage(err, 'No se pudo borrar la grabacion.')),
      });
  }

  /** Baja todas las grabaciones a un archivo JSON (con el token de sesion: un enlace directo no lo llevaria). */
  async descargarCopia(): Promise<void> {
    this.mensaje.set(null);
    this.errorAccion.set(null);
    this.trabajando.set(true);
    try {
      const archivo = await firstValueFrom(this.api.exportAll());
      const url = URL.createObjectURL(archivo);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = 'soundia-grabaciones.json';
      enlace.click();
      URL.revokeObjectURL(url);
      this.mensaje.set('Copia descargada.');
    } catch (err) {
      this.errorAccion.set(httpErrorMessage(err, 'No se pudo descargar la copia.'));
    } finally {
      this.trabajando.set(false);
    }
  }

  /** Restaura las grabaciones de una copia descargada antes; las que ya estan no se duplican. */
  async restaurarCopia(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo) {
      return;
    }
    this.mensaje.set(null);
    this.errorAccion.set(null);
    this.trabajando.set(true);
    try {
      let copia: unknown;
      try {
        copia = JSON.parse(await archivo.text());
      } catch {
        throw new Error('El archivo no es un JSON valido.');
      }
      const resultado = await firstValueFrom(this.api.importAll(copia));
      this.mensaje.set(`${resultado.created} grabaciones restauradas; ${resultado.skipped} ya estaban.`);
      this.cargar();
    } catch (err) {
      this.errorAccion.set(
        err instanceof Error && !('status' in err) ? err.message : httpErrorMessage(err, 'No se pudo restaurar la copia.'),
      );
    } finally {
      this.trabajando.set(false);
    }
  }

  private cambiarConteo(antes: RecordingQuality, despues: RecordingQuality): void {
    this.counts.update((c) => ({ ...c, [antes]: Math.max(0, c[antes] - 1), [despues]: c[despues] + 1 }));
  }
}
