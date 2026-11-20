import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChannelStripComponent } from './channel-strip';
import { DeckId } from '../../core/audio/deck';
import { MixerService } from '../../core/services/mixer';
import { FakeAudioContext, provideFakeAudio } from '../../core/testing/fake-audio';

describe('ChannelStripComponent', () => {
  let fixture: ComponentFixture<ChannelStripComponent>;
  let ctx: FakeAudioContext;
  let mixer: MixerService;

  const el = () => fixture.nativeElement as HTMLElement;
  const slider = (etiqueta: string) => el().querySelector(`input[aria-label="${etiqueta}"]`) as HTMLInputElement;
  const medidor = () => el().querySelector('[role="meter"]') as HTMLElement;
  const mover = (input: HTMLInputElement, valor: number) => {
    input.value = String(valor);
    input.dispatchEvent(new Event('input'));
  };

  function crear(id: DeckId = 'A') {
    TestBed.configureTestingModule({
      imports: [ChannelStripComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideFakeAudio(ctx)],
    });
    mixer = TestBed.inject(MixerService);
    fixture = TestBed.createComponent(ChannelStripComponent);
    fixture.componentRef.setInput('deckId', id);
    fixture.detectChanges();
  }

  beforeEach(() => {
    ctx = new FakeAudioContext();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('estructura', () => {
    it('es la seccion del canal del deck, con su nombre y su color', () => {
      crear('B');

      const seccion = el().querySelector('section')!;
      expect(seccion.getAttribute('aria-label')).toBe('Canal B');
      expect(seccion.getAttribute('data-deck')).toBe('B');
      expect(el().querySelector('h3')?.textContent).toContain('CH B');
    });

    it('lleva las tres perillas del EQ de arriba abajo (agudos, medios, graves), como una mezcladora', () => {
      crear();

      const nombres = Array.from(el().querySelectorAll('app-knob input')).map((i) => i.getAttribute('aria-label'));

      expect(nombres).toEqual(['Agudos', 'Medios', 'Graves']);
    });

    it('lleva el medidor del canal y el fader de volumen', () => {
      crear('A');

      expect(medidor().getAttribute('aria-label')).toBe('Nivel del canal A');
      expect(slider('Volumen del deck')).not.toBeNull();
    });
  });

  describe('controles', () => {
    beforeEach(() => crear('A'));

    it('cada perilla del EQ mueve solo su banda del deck', () => {
      mover(slider('Graves'), 0);

      expect(mixer.deck('A').eq()).toEqual({ low: 0, mid: 0.5, high: 0.5 });

      mover(slider('Agudos'), 1);

      expect(mixer.deck('A').eq()).toEqual({ low: 0, mid: 0.5, high: 1 });
    });

    it('el fader cambia el volumen del deck', () => {
      mover(slider('Volumen del deck'), 0.4);

      expect(mixer.deck('A').volume()).toBeCloseTo(0.4);
    });

    it('las perillas y el fader reflejan el estado del deck', () => {
      mixer.deck('A').setEq('mid', 0.2);
      mixer.deck('A').setVolume(0.7);
      fixture.detectChanges();

      expect(slider('Medios').value).toBe('0.2');
      expect(slider('Volumen del deck').value).toBe('0.7');
    });

    it('el canal B controla el deck B y no el A', () => {
      TestBed.resetTestingModule();
      crear('B');

      mover(slider('Medios'), 0.9);

      expect(mixer.deck('B').eq().mid).toBe(0.9);
      expect(mixer.deck('A').eq().mid).toBe(0.5);
    });
  });

  describe('medidor de nivel', () => {
    // El analizador 0 es el del maestro; los de los decks A y B son el 1 y el 2.
    const analizador = (id: DeckId) => ctx.analysers[id === 'A' ? 1 : 2];

    it('arranca apagado', () => {
      crear();

      expect(medidor().getAttribute('aria-valuenow')).toBe('0');
    });

    it('sigue al nivel del canal mientras suena', () => {
      crear('A');

      analizador('A').peak = 1;
      vi.advanceTimersByTime(100);
      fixture.detectChanges();

      expect(medidor().getAttribute('aria-valuenow')).toBe('100');
    });

    it('al callarse baja poco a poco hasta apagarse', () => {
      crear('A');
      analizador('A').peak = 1;
      vi.advanceTimersByTime(100);
      analizador('A').peak = 0;

      vi.advanceTimersByTime(50);
      fixture.detectChanges();
      const alPrincipio = Number(medidor().getAttribute('aria-valuenow'));
      vi.advanceTimersByTime(3000);
      fixture.detectChanges();

      expect(alPrincipio).toBeGreaterThan(0);
      expect(alPrincipio).toBeLessThan(100);
      expect(medidor().getAttribute('aria-valuenow')).toBe('0');
    });

    it('el canal B mide el deck B', () => {
      crear('B');

      analizador('A').peak = 1;
      vi.advanceTimersByTime(100);
      fixture.detectChanges();
      expect(medidor().getAttribute('aria-valuenow')).toBe('0');

      analizador('B').peak = 1;
      vi.advanceTimersByTime(100);
      fixture.detectChanges();
      expect(medidor().getAttribute('aria-valuenow')).toBe('100');
    });

    it('deja de medir al destruirse el canal (no deja temporizadores)', () => {
      crear('A');

      fixture.destroy();

      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
