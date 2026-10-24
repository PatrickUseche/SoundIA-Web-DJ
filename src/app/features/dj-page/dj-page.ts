import { Component } from '@angular/core';
import { AutoDjPanelComponent } from '../autodj-panel/autodj-panel';
import { DjConsoleComponent } from '../dj-console/dj-console';
import { LearningPanelComponent } from '../learning-panel/learning-panel';
import { LibraryComponent } from '../library/library';
import { MidiMappingComponent } from '../midi-mapping/midi-mapping';
import { MidiPanelComponent } from '../midi-panel/midi-panel';

/**
 * Pantalla principal de DJ: la consola con los dos decks, el Auto-DJ, la biblioteca y el modo aprendizaje. El
 * controlador MIDI y la asignacion de sus controles (largos y de uso ocasional) van en un bloque plegable.
 */
@Component({
  selector: 'app-dj-page',
  imports: [
    DjConsoleComponent, AutoDjPanelComponent, LearningPanelComponent, LibraryComponent, MidiPanelComponent,
    MidiMappingComponent,
  ],
  template: `
    <div>
      <h2>SoundIA DJ</h2>
      <app-dj-console />
      <app-autodj-panel />
      <app-library />
      <app-learning-panel />
      <details class="plegable">
        <summary>Controlador MIDI</summary>
        <app-midi-panel />
        <app-midi-mapping />
      </details>
    </div>
  `,
})
export class DjPageComponent {}
