import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LearningPanelComponent } from './learning-panel';
import { MixRecorderService } from '../../core/services/mix-recorder';

describe('LearningPanelComponent', () => {
  let fixture: ComponentFixture<LearningPanelComponent>;

  const recorder = {
    supported: true,
    enabled: signal(false),
    recording: signal(false),
    saved: signal(0),
    pendingCount: signal(0),
    message: signal<{ text: string; error: boolean } | null>(null),
    setEnabled: vi.fn((v: boolean) => recorder.enabled.set(v)),
  };

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const casilla = () => (fixture.nativeElement as HTMLElement).querySelector('input[type=checkbox]') as HTMLInputElement;

  beforeEach(async () => {
    recorder.supported = true;
    recorder.enabled.set(false);
    recorder.recording.set(false);
    recorder.saved.set(0);
    recorder.message.set(null);
    recorder.setEnabled.mockClear();
    await TestBed.configureTestingModule({
      imports: [LearningPanelComponent],
      providers: [{ provide: MixRecorderService, useValue: recorder }],
    }).compileComponents();
    fixture = TestBed.createComponent(LearningPanelComponent);
    fixture.detectChanges();
  });

  it('viene apagado y lo dice', () => {
    expect(casilla().checked).toBe(false);
    expect(texto()).toContain('Apagado: no se graba nada.');
  });

  it('marcar la casilla enciende el grabador', () => {
    casilla().click();
    fixture.detectChanges();

    expect(recorder.setEnabled).toHaveBeenCalledWith(true);
    expect(casilla().checked).toBe(true);
    expect(texto()).toContain('Esperando una mezcla');
  });

  it('avisa cuando hay una mezcla en curso', () => {
    recorder.enabled.set(true);
    recorder.recording.set(true);
    fixture.detectChanges();

    expect(texto()).toContain('Mezcla en curso');
  });

  it('muestra el contador y el ultimo mensaje, y un error como alerta', () => {
    recorder.enabled.set(true);
    recorder.saved.set(3);
    recorder.message.set({ text: 'No se pudo guardar la mezcla.', error: true });
    fixture.detectChanges();

    expect(texto()).toContain('Mezclas grabadas en esta sesión: 3');
    const alerta = (fixture.nativeElement as HTMLElement).querySelector('[role=alert]');
    expect(alerta?.textContent).toContain('No se pudo guardar la mezcla.');
  });

  it('sin soporte de audio deshabilita la casilla y explica por que', () => {
    recorder.supported = false;
    fixture = TestBed.createComponent(LearningPanelComponent);
    fixture.detectChanges();

    expect(casilla().disabled).toBe(true);
    expect(texto()).toContain('no puede reproducir audio');
  });
});
