import { Component, inject } from '@angular/core';
import { MixRecorderService } from '../../core/services/mix-recorder';

/** Interruptor del modo aprendizaje: graba las mezclas que hace el DJ a mano para que el sistema aprenda su estilo. */
@Component({
  selector: 'app-learning-panel',
  templateUrl: './learning-panel.html',
})
export class LearningPanelComponent {
  protected readonly recorder = inject(MixRecorderService);

  protected alCambiar(evento: Event): void {
    this.recorder.setEnabled((evento.target as HTMLInputElement).checked);
  }

  protected textoEstado(): string {
    if (!this.recorder.supported) {
      return 'Este navegador no puede reproducir audio, así que no hay mezclas que grabar.';
    }
    if (!this.recorder.enabled()) {
      return 'Apagado: no se graba nada.';
    }
    return this.recorder.recording()
      ? 'Mezcla en curso: se está grabando.'
      : 'Esperando una mezcla: pon una pista, deja que suene sola y mezcla la siguiente.';
  }
}
