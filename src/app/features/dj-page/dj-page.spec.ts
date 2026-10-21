import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DjPageComponent } from './dj-page';
import { FakeAudioContext, provideFakeAudio } from '../../core/testing/fake-audio';

describe('DjPageComponent', () => {
  beforeEach(() => {
    // jsdom no implementa canvas: se evita el aviso en consola.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => vi.restoreAllMocks());

  function crear(ctx: FakeAudioContext | null = new FakeAudioContext()) {
    TestBed.configureTestingModule({
      imports: [DjPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideFakeAudio(ctx)],
    });
    const fixture = TestBed.createComponent(DjPageComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
  }

  it('reune la consola con los dos decks, el Auto-DJ y la biblioteca', () => {
    const { el } = crear();

    expect(el.querySelector('h2')?.textContent).toContain('SoundIA DJ');
    expect(el.querySelector('app-dj-console')).not.toBeNull();
    expect(el.querySelectorAll('app-deck').length).toBe(2);
    expect(el.querySelector('app-autodj-panel')).not.toBeNull();
    expect(el.querySelector('app-library')).not.toBeNull();
  });

  it('al abrirse pide la biblioteca, los titulos de la cola y la cola de la sesion', () => {
    const { http } = crear();

    // La biblioteca y el panel del Auto-DJ piden la lista de pistas; la cola pregunta por la sesion activa.
    expect(http.match((req) => req.url.endsWith('/tracks')).length).toBe(2);
    expect(http.match((req) => req.url.endsWith('/sessions/active')).length).toBeGreaterThanOrEqual(1);
  });

  it('sin Web Audio muestra el aviso pero conserva la biblioteca', () => {
    const { el } = crear(null);

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('no soporta Web Audio');
    expect(el.querySelectorAll('app-deck').length).toBe(0);
    expect(el.querySelector('app-library')).not.toBeNull();
  });
});
