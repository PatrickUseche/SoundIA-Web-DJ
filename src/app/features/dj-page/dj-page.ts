import { Component } from '@angular/core';
import { AutoDjPanelComponent } from '../autodj-panel/autodj-panel';
import { DjConsoleComponent } from '../dj-console/dj-console';
import { LearningPanelComponent } from '../learning-panel/learning-panel';
import { LibraryComponent } from '../library/library';
import { MidiMappingComponent } from '../midi-mapping/midi-mapping';
import { MidiPanelComponent } from '../midi-panel/midi-panel';
import { QuickGuideComponent } from '../quick-guide/quick-guide';

/**
 * Pantalla principal de DJ: una guia rapida, la consola con los dos decks, el modo aprendizaje (lo principal para quien
 * le ensena su estilo a la IA, por eso va justo debajo de los decks), la biblioteca y el Auto-DJ. El
 * controlador MIDI y la asignacion de sus controles (largos y de uso ocasional) van en un bloque plegable.
 */
@Component({
  selector: 'app-dj-page',
  imports: [
    DjConsoleComponent, AutoDjPanelComponent, LearningPanelComponent, LibraryComponent, MidiPanelComponent,
    MidiMappingComponent, QuickGuideComponent,
  ],
  template: `
    <div>
      <h2>SoundIA DJ</h2>
      <app-quick-guide />
      <app-dj-console />
      <app-learning-panel />
      <app-library />
      <app-autodj-panel />
      <details class="plegable">
        <summary>Controlador MIDI</summary>
        <app-midi-panel />
        <app-midi-mapping />
      </details>
    </div>
  `,
})
export class DjPageComponent {}
