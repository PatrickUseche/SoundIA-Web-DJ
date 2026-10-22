import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { AutoDjPanelComponent } from './autodj-panel';
import { AutoDjService, AutoDjStatus, PreparedNext } from '../../core/services/autodj';
import { QueueService } from '../../core/services/queue';
import { TrackApiService } from '../../core/services/tracks';
import { TransitionRunnerService } from '../../core/services/transition-runner';
import { QueueItem, TransitionPlan, WeightsInfo } from '../../core/models/autodj';
import { Track } from '../../core/models/track';

const pista = (id: number, title = `pista ${id}`): Track => ({
  id, title, duration: 200, bpm: 126.5, key: 'A minor', camelot: '8A', energy: 0.6,
  cuePoints: [0], hasAudio: true, createdAt: 'x',
});

const plan = (cambios: Partial<TransitionPlan> = {}): TransitionPlan => ({
  fromTrackId: 1, toTrackId: 2, style: 'blend', bars: 16, seconds: 30, mixOutAt: 100, mixInAt: 0,
  tempoMatch: { ratio: 1, multiplier: 1, feasible: true },
  compatibility: { score: 0.934, tempo: 1, harmonic: 1, energy: 1, tempoMatch: { ratio: 1, multiplier: 1, feasible: true } },
  automation: [], ...cambios,
});

const elemento = (id: number, trackId: number): QueueItem => ({ id, sessionId: 5, trackId, addedAt: 'x' });

describe('AutoDjPanelComponent', () => {
  let fixture: ComponentFixture<AutoDjPanelComponent>;

  // Dobles de los servicios: su logica ya se prueba en sus propios specs.
  const autodj = {
    enabled: signal(false),
    status: signal<AutoDjStatus>('off'),
    next: signal<PreparedNext | null>(null),
    message: signal<string | null>(null),
    lastTransition: signal<{ from: Track; to: Track } | null>(null),
    rating: signal<'liked' | 'disliked' | null>(null),
    feedbackError: signal<string | null>(null),
    weights: signal<WeightsInfo | null>(null),
    rate: vi.fn(async (liked: boolean) => { autodj.rating.set(liked ? 'liked' : 'disliked'); }),
    loadWeights: vi.fn(async () => undefined),
    start: vi.fn(async () => { autodj.enabled.set(true); autodj.status.set('esperando'); }),
    stop: vi.fn(() => { autodj.enabled.set(false); autodj.status.set('off'); }),
  };
  const queue = {
    items: signal<QueueItem[]>([]),
    error: signal<string | null>(null),
    loading: signal(false),
    refresh: vi.fn(async () => undefined),
    remove: vi.fn(async () => true),
  };
  const runner = { progress: signal(0) };
  const tracks = { list: vi.fn(() => of([pista(10, 'Tema diez'), pista(20, 'Tema veinte')])) };

  const el = () => fixture.nativeElement as HTMLElement;
  const texto = () => el().textContent ?? '';
  const boton = (contiene: string) =>
    Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.includes(contiene)) as HTMLButtonElement;

  async function crear() {
    TestBed.configureTestingModule({
      imports: [AutoDjPanelComponent],
      providers: [
        { provide: AutoDjService, useValue: autodj },
        { provide: QueueService, useValue: queue },
        { provide: TransitionRunnerService, useValue: runner },
        { provide: TrackApiService, useValue: tracks },
      ],
    });
    fixture = TestBed.createComponent(AutoDjPanelComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    autodj.enabled.set(false);
    autodj.status.set('off');
    autodj.next.set(null);
    autodj.message.set(null);
    autodj.lastTransition.set(null);
    autodj.rating.set(null);
    autodj.feedbackError.set(null);
    autodj.weights.set(null);
    autodj.rate.mockClear();
    autodj.loadWeights.mockClear();
    queue.items.set([]);
    queue.error.set(null);
    queue.loading.set(false);
    runner.progress.set(0);
    autodj.start.mockClear();
    autodj.stop.mockClear();
    queue.refresh.mockClear();
    queue.remove.mockClear();
    tracks.list.mockReturnValue(of([pista(10, 'Tema diez'), pista(20, 'Tema veinte')]));
  });

  describe('encender y apagar', () => {
    it('empieza apagado con el boton para activarlo', async () => {
      await crear();

      expect(boton('Activar Auto-DJ')).toBeDefined();
      expect(el().querySelector('.estado')?.textContent).toContain('Apagado');
    });

    it('al activarlo llama al servicio y pasa a mostrar el boton de desactivar', async () => {
      await crear();

      boton('Activar Auto-DJ').click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(autodj.start).toHaveBeenCalled();
      expect(boton('Desactivar Auto-DJ')).toBeDefined();
      expect(el().querySelector('.estado')?.textContent).toContain('esperando el punto de salida');
    });

    it('al desactivarlo llama a stop', async () => {
      autodj.enabled.set(true);
      autodj.status.set('esperando');
      await crear();

      boton('Desactivar Auto-DJ').click();
      fixture.detectChanges();

      expect(autodj.stop).toHaveBeenCalled();
      expect(boton('Activar Auto-DJ')).toBeDefined();
    });

    it('el boton indica su estado con aria-pressed', async () => {
      autodj.enabled.set(true);
      autodj.status.set('esperando');
      await crear();

      expect(boton('Desactivar').getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('estado', () => {
    it('describe cada estado', async () => {
      await crear();
      const esperado: [AutoDjStatus, string][] = [
        ['preparando', 'Preparando la siguiente pista'],
        ['mezclando', 'Mezclando'],
        ['error', 'Hay un problema'],
      ];
      for (const [estado, fragmento] of esperado) {
        autodj.status.set(estado);
        fixture.detectChanges();
        expect(el().querySelector('.estado')?.textContent).toContain(fragmento);
      }
    });

    it('mientras mezcla muestra el avance de la transicion', async () => {
      autodj.status.set('mezclando');
      runner.progress.set(0.42);
      await crear();

      const barra = el().querySelector('progress') as HTMLProgressElement;
      expect(barra.value).toBe(42);
      expect(barra.getAttribute('aria-label')).toBe('Avance de la transicion');
    });

    it('fuera de una mezcla no muestra la barra de avance', async () => {
      autodj.status.set('esperando');
      await crear();

      expect(el().querySelector('progress')).toBeNull();
    });

    it('muestra los avisos como alerta', async () => {
      autodj.message.set('Pon a sonar una pista en un deck para activar el Auto-DJ.');
      await crear();

      expect(el().querySelector('.aviso')?.getAttribute('role')).toBe('alert');
      expect(el().querySelector('.aviso')?.textContent).toContain('Pon a sonar una pista');
    });
  });

  describe('siguiente pista', () => {
    it('sin pista preparada no muestra la seccion', async () => {
      await crear();

      expect(el().querySelector('.siguiente')).toBeNull();
    });

    it('resume la pista preparada, el deck, el estilo y la compatibilidad', async () => {
      autodj.next.set({ track: pista(2, 'Tema dos'), plan: plan(), deck: 'B' });
      await crear();

      const siguiente = el().querySelector('.siguiente')?.textContent ?? '';
      expect(siguiente).toContain('Tema dos');
      expect(siguiente).toContain('deck B');
      expect(siguiente).toContain('126.5 BPM');
      expect(siguiente).toContain('8A');
      expect(siguiente).toContain('mezcla de 16 compases');
      expect(siguiente).toContain('compatibilidad 93%');
    });

    it('un fundido sin igualar el tempo se describe como tal', async () => {
      autodj.next.set({ track: pista(2), plan: plan({ style: 'fade', bars: 2 }), deck: 'A' });
      await crear();

      expect(el().querySelector('.siguiente')?.textContent).toContain('fundido de 2 compases');
    });

    it('un corte directo se describe como tal', async () => {
      autodj.next.set({ track: pista(2), plan: plan({ style: 'cut', bars: 0 }), deck: 'A' });
      await crear();

      expect(el().querySelector('.siguiente')?.textContent).toContain('corte directo');
    });
  });

  describe('valorar la ultima mezcla', () => {
    const transicion = () => ({ from: pista(1, 'Tema uno'), to: pista(2, 'Tema dos') });

    it('sin transicion no muestra la seccion', async () => {
      await crear();

      expect(el().querySelector('.valoracion')).toBeNull();
    });

    it('tras una transicion nombra las dos pistas y pregunta si gusto', async () => {
      autodj.lastTransition.set(transicion());
      await crear();

      const seccion = el().querySelector('.valoracion')?.textContent ?? '';
      expect(seccion).toContain('Tema uno');
      expect(seccion).toContain('Tema dos');
      expect(seccion).toContain('Te gusto la mezcla');
    });

    it('Me gusto envia una valoracion positiva', async () => {
      autodj.lastTransition.set(transicion());
      await crear();

      (el().querySelector('.me-gusto') as HTMLButtonElement).click();

      expect(autodj.rate).toHaveBeenCalledWith(true);
    });

    it('No me gusto envia una valoracion negativa', async () => {
      autodj.lastTransition.set(transicion());
      await crear();

      (el().querySelector('.no-me-gusto') as HTMLButtonElement).click();

      expect(autodj.rate).toHaveBeenCalledWith(false);
    });

    it('una vez valorada agradece y quita los botones', async () => {
      autodj.lastTransition.set(transicion());
      await crear();

      (el().querySelector('.me-gusto') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(el().querySelector('.gracias')?.textContent).toContain('tendra en cuenta que te gusto');
      expect(el().querySelector('.me-gusto')).toBeNull();
      expect(el().querySelector('.no-me-gusto')).toBeNull();
    });

    it('si no gusto el agradecimiento lo refleja', async () => {
      autodj.lastTransition.set(transicion());
      autodj.rating.set('disliked');
      await crear();

      expect(el().querySelector('.gracias')?.textContent).toContain('evitara mezclas parecidas');
    });

    it('muestra el error al valorar como alerta y mantiene los botones para reintentar', async () => {
      autodj.lastTransition.set(transicion());
      autodj.feedbackError.set('El motor de IA no esta disponible');
      await crear();

      expect(el().querySelector('.valoracion-error')?.getAttribute('role')).toBe('alert');
      expect(el().querySelector('.valoracion-error')?.textContent).toContain('El motor de IA no esta disponible');
      expect(el().querySelector('.me-gusto')).not.toBeNull();
    });
  });

  describe('lo que la IA ha aprendido', () => {
    it('al iniciar consulta los pesos del motor', async () => {
      await crear();

      expect(autodj.loadWeights).toHaveBeenCalled();
    });

    it('sin conocer los pesos no muestra la seccion', async () => {
      await crear();

      expect(el().querySelector('.aprendido')).toBeNull();
    });

    it('con los pesos por defecto lo explica y cuenta cuantas valoraciones lleva', async () => {
      autodj.weights.set({ weights: { tempo: 0.45, harmonic: 0.4, energy: 0.15 }, learned: false, samples: 3 });
      await crear();

      const seccion = el().querySelector('.aprendido')?.textContent ?? '';
      expect(seccion).toContain('Todavia usa los pesos por defecto');
      expect(seccion).toContain('tempo 45%');
      expect(seccion).toContain('armonia 40%');
      expect(seccion).toContain('energia 15%');
      expect(seccion).toContain('llevas 3');
    });

    it('con pesos aprendidos muestra los porcentajes y el numero de valoraciones', async () => {
      autodj.weights.set({ weights: { tempo: 0.2, harmonic: 0.62, energy: 0.18 }, learned: true, samples: 42 });
      await crear();

      const seccion = el().querySelector('.aprendido')?.textContent ?? '';
      expect(seccion).toContain('Segun tus 42 valoraciones');
      expect(seccion).toContain('tempo 20%');
      expect(seccion).toContain('armonia 62%');
      expect(seccion).toContain('energia 18%');
      expect(seccion).not.toContain('Todavia usa los pesos por defecto');
    });

    it('se actualiza cuando llegan pesos nuevos tras valorar', async () => {
      autodj.weights.set({ weights: { tempo: 0.45, harmonic: 0.4, energy: 0.15 }, learned: false, samples: 9 });
      await crear();

      autodj.weights.set({ weights: { tempo: 0.3, harmonic: 0.55, energy: 0.15 }, learned: true, samples: 10 });
      fixture.detectChanges();

      expect(el().querySelector('.aprendido')?.textContent).toContain('armonia 55%');
    });
  });

  describe('cola', () => {
    it('refresca la cola al iniciar', async () => {
      await crear();

      expect(queue.refresh).toHaveBeenCalled();
    });

    it('vuelve a refrescarla cuando el Auto-DJ prepara otra pista', async () => {
      await crear();
      queue.refresh.mockClear();

      autodj.next.set({ track: pista(2), plan: plan(), deck: 'B' });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(queue.refresh).toHaveBeenCalled();
    });

    it('con la cola vacia explica que la IA elegira las pistas', async () => {
      await crear();

      expect(el().querySelector('.cola-vacia')?.textContent).toContain('el Auto-DJ elegira');
    });

    it('lista las pistas de la cola con su titulo', async () => {
      queue.items.set([elemento(1, 10), elemento(2, 20)]);
      await crear();

      const items = Array.from(el().querySelectorAll('ol.cola li'));
      expect(items.length).toBe(2);
      expect(items[0].textContent).toContain('Tema diez');
      expect(items[1].textContent).toContain('Tema veinte');
    });

    it('si no se conoce el titulo muestra el numero de pista', async () => {
      queue.items.set([elemento(1, 999)]);
      await crear();

      expect(el().querySelector('ol.cola li')?.textContent).toContain('Pista #999');
    });

    it('si falla la carga de titulos la cola igual se muestra', async () => {
      tracks.list.mockReturnValue(throwError(() => new Error('sin red')));
      queue.items.set([elemento(1, 10)]);
      await crear();

      expect(el().querySelector('ol.cola li')?.textContent).toContain('Pista #10');
    });

    it('Quitar elimina ese elemento de la cola', async () => {
      queue.items.set([elemento(1, 10), elemento(2, 20)]);
      await crear();

      (el().querySelectorAll('ol.cola li button')[1] as HTMLButtonElement).click();

      expect(queue.remove).toHaveBeenCalledWith(2);
    });

    it('cada boton Quitar tiene una etiqueta accesible con el titulo', async () => {
      queue.items.set([elemento(1, 10)]);
      await crear();

      expect(el().querySelector('ol.cola li button')?.getAttribute('aria-label')).toBe('Quitar Tema diez de la cola');
    });

    it('muestra el error de la cola como alerta', async () => {
      queue.error.set('No se pudo cargar la cola.');
      await crear();

      expect(el().querySelector('.cola-error')?.textContent).toContain('No se pudo cargar la cola.');
    });

    it('Actualizar cola vuelve a pedirla y se deshabilita mientras carga', async () => {
      await crear();
      queue.refresh.mockClear();

      boton('Actualizar cola').click();
      expect(queue.refresh).toHaveBeenCalled();

      queue.loading.set(true);
      fixture.detectChanges();
      expect(boton('Actualizar cola').disabled).toBe(true);
    });
  });

  it('cuando hay cola no muestra el texto de cola vacia', async () => {
    queue.items.set([elemento(1, 10)]);
    await crear();

    expect(texto()).not.toContain('La cola esta vacia');
  });
});
