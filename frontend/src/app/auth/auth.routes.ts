import { Routes } from '@angular/router';

export const AUTH_ROUTES: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./components/login/login.component').then(
        (c) => c.LoginComponent
      ),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./components/register/register.component').then(
        (c) => c.RegisterComponent
      ),
  },
  {
    path: 'verify-email',
    loadComponent: () =>
      import('./components/verify-email/verify-email.component').then(
        (c) => c.VerifyEmailComponent
      ),
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
];
