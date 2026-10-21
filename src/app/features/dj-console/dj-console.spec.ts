import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DjConsoleComponent } from './dj-console';
import { MixerService } from '../../core/services/mixer';
import { FakeAudioContext, provideFakeAudio } from '../../core/testing/fake-audio';

describe('DjConsoleComponent', () => {
  let fixture: ComponentFixture<DjConsoleComponent>;
  let ctx: FakeAudioContext | null;
  let mixer: MixerService;

  const el = () => fixture.nativeElement as HTMLElement;
  const slider = (etiqueta: string) => el().querySelector(`input[aria-label="${etiqueta}"]`) as HTMLInputElement;

  // jsdom no implementa canvas: se evita el aviso en consola.
  beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null));
  afterEach(() => vi.restoreAllMocks());

  function crear(contexto: FakeAudioContext | null) {
    ctx = contexto;
    TestBed.configureTestingModule({
      imports: [DjConsoleComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideFakeAudio(contexto)],
    });
    mixer = TestBed.inject(MixerService);
    fixture = TestBed.createComponent(DjConsoleComponent);
    fixture.detectChanges();
  }

  const mover = (input: HTMLInputElement, valor: number) => {
    input.value = String(valor);
    input.dispatchEvent(new Event('input'));
  };

  describe('sin Web Audio', () => {
    it('avisa que el navegador no lo soporta y no muestra los decks', () => {
      crear(null);

      expect(el().querySelector('[role="alert"]')?.textContent).toContain('no soporta Web Audio');
      expect(el().querySelectorAll('app-deck').length).toBe(0);
    });
  });

  describe('con Web Audio', () => {
    beforeEach(() => crear(new FakeAudioContext()));

    it('muestra el deck A, el mezclador y el deck B', () => {
      const decks = el().querySelectorAll('app-deck');

      expect(decks.length).toBe(2);
      expect(el().textContent).toContain('Deck A');
      expect(el().textContent).toContain('Deck B');
      expect(el().textContent).toContain('Mezclador');
      expect(el().querySelector('[role="alert"]')).toBeNull();
    });

    it('el crossfader empieza en el centro', () => {
      expect(slider('Crossfader').value).toBe('0.5');
    });

    it('mover el crossfader cambia el mezclador', () => {
      mover(slider('Crossfader'), 0.9);

      expect(mixer.crossfader()).toBeCloseTo(0.9);
    });

    it('Centrar devuelve el crossfader al medio', () => {
      mixer.setCrossfader(1);
      fixture.detectChanges();

      (Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.includes('Centrar')) as HTMLButtonElement).click();

      expect(mixer.crossfader()).toBe(0.5);
    });

    it('mover el volumen maestro cambia el mezclador', () => {
      mover(slider('Volumen maestro'), 0.25);

      expect(mixer.masterVolume()).toBeCloseTo(0.25);
    });

    it('el contexto de audio recibe el cambio del crossfader', () => {
      mover(slider('Crossfader'), 0);

      // gains del contexto: [maestro, volA, crossA, volB, crossB]
      expect(ctx!.gains[2].gain.value).toBe(1);
      expect(ctx!.gains[4].gain.value).toBeCloseTo(0);
    });
  });
});
