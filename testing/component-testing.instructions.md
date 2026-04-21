---
name: Component Testing Instructions
description: Conventions for Angular component and pipe tests on Frequencies Popscore — Vitest with jsdom, signal-based inputs, OnPush-aware rendering.
---

# Component Testing Instructions

Load when the task involves testing an **Angular component, directive, or pipe** with the Vitest + jsdom runner. For pure classes (services with no DI, domain logic), use the unit testing instructions instead.

## Scope

- Any `*.spec.ts` for a file under `src/app/components/`, `src/app/shared/pipes/`, or `src/app/shared/directives/`.
- Services that depend on `inject()` and therefore need `TestBed`.

For end-to-end flows spanning multiple components or the real router, see `testing/e2e-testing.instructions.md`.

## Setup

The Vitest config (`vitest.config.ts`) provides:

- `environment: 'jsdom'` — DOM APIs are available.
- `globals: true` — `describe` / `it` / `expect` are in scope without imports.
- Path aliases: `@app/…`, `@core/…`, `@shared/…`, `@domain/…`.

No custom setup file is wired up. If a test needs global polyfills (e.g. `zone.js` hooks when testing legacy non-signal code), add them via the `setupFiles` array in `vitest.config.ts` and document the reason in this file.

## Structure

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { MovieDetail } from './movie-detail';
import { MovieBuilder } from '@domain/MovieBuilder';
import { MovieId } from '@domain/MovieId';

describe('MovieDetail', () => {
  let fixture: ComponentFixture<MovieDetail>;
  let component: MovieDetail;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MovieDetail],
    }).compileComponents();
    fixture = TestBed.createComponent(MovieDetail);
    component = fixture.componentInstance;
  });

  it('should render the movie title', () => {
    // Arrange
    const movie = new MovieBuilder()
      .withId(new MovieId('m-1'))
      .withTitle('Dune')
      .build();
    fixture.componentRef.setInput('movie', movie);

    // Act
    fixture.detectChanges();

    // Assert
    const title = fixture.nativeElement.querySelector('[data-testid="movie-title"]');
    expect(title?.textContent?.trim()).toBe('Dune');
  });
});
```

## Rules

### Standalone imports

Components are standalone — put the component itself in `imports`, not `declarations`. The component's own `imports` array is re-used; you don't repeat them in the test.

### Signal inputs

Set signal-based inputs via `fixture.componentRef.setInput('name', value)`. **Do not** mutate the signal directly, and do not assign `component.movie = x` — with `input.required<T>()`, `.movie` is read-only from outside.

### Change detection

Call `fixture.detectChanges()` after any input change or event. With signals + OnPush, CD runs automatically for signal writes *inside* the component; manual CD is still needed when the test harness changes inputs from outside.

For async flows, await stability:

```typescript
await fixture.whenStable();
```

### Querying the DOM

- Prefer `data-testid="..."` attributes. They survive refactors in a way class names and text content don't.
- Use `fixture.nativeElement.querySelector(...)` (or `querySelectorAll`). Avoid the `DebugElement.query(By.css(...))` API — it's more verbose and adds no value in jsdom.
- Assert rendered text with `.textContent?.trim()`.

### Outputs

Subscribe once and collect emissions:

```typescript
const emitted: void[] = [];
component.closed.subscribe((v) => emitted.push(v));

fixture.nativeElement.querySelector('[data-testid="close-btn"]').click();
fixture.detectChanges();

expect(emitted).toHaveLength(1);
```

### Providing ports

When a component injects a port (`MovieRepository`), register a fake in the TestBed providers:

```typescript
class InMemoryMovieRepository implements MovieRepository {
  constructor(private readonly movies: Movie[]) {}
  async findById(id: MovieId) { return this.movies.find(m => m.id.equals(id)) ?? null; }
  async list() { return Pages.of(this.movies, 1, 1); }
}

await TestBed.configureTestingModule({
  imports: [MovieList],
  providers: [
    { provide: MovieRepository, useValue: new InMemoryMovieRepository([aMovie]) },
  ],
}).compileComponents();
```

An in-memory adapter is preferable to a Vitest mock — it exercises the port contract the real adapter implements, and it survives refactors.

### Pipes

Pipes don't need TestBed — instantiate directly:

```typescript
describe('DateFormatPipe', () => {
  it('should format an ISO date as dd/MM/yyyy', () => {
    const pipe = new DateFormatPipe();
    expect(pipe.transform('2026-04-21')).toBe('21/04/2026');
  });
});
```

### Async and RxJS

- `async`/`await` in the test body; `await fixture.whenStable()` to flush pending microtasks.
- Avoid `fakeAsync` / `tick` — they're a Zone.js pattern. Signal-based code doesn't need them. If you reach for `fakeAsync`, reconsider the component design.

## What to cover

- **Rendering** — the component displays the right data for a given input.
- **Interaction** — user actions (click, keydown, form input) emit the right outputs or mutate signals correctly.
- **Conditional branches** — `@if`, `@for @empty`, loading / error / loaded states of a discriminated-union view model.
- **Integration with injected ports** — the component calls the right port method with the right arguments, asserted via a spying fake.

## What to avoid

- Mocking `ChangeDetectorRef`, `NgZone`, or `ApplicationRef`. If you think you need to, the component is fighting the framework.
- Asserting on class names or internal markup structure that isn't part of the visible contract.
- Rendering a router-linked component without the router — either stub `<router-outlet>` via `RouterTestingHarness` or test the navigation in E2E.
- Using `jest.fn()` — this is Vitest, use `vi.fn()` if you need a spy.

## What the agent must never do

- Set a signal input by assigning to the component property (`component.movie = …`).
- Use `By.css()` / `DebugElement.query` as a stylistic default — `querySelector` is simpler.
- Add `fakeAsync` / `tick` to a signal-driven test.
- Mock a domain entity.
- Hit a real HTTP server from a component test — provide a port fake.
- Skip `await fixture.whenStable()` when the component does async work.
