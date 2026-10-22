import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { DEFAULT_SESSION_NAME, QueueService } from './queue';
import { SessionsApiService } from './sessions-api';
import { DjSession, QueueItem } from '../models/autodj';

const sesion = (id: number): DjSession => ({ id, name: 'x', startedAt: 'x', endedAt: null, active: true });
const elemento = (id: number, trackId: number, sessionId = 5): QueueItem => ({ id, sessionId, trackId, addedAt: 'x' });
const falla = (status: number, mensaje: string) =>
  throwError(() => new HttpErrorResponse({ status, statusText: 'x', error: { error: mensaje } }));

describe('QueueService', () => {
  let service: QueueService;
  let api: {
    active: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    queue: ReturnType<typeof vi.fn>;
    enqueue: ReturnType<typeof vi.fn>;
    removeFromQueue: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      active: vi.fn(() => of(sesion(5))),
      start: vi.fn(() => of(sesion(9))),
      queue: vi.fn(() => of([elemento(1, 10), elemento(2, 20)])),
      enqueue: vi.fn(() => of(elemento(3, 30))),
      removeFromQueue: vi.fn(() => of(undefined)),
    };
    TestBed.configureTestingModule({ providers: [{ provide: SessionsApiService, useValue: api }] });
    service = TestBed.inject(QueueService);
  });

  describe('refresh', () => {
    it('carga la cola de la sesion abierta', async () => {
      await service.refresh();

      expect(service.sessionId()).toBe(5);
      expect(service.items().map((i) => i.trackId)).toEqual([10, 20]);
      expect(api.queue).toHaveBeenCalledWith(5);
      expect(service.loading()).toBe(false);
      expect(service.error()).toBeNull();
    });

    it('sin sesion abierta la cola esta vacia y no se consulta', async () => {
      api.active.mockReturnValue(of(null));

      await service.refresh();

      expect(service.sessionId()).toBeNull();
      expect(service.items()).toEqual([]);
      expect(api.queue).not.toHaveBeenCalled();
    });

    it('si falla muestra el error del API', async () => {
      api.active.mockReturnValue(falla(500, 'Error interno del servidor'));

      await service.refresh();

      expect(service.error()).toBe('Error interno del servidor');
      expect(service.loading()).toBe(false);
    });

    it('un refresco correcto limpia un error anterior', async () => {
      api.active.mockReturnValueOnce(falla(500, 'x'));
      await service.refresh();

      await service.refresh();

      expect(service.error()).toBeNull();
    });
  });

  describe('enqueue', () => {
    it('agrega la pista a la sesion abierta y actualiza la cola', async () => {
      api.queue.mockReturnValue(of([elemento(1, 10), elemento(3, 30)]));

      const ok = await service.enqueue(30);

      expect(ok).toBe(true);
      expect(api.enqueue).toHaveBeenCalledWith(5, 30);
      expect(service.items().map((i) => i.trackId)).toEqual([10, 30]);
      expect(api.start).not.toHaveBeenCalled();
    });

    it('si no hay sesion abierta abre una antes de encolar', async () => {
      api.active.mockReturnValue(of(null));

      await service.enqueue(30);

      expect(api.start).toHaveBeenCalledWith(DEFAULT_SESSION_NAME);
      expect(api.enqueue).toHaveBeenCalledWith(9, 30);
      expect(service.sessionId()).toBe(9);
    });

    it('si la sesion conocida se cerro y se abre otra, descarta la cola vieja', async () => {
      await service.refresh(); // conoce la sesion 5 con 2 elementos
      api.active.mockReturnValue(of(null));
      api.queue.mockReturnValue(of([]));

      await service.enqueue(30);

      expect(service.sessionId()).toBe(9);
      expect(service.items()).toEqual([]);
    });

    it('si el API rechaza la pista devuelve false y muestra su mensaje', async () => {
      api.enqueue.mockReturnValue(falla(404, 'Pista no encontrada'));

      const ok = await service.enqueue(999);

      expect(ok).toBe(false);
      expect(service.error()).toBe('Pista no encontrada');
    });

    it('si la cola esta llena muestra el mensaje del API', async () => {
      api.enqueue.mockReturnValue(falla(409, 'La cola de la sesion 5 esta llena (maximo 100).'));

      await service.enqueue(30);

      expect(service.error()).toContain('esta llena');
    });

    it('si falla abrir la sesion no intenta encolar', async () => {
      api.active.mockReturnValue(of(null));
      api.start.mockReturnValue(falla(500, 'Error interno del servidor'));

      const ok = await service.enqueue(30);

      expect(ok).toBe(false);
      expect(api.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    beforeEach(async () => service.refresh());

    it('quita el elemento de la cola local sin volver a pedirla', async () => {
      const ok = await service.remove(1);

      expect(ok).toBe(true);
      expect(api.removeFromQueue).toHaveBeenCalledWith(5, 1);
      expect(service.items().map((i) => i.id)).toEqual([2]);
    });

    it('si el API falla deja la cola como estaba y muestra el error', async () => {
      api.removeFromQueue.mockReturnValue(falla(404, 'No existe el elemento 1.'));

      const ok = await service.remove(1);

      expect(ok).toBe(false);
      expect(service.items().length).toBe(2);
      expect(service.error()).toBe('No existe el elemento 1.');
    });

    it('sin sesion conocida no hace nada', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [{ provide: SessionsApiService, useValue: api }] });
      const nuevo = TestBed.inject(QueueService);

      expect(await nuevo.remove(1)).toBe(false);
      expect(api.removeFromQueue).not.toHaveBeenCalled();
    });
  });
});
