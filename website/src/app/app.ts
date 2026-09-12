import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideCalendarClock,
  lucideCircleCheck,
  lucideClock3,
  lucideLayers3,
  lucideMenu,
  lucideSearch,
  lucideShield,
  lucideSwords,
  lucideUsers,
} from '@ng-icons/lucide';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmSeparatorImports } from '@spartan-ng/helm/separator';
import { HlmTabsImports } from '@spartan-ng/helm/tabs';

type EvidenceCategory = 'raids' | 'templates';

interface Evidence {
  readonly src: string;
  readonly alt: string;
  readonly title: string;
  readonly detail: string;
  readonly category: EvidenceCategory;
}

@Component({
  selector: 'app-root',
  imports: [
    NgIcon,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmDialogImports,
    HlmSeparatorImports,
    HlmTabsImports,
  ],
  providers: [
    provideIcons({
      lucideArrowRight,
      lucideCalendarClock,
      lucideCircleCheck,
      lucideClock3,
      lucideLayers3,
      lucideMenu,
      lucideSearch,
      lucideShield,
      lucideSwords,
      lucideUsers,
    }),
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly currentYear = new Date().getFullYear();
  protected readonly activeCategory = signal<EvidenceCategory>('raids');
  protected readonly activeEvidenceIndex = signal(0);
  protected readonly mobileMenuOpen = signal(false);

  protected readonly evidences: readonly Evidence[] = [
    {
      src: 'evidencias/raid-avalon-01.png',
      alt: 'Raid finalizada gestionada por Albions con asistencia, roles y composición completa',
      title: 'Asistencia verificada',
      detail: 'Cierre del evento, roster final y control de ausencias en una sola vista.',
      category: 'raids',
    },
    {
      src: 'evidencias/raid-avalon-02.png',
      alt: 'Raid de Albion con lista de espera, looter y jugadores que no pueden asistir',
      title: 'Sustituciones sin caos',
      detail: 'Lista de espera, plazas y estados del jugador siempre visibles.',
      category: 'raids',
    },
    {
      src: 'evidencias/raid-avalon-03.png',
      alt: 'Raid gremial organizada con varios grupos de armas y looters',
      title: 'Composiciones completas',
      detail: 'Cada arma, build y participante queda ligado a su plaza real.',
      category: 'raids',
    },
    {
      src: 'evidencias/raid-avalon-04.png',
      alt: 'Raid finalizada con estado, participantes, roles y equipamiento del grupo',
      title: 'Historial que sí sirve',
      detail: 'El resultado permanece legible después de finalizar la actividad.',
      category: 'raids',
    },
    {
      src: 'evidencias/plantilla-modal.png',
      alt: 'Formulario de Discord para crear una plantilla nueva en Albions',
      title: 'Creación guiada',
      detail: 'Un formulario corto inicia la plantilla sin comandos complejos.',
      category: 'templates',
    },
    {
      src: 'evidencias/plantilla-editor.png',
      alt: 'Panel principal del editor visual de plantillas de Albions',
      title: 'Editor visual',
      detail: 'Información, configuración, roles y armas desde un único panel.',
      category: 'templates',
    },
    {
      src: 'evidencias/plantilla-grupo.png',
      alt: 'Panel de edición de un grupo de armas dentro de una plantilla',
      title: 'Grupos a tu medida',
      detail: 'Añade, modifica o retira armas sin salir del flujo de edición.',
      category: 'templates',
    },
  ];

  protected readonly visibleEvidences = computed(() =>
    this.evidences.filter((evidence) => evidence.category === this.activeCategory()),
  );

  protected readonly activeEvidence = computed(() =>
    this.visibleEvidences()[this.activeEvidenceIndex()] ?? this.visibleEvidences()[0],
  );

  protected setCategory(category: EvidenceCategory): void {
    this.activeCategory.set(category);
    this.activeEvidenceIndex.set(0);
  }

  protected selectEvidence(index: number): void {
    this.activeEvidenceIndex.set(index);
  }

  protected toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  protected closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }
}
