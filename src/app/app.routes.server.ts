import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    // El dashboard depende de datos en vivo del API: no se prerenderiza en el build.
    path: '**',
    renderMode: RenderMode.Client,
  },
];
