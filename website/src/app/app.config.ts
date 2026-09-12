import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideSpartanHlm } from '@spartan-ng/helm/utils';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideSpartanHlm(),
  ]
};
