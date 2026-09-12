import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
  });

  it('renders the Albions landing page', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Raids claras');
    expect(fixture.nativeElement.querySelectorAll('.gallery-list button').length).toBe(4);
    expect(fixture.nativeElement.querySelector('hlm-tabs')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[hlmcard]')).toBeTruthy();
  });
});
