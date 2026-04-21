---
name: Angular Coding Guidelines
description: Angular 20 / TypeScript conventions the agent must follow when writing or reviewing frontend code on Frequencies Popscore.
---

# Angular / TypeScript Coding Guidelines

Load and follow these guidelines on **every frontend development task** — feature work, refactors, bug fixes, code review. Target: **Angular 20**, **TypeScript 5.8**, standalone components, signals, zoneless-friendly code.

## Formatting

- **Indentation:** 2 spaces, no tabs (matches Angular CLI defaults).
- **Line length:** prefer 120 characters max. Break long pipelines and template expressions.
- **Single quotes** for strings; double quotes only in HTML attributes.
- **Semicolons** required — don't rely on ASI.
- **Prettier config** lives in `package.json`'s `prettier` field with the Angular HTML parser override. Don't add a separate `.prettierrc` without cause.
- **One exported symbol per file** for components, services, domain entities. Multiple related types (e.g. a component + its input interface) may share a file only when they're tightly coupled.

## Naming conventions

| Element | Convention | Example |
|---|---|---|
| Classes, interfaces, types, enums | `PascalCase` | `Movie`, `MovieRepository` |
| Interfaces (ports) | `PascalCase`, no `I` prefix | `MovieRepository`, not `IMovieRepository` |
| Methods, functions | `camelCase`, verb-based | `calculateTotal()`, `goToNext()` |
| Public properties / signals | `camelCase` | `currentPage`, `movies` |
| Private fields | `#camelCase` (ECMAScript private) or `camelCase` | `#cache`, `counter` — pick one per class, don't mix |
| Constants | `SCREAMING_SNAKE_CASE` for module-level, `camelCase` for locals | `DEFAULT_PAGE_SIZE`, `pageSize` |
| Observables (RxJS) | `camelCase` + `$` suffix | `movies$`, `searchTerm$` |
| Files | `kebab-case` | `movie-detail.component.ts`, `pagination.spec.ts` |
| Component selectors | `kebab-case` with prefix | `<app-movie-detail>` |

Avoid Hungarian notation, abbreviations that aren't industry-standard, and `I`-prefix on interfaces (the TS community dropped it years ago).

## Angular 20 idioms

### Standalone by default

All components, directives, and pipes are `standalone: true` (implicit in v20 — don't set it explicitly, but do list imports). Do **not** create `NgModule`s for new code.

```typescript
@Component({
  selector: 'app-movie-detail',
  templateUrl: './movie-detail.html',
  styleUrl: './movie-detail.scss',
  imports: [CommonModule, DateFormatPipe],
})
export class MovieDetail {
  readonly movie = input.required<Movie>();
  readonly closed = output<void>();
}
```

### Signals for component state

- Use `signal()`, `computed()`, `input()`, `output()`, `model()` for reactive state. Avoid `BehaviorSubject` / `Subject` in component classes.
- **`input()` and `output()` replace `@Input` / `@Output`.** Use `input.required<T>()` when the input must be provided.
- Expose signals as `readonly` — mutate only through component methods.
- Keep `computed()` side-effect free. If you need side effects, use `effect()` and register cleanup.

### Control flow

Use built-in template control flow (`@if`, `@for`, `@switch`), not `*ngIf` / `*ngFor`. `@for` requires a `track` expression — use the domain key (`movie.id`), not `$index`, unless the list is truly static.

```html
@for (movie of movies(); track movie.id) {
  <app-movie-card [movie]="movie" />
} @empty {
  <p>No movies found.</p>
}
```

### Dependency injection

- Prefer `inject()` over constructor parameters:

  ```typescript
  export class MovieSearchBusService {
    private readonly api = inject(ApiClient);
  }
  ```

- Inject **ports (domain interfaces)**, not concrete infrastructure classes, wherever feasible. Provide the concrete adapter via `providers: [{ provide: MovieRepository, useClass: RestApiMovieRepository }]`.

### Change detection

- New components default to `OnPush` — add `changeDetection: ChangeDetectionStrategy.OnPush` on any non-signal component. (Signal-only components don't need it, but it's a no-op when OnPush.)
- Never call `ChangeDetectorRef.detectChanges()` in production code paths. If you think you need it, the state model is wrong.

### Async

- `async`/`await` for promise-based flows. `firstValueFrom` / `lastValueFrom` when bridging from RxJS.
- Observables that the template subscribes to go through `AsyncPipe` (`| async`) — do not manually `subscribe()` in a component unless you also manage `takeUntilDestroyed()` or `DestroyRef`.
- Use `takeUntilDestroyed()` (from `@angular/core/rxjs-interop`) for long-lived subscriptions inside services or components.

## Hexagonal architecture (frontend)

### Layer rules

```
src/app/
├── domain/              # Pure TypeScript; no Angular, no HTTP
│   ├── Movie.ts
│   ├── MovieBuilder.ts
│   ├── MovieId.ts
│   └── spi/             # Ports (interfaces) — MovieRepository, etc.
├── infrastructure/      # Adapters that implement ports
│   ├── ApiClient.ts
│   ├── RestApiMovieRepository.ts
│   └── ...
├── core/                # App-level services (buses, facades)
├── components/          # Standalone components (features + reusable UI)
└── shared/              # Pipes, directives, utilities
```

- **`domain/` imports only from `domain/` and standard TS.** No `@angular/*`, no `rxjs`, no `HttpClient`. If a domain type needs reactivity, expose a plain async method and let the caller wrap it.
- **`infrastructure/` depends on `domain/` to implement its ports.** Never the other way around.
- **Components consume `domain/` types and call `core/` services.** They don't reach into `infrastructure/` directly.
- **`shared/` is framework code that multiple features use.** It's allowed to depend on `@angular/*` but not on `infrastructure/`.

### Ports and adapters

A port is an interface in `domain/spi/`:

```typescript
// domain/spi/movie-repository.ts
export interface MovieRepository {
  findById(id: MovieId): Promise<Movie | null>;
  list(filter: MovieFilter): Promise<Pages<Movie>>;
}
```

An adapter in `infrastructure/` implements it:

```typescript
// infrastructure/RestApiMovieRepository.ts
export class RestApiMovieRepository implements MovieRepository {
  private readonly api = inject(ApiClient);
  async findById(id: MovieId): Promise<Movie | null> { ... }
  async list(filter: MovieFilter): Promise<Pages<Movie>> { ... }
}
```

Wiring happens at the app config level (`app.config.ts`) or feature providers — never by the component hard-coding the adapter.

### Builders for domain entities

Construct domain entities through a builder or static factory, **never** a public `new`. The existing `MovieBuilder` sets the pattern:

```typescript
const movie = new MovieBuilder()
  .withId(new MovieId('m-42'))
  .withTitle('Dune')
  .withReleaseYear(2021)
  .build();
```

- The entity constructor is **module-private**: not exported, or exported only via the builder / factory.
- The builder validates invariants in `build()` and throws a domain-specific `Error` subclass on violation.
- Value objects with a single required field (e.g. `MovieId`) use a plain constructor with validation in the body.

## Types and expressions

### Prefer `type` over `interface` for data shapes, `interface` for ports

- `interface` is for contracts that implementers realize (ports, service shapes).
- `type` is for DTOs, unions, mapped types, or aliases.
- Don't use `interface` just to describe the shape of a response body — use `type`.

### `readonly` by default

Fields that don't change after construction are `readonly`. Arrays exposed from domain types use `ReadonlyArray<T>` or `readonly T[]`.

### Discriminated unions over booleans

When a piece of state has more than two mutually exclusive cases, use a discriminated union:

```typescript
type MovieFetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; movies: ReadonlyArray<Movie> }
  | { status: 'error'; error: ApiError };
```

Switch on `status` — never on multiple booleans that could disagree.

### Nullability

- `strict` and `strictNullChecks` are on. Don't silence the compiler with `!` — if a value can be null, handle the null branch.
- Use `??` and `?.`, not `||` for nullish defaults.
- Return `Movie | null` over `Movie | undefined` for "not found" semantics.

## Error handling

- Throw typed errors — `ApiError` for HTTP, domain-specific `Error` subclasses for invariant violations. Don't throw bare `Error`.
- **Never catch-and-swallow.** Either rethrow, map to a domain error, or surface to the user via a signal / bus.
- Do not use exceptions for expected control flow (e.g. "not found"). Return `null` or a discriminated union.

## Tailwind / styling

- Tailwind 4 is the styling system. Prefer utility classes in templates over scoped SCSS.
- Use component-scoped SCSS (`*.scss` with the default Angular view encapsulation) only for things Tailwind can't express cleanly (complex animations, `:has()` selectors, container queries).
- Don't import global styles into component SCSS — put them in `src/styles.css`.

## Imports

- Use TS path aliases from `vitest.config.ts` and `tsconfig.json` — `@app/…`, `@core/…`, `@domain/…`, `@shared/…`. Don't write fragile relative paths like `../../../domain/Movie`.
- Sort: external first (`@angular/*`, `rxjs`, third-party), then aliased project imports, then relative imports. One blank line between groups.

## What the agent must never do

- Import `@angular/*`, `rxjs`, or any HTTP client from `src/app/domain/`.
- Import from `src/app/infrastructure/` into `src/app/domain/` or into components.
- Construct a domain entity with `new Movie(...)` bypassing `MovieBuilder`.
- Create an `NgModule` for new code.
- Use `*ngIf` / `*ngFor` in new templates — use `@if` / `@for`.
- Silence a null warning with `!`.
- Subscribe in a component without `takeUntilDestroyed()` or an `async` pipe.
- Import `HttpClient` directly from a component — go through an adapter in `infrastructure/` behind a port.
- Re-add `@Input` / `@Output` decorators — use signal-based `input()` / `output()`.
