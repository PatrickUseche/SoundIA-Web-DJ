import { Routes } from '@angular/router';
import { authGuard } from './core/services/auth-guard';

// Cada pantalla se baja cuando se entra en ella: la pagina inicial no carga el mezclador (audio, decks, biblioteca,
// MIDI) hasta que el DJ abre /dj, ni la telemetria hasta que abre /dashboard.
export const routes: Routes = [
    { path: 'login', loadComponent: () => import('./features/login/login').then((m) => m.LoginComponent) },
    // El guard solo pide login si el API Gateway tiene la autenticacion encendida.
    { path: 'dj', loadComponent: () => import('./features/dj-page/dj-page').then((m) => m.DjPageComponent), canActivate: [authGuard] },
    { path: 'grabaciones', loadComponent: () => import('./features/recordings/recordings').then((m) => m.RecordingsComponent), canActivate: [authGuard] },
    { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.DashboardComponent), canActivate: [authGuard] },
    { path: '', redirectTo: 'dashboard', pathMatch: 'full'}
];
