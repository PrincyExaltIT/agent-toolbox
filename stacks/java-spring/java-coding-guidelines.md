---
name: Java Coding Guidelines
description: Java 21 / Spring Boot 3.5 conventions the agent must follow when writing or reviewing backend code on Frequencies Popscore.
---

# Java / Spring Boot Coding Guidelines

Load and follow these guidelines on **every backend development task** — feature work, refactors, bug fixes, code review. Target: **Java 21**, **Spring Boot 3.5.3**, hexagonal CQRS architecture.

## Formatting

- **Indentation:** 4 spaces, no tabs.
- **Line length:** 120 characters max. Break long method chains and builder calls.
- **Braces:** opening brace on the same line (K&R), closing brace on its own line.
- **One public type per file.** Filename matches the type name.
- **Imports:** no wildcard imports. Order — `java.*`, `javax.* / jakarta.*`, third-party, project — one blank line between groups. Checkstyle enforces this in CI.

## Naming conventions

| Element | Convention | Example |
|---|---|---|
| Classes, records, enums, interfaces | `PascalCase` | `Movie`, `MovieRepository`, `SortType` |
| Interfaces (ports) | `PascalCase`, no `I` prefix | `MovieRepository`, `MovieProvider` |
| Methods | `camelCase`, verb-based | `synchroniseMovies()` |
| Fields, parameters, locals | `camelCase` | `movieId`, `pageSize` |
| Constants, enum values | `SCREAMING_SNAKE_CASE` | `DEFAULT_PAGE_SIZE`, `SortType.RELEASE_DATE` |
| Packages | `lowercase.nodot` | `fr.frequencies.popscore.domain.command.usecase` |
| Generic type parameters | Single uppercase letter | `T`, `R`, `K`, `V` |

## Language features (Java 21)

### Records for immutable data

Use `record` for DTOs, value objects, query results, and anything compared by value:

```java
public record MovieId(String value) {
    public MovieId {
        Objects.requireNonNull(value, "MovieId value must not be null");
        if (value.isBlank()) {
            throw new IllegalArgumentException("MovieId value must not be blank");
        }
    }
}
```

- Validate invariants in the compact constructor.
- Do not add setters or mutable collections to records.

### Sealed hierarchies for closed polymorphism

When a domain concept has a known finite set of subtypes, model it with a `sealed interface` and `record` implementations. Reach for it when the alternative is an enum-plus-map or instanceof cascade.

### Pattern matching and switch expressions

Use switch expressions and pattern matching over `if / else if` chains when branching on a type or enum:

```java
return switch (sort) {
    case RELEASE_DATE -> comparator(Movie::releaseDate);
    case TITLE -> comparator(Movie::title);
    case POPULARITY -> comparator(Movie::popularity);
};
```

### `var` for local variables

Allowed when the inferred type is obvious from the right-hand side (constructors, explicit generics, static factories). Don't use `var` when the initializer is a chain of calls whose return type isn't immediately clear to a reader.

### Text blocks

Use `"""` for multi-line JSON / SQL / HTML fixtures in tests and config.

## Hexagonal CQRS architecture

### Layer map

```
domain/
├── command/
│   ├── model/     # Write-side entities (Movie, MovieBuilder, MovieId, ActorInfo)
│   ├── spi/       # Ports: MovieRepository, MovieLister, MovieProvider
│   └── usecase/   # SynchroniseMoviesUseCase, UpdateMoviesUseCase
└── query/
    ├── model/     # Read projections (MovieFilter, Pages, Genre, cache/)
    ├── spi/       # Query ports
    └── usecase/   # Read-side use cases
infrastructure/    # Adapters: Firestore repositories, HTTP clients, schedulers
acceptance/        # Black-box HTTP acceptance tests + request DTOs
annotation/        # @UseCase, @ExcludeOnScenarioProfile
```

### Dependency rules

- **Domain depends on nothing outside itself.** No Spring annotations, no Firestore types, no Jackson annotations in `domain/`. If you reach for `@Document` or `@JsonProperty` inside `domain/`, stop — it belongs in `infrastructure/`.
- **Infrastructure depends on domain to implement ports.** Never the other way.
- **`command/` and `query/` don't cross-import.** The write side doesn't depend on read models; the read side doesn't depend on write use cases. They can share value objects only if those live in a shared domain root (create the shared package explicitly — don't leak by accident).
- **Controllers delegate to use cases.** Business logic does not live in controllers.

### Use cases

- One use case class per business operation. Name after the behavior, suffix `UseCase`: `SynchroniseMoviesUseCase`.
- Annotated with the project's `@UseCase` marker (see `annotation/UseCase.java`) — that's how Spring discovers them and also a domain marker.
- Constructor injection only — no field injection, no setter injection.
- Inject **ports** (interfaces from `spi/`), never concrete adapters.
- Return domain types or primitives. Never `ResponseEntity`, never Spring types.

```java
@UseCase
public class SynchroniseMoviesUseCase {
    private final MovieProvider movieProvider;
    private final MovieRepository movieRepository;

    public SynchroniseMoviesUseCase(MovieProvider movieProvider, MovieRepository movieRepository) {
        this.movieProvider = movieProvider;
        this.movieRepository = movieRepository;
    }

    public void synchronise() {
        // ...
    }
}
```

### Factories for entities

**Always construct domain entities through a builder or static factory, not a public constructor.** The existing `MovieBuilder` sets the pattern:

```java
Movie movie = MovieBuilder.builder()
    .withId(new MovieId("m-42"))
    .withTitle("Dune")
    .withReleaseYear(2021)
    .build();
```

- Entity constructor is `private` (or package-private only if a test in the same package needs it — prefer avoiding that).
- Builder validates invariants in `build()`; throw a domain-specific exception on violation.
- Value objects (records) keep their compact constructor for validation.

## Spring conventions

### Annotations

- `@RestController` for HTTP controllers. Keep them thin: bind / validate, call use case, map response. No business logic.
- `@RequestMapping` at class level for the base path; `@GetMapping` / `@PostMapping` at method level.
- `@UseCase` (custom) for use cases — do not add `@Service` or `@Component` on top.
- `@Repository` only on infrastructure adapters that implement a `spi/` port.
- Validation via `jakarta.validation.*` annotations on request DTOs in `acceptance/`.

### DTOs

- Request and response DTOs live in `acceptance/` (or an `api/dto/` subpackage), **not in `domain/`**.
- Use Java `record` for DTOs. Never expose a domain entity directly as a response body — map to a DTO.

### Persistence (Firestore)

- Firestore mapping lives in `infrastructure/`. Domain entities have no Firestore annotations.
- Repository adapters implement the domain port and translate between domain types and Firestore document shapes.
- Serialize enums as **strings**, not ordinals — ordinal-based serialization silently corrupts data when values are reordered.
- Use the `com.google.cloud.firestore` API via the injected `Firestore` bean; don't hand-craft REST calls to Firestore from application code.

### Rate limiting

Bucket4j is in the dependencies — use it for any new outbound integration that hits rate-limited APIs. Configure buckets in `infrastructure/`, not in use cases.

## Error handling

- Prefer **domain-specific exceptions** over raw `RuntimeException` or `IllegalStateException`. They live alongside the aggregate they belong to:

  ```java
  public class MovieNotFoundException extends RuntimeException {
      private final MovieId movieId;
      public MovieNotFoundException(MovieId movieId) {
          super("Movie with id " + movieId.value() + " was not found");
          this.movieId = movieId;
      }
      public MovieId movieId() { return movieId; }
  }
  ```

- Throw from the layer that owns the invariant — domain throws domain errors; application/use case can translate.
- **Never catch-and-swallow.** Either rethrow, wrap with context, or handle meaningfully.
- Don't use exceptions for expected control flow (not-found, invalid-input on hot paths). Use `Optional<T>` or a result type.

## Dependencies

- Versions are pinned in `build.gradle`. Adding a dependency is a deliberate edit — consider whether the JDK or Spring Boot starters already cover the need.
- Prefer Spring Boot starters over hand-picked transitive versions.
- Match Spring Boot's managed version for a library when one is defined. Don't override without a reason.

## Linting

Checkstyle, PMD, and SpotBugs run on every build (`./gradlew lint`). They're currently configured with `ignoreFailures = true` — **treat violations as real**, not as advisory noise. Fix new warnings in the same commit that introduces them.

JaCoCo runs after `test`. Don't regress existing coverage.

## What the agent must never do

- Add Spring annotations (`@Service`, `@Component`, `@Repository`) inside `domain/`.
- Add Firestore / Jackson annotations inside `domain/`.
- Import `fr.frequencies.popscore.domain.command` from `domain.query` (or vice versa) — write and read sides stay independent.
- Construct a domain entity with `new Movie(...)` bypassing the builder.
- Inject a concrete adapter into a use case — inject the port.
- Put business logic in a controller.
- Catch `Exception` generically to "handle" errors.
- Persist an enum as its ordinal.
- Add a dependency without pinning it via Spring Boot's managed versions or an explicit version in `build.gradle`.
