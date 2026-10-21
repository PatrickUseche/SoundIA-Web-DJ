import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { httpErrorMessage } from '../http-error-message';
import { QueueItem } from '../models/autodj';
import { SessionsApiService } from './sessions-api';

/** Nombre de la sesion que se abre sola cuando se encola una pista y no hay ninguna abierta. */
export const DEFAULT_SESSION_NAME = 'Sesion DJ';

/** Cola de reproduccion de la sesion abierta: ver, agregar y quitar pistas. */
@Injectable({ providedIn: 'root' })
export class QueueService {
  private readonly sessions = inject(SessionsApiService);

  readonly sessionId = signal<number | null>(null);
  readonly items = signal<QueueItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** Recarga la cola de la sesion abierta; sin sesion abierta la cola esta vacia. */
  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const session = await firstValueFrom(this.sessions.active());
      this.sessionId.set(session?.id ?? null);
      this.items.set(session ? await firstValueFrom(this.sessions.queue(session.id)) : []);
    } catch (error) {
      this.error.set(httpErrorMessage(error, 'No se pudo cargar la cola.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Agrega una pista al final de la cola, abriendo una sesion si no habia ninguna. */
  async enqueue(trackId: number): Promise<boolean> {
    this.error.set(null);
    try {
      const sessionId = await this.ensureSession();
      await firstValueFrom(this.sessions.enqueue(sessionId, trackId));
      this.items.set(await firstValueFrom(this.sessions.queue(sessionId)));
      return true;
    } catch (error) {
      this.error.set(httpErrorMessage(error, 'No se pudo agregar la pista a la cola.'));
      return false;
    }
  }

  /** Quita un elemento de la cola. */
  async remove(itemId: number): Promise<boolean> {
    const sessionId = this.sessionId();
    if (sessionId === null) {
      return false;
    }
    this.error.set(null);
    try {
      await firstValueFrom(this.sessions.removeFromQueue(sessionId, itemId));
      this.items.update((items) => items.filter((item) => item.id !== itemId));
      return true;
    } catch (error) {
      this.error.set(httpErrorMessage(error, 'No se pudo quitar la pista de la cola.'));
      return false;
    }
  }

  private async ensureSession(): Promise<number> {
    const known = this.sessionId();
    const active = await firstValueFrom(this.sessions.active());
    if (active) {
      this.sessionId.set(active.id);
      return active.id;
    }
    // La sesion que se conocia se cerro (o nunca hubo): se abre una nueva.
    const started = await firstValueFrom(this.sessions.start(DEFAULT_SESSION_NAME));
    this.sessionId.set(started.id);
    if (known !== null && known !== started.id) {
      this.items.set([]);
    }
    return started.id;
  }
}
