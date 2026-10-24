import { Routes } from '@angular/router';
import { authGuard } from './core/services/auth-guard';
import { DashboardComponent } from './features/dashboard/dashboard';
import { DjPageComponent } from './features/dj-page/dj-page';
import { LoginComponent } from './features/login/login';
import { RecordingsComponent } from './features/recordings/recordings';

export const routes: Routes = [
    { path: 'login', component: LoginComponent },
    // El guard solo pide login si el API Gateway tiene la autenticacion encendida.
    { path: 'dj', component: DjPageComponent, canActivate: [authGuard] },
    { path: 'grabaciones', component: RecordingsComponent, canActivate: [authGuard] },
    { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
    { path: '', redirectTo: 'dashboard', pathMatch: 'full'}
];
