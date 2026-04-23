import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserService } from '@core/services/user.service';
import { environment } from '../../../environments/environment';

export const adminGuard: CanActivateFn = () => {
  const user = inject(UserService);
  const router = inject(Router);
  const email = user.currentUser()?.email ?? '';
  if ((environment as { adminEmails?: string[] }).adminEmails?.includes(email)) {
    return true;
  }
  return router.createUrlTree(['/welcome']);
};
