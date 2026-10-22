import { Component, inject } from '@angular/core';
import { MidiService } from '../../core/services/midi';
import { MidiBridgeService } from '../../core/services/midi-bridge';

/** Panel para conectar un controlador MIDI y decidir si sus movimientos se envian al API. */
@Component({
  selector: 'app-midi-panel',
  templateUrl: './midi-panel.html',
})
export class MidiPanelComponent {
  protected readonly midi = inject(MidiService);
  protected readonly bridge = inject(MidiBridgeService);

  conectar(): void {
    void this.midi.requestAccess();
  }

  alElegirControlador(evento: Event): void {
    const id = (evento.target as HTMLSelectElement).value;
    this.midi.selectInput(id === '' ? null : id);
  }

  alternarEnvio(): void {
    if (this.bridge.active()) {
      this.bridge.stop();
    } else {
      this.bridge.start();
    }
  }
}
