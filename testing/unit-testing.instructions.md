---
name: Unit Testing Instructions
description: Conventions for pure-logic unit tests on Frequencies Popscore — domain entities, value objects, pure functions on both front and back.
---

# Unit Testing Instructions

Load when the task involves testing **pure domain logic** — entities, value objects, builders, pipes' transform logic, or any function with no I/O and no framework dependency. These tests are fast, deterministic, and do not spin up Angular, Spring, Firestore, or HTTP.

## Scope

- Frontend: `src/app/domain/`, `src/app/shared/` pure helpers, any `*.spec.ts` that doesn't need a `TestBed`.
- Backend: `src/main/java/.../domain/command/model/`, `.../query/model/`, `.../usecase/` — the use-case file itself gets a unit test with mocked ports.

If the code under test imports `@angular/*`, `HttpClient`, `@Component`, a Spring annotation, `Firestore`, or `okhttp` — it does not belong in a unit test. Move to the component, E2E, or backend-integration layer.

## Frontend — Vitest

### Structure

```typescript
import { Movie } from '@domain/Movie';
import { MovieBuilder } from '@domain/MovieBuilder';
import { describe, expect, it } from 'vitest';

describe('Movie', () => {
  describe('isReleased', () => {
    it('should return true when releaseYear is in the past', () => {
      // Arrange
      const movie = new MovieBuilder()
        .withReleaseYear(2000)
        .build();

      // Act
      const result = movie.isReleased(new Date('2026-01-01'));

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when releaseYear is in the future', () => {
      // Arrange
      const movie = new MovieBuilder()
        .withReleaseYear(2099)
        .build();

      // Act
      const result = movie.isReleased(new Date('2026-01-01'));

      // Assert
      expect(result).toBe(false);
    });
  });
});
```

### Rules

- Build inputs with the project's **builders** (`MovieBuilder`, etc.), not hand-instantiated literals. A test bypassing the builder doesn't exercise the real invariants.
- Inject time — never call `new Date()` inside the code under test if the test needs to pin a moment. Pass the date in, or use a clock port.
- Keep test files next to the code under test, named `*.spec.ts`.
- Test through the **public API**: builders, methods on entities. Don't reach into `private` state via `as any`.
- Parameterize repetitive cases with `it.each`:

  ```typescript
  it.each([
    [100, 1, [1, 2, 3]],
    [100, 3, [2, 3, 4]],
    [100, 5, [3, 4, 5]],
  ])('should compute visible pages for %i movies on page %i', (numberOfMovies, currentPage, expected) => {
    const p = createPagination(numberOfMovies, currentPage);
    expect(p.visiblePages).toEqual(expected);
  });
  ```

### Assertions

- `expect(value).toBe(...)` for primitives and identity.
- `expect(value).toEqual(...)` for deep structural equality.
- `expect(() => fn()).toThrow(SpecificError)` for exception paths — always match the specific error type, not a generic `Error`.

## Backend — JUnit 5

### Structure

```java
package fr.frequencies.popscore.domain.command.model;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MovieTest {

    @Nested
    @DisplayName("isReleased")
    class IsReleased {

        @Test
        void should_return_true_when_release_year_is_in_the_past() {
            // Arrange
            Movie movie = MovieBuilder.builder()
                .withId(new MovieId("m-1"))
                .withTitle("Dune")
                .withReleaseYear(2000)
                .build();

            // Act
            boolean result = movie.isReleased(LocalDate.of(2026, 1, 1));

            // Assert
            assertThat(result).isTrue();
        }
    }
}
```

### Rules

- **AssertJ** (`org.assertj.core.api.Assertions`) for assertions — the Spring Boot starter pulls it in. It reads better than JUnit's raw asserts and gives type-aware matchers.
- **Mockito** for ports in use-case tests:

  ```java
  @Test
  void should_persist_movies_returned_by_provider() {
      // Arrange
      MovieProvider provider = mock(MovieProvider.class);
      MovieRepository repository = mock(MovieRepository.class);
      Movie movie = aMovie().build();
      when(provider.fetchAll()).thenReturn(List.of(movie));
      SynchroniseMoviesUseCase useCase = new SynchroniseMoviesUseCase(provider, repository);

      // Act
      useCase.synchronise();

      // Assert
      verify(repository).saveAll(List.of(movie));
  }
  ```

- Name tests with underscores or `@DisplayName` — pick one per file. Underscored names read well in IDE runners; `@DisplayName` reads well in reports.
- Use `@Nested` to group cases for the same method under test.
- Domain objects: build with the real builder. Use-case ports: mock.

### What to avoid

- Mocking the class under test. If you need to, the class is doing too much — split it.
- Mocking domain entities (`Movie`, `MovieId`). They're value-like; construct them.
- `@SpringBootTest` here — that's for integration tests. A unit test does not boot Spring.
- Hitting Firestore, a real HTTP server, the filesystem, or `System.currentTimeMillis()` without an injected clock.

## What the agent must never do

- Import `@angular/*`, `@Component`, or `HttpClient` in a unit test.
- Import Spring's `@SpringBootTest`, `@DataJpaTest`, or start an `ApplicationContext` in a unit test.
- Use the real `Firestore` client.
- Construct a domain entity with `new` — use the builder.
- Write a test that passes without asserting anything (missing `expect` / `assertThat`).
- Ignore a flaky test by adding a retry — fix the root cause.
