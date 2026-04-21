---
name: Backend Testing Instructions
description: Conventions for JUnit 5 tests on Frequencies Popscore — use-case unit tests, MockServer adapter tests, Firestore-emulator integration tests, acceptance tests.
---

# Backend Testing Instructions

Load when the task involves testing backend Java code — use cases, infrastructure adapters, HTTP controllers, or full acceptance flows. Stack: **JUnit 5 + AssertJ + Mockito** (unit), **MockServer** (HTTP adapter integration), **Firestore emulator** (repository integration), plus black-box acceptance tests in `acceptance/`.

## Test taxonomy

The project separates tests by filename pattern — the Gradle config (`build.gradle`) already enforces this:

| File suffix | Gradle task | What it tests | Runs against |
|---|---|---|---|
| `*Test.java` | `./gradlew test` | Use cases, domain helpers, adapters with mocked collaborators | In-JVM, no external services |
| `*IT.java` | `./gradlew integrationTest` | Repository adapters, HTTP clients | Real Firestore emulator, MockServer |

Don't rename a test to cross the boundary. If it needs the emulator, it's an `IT`.

## Unit tests (`*Test.java`)

### Use-case tests

Use cases orchestrate ports. Mock the ports, exercise the use case, verify the collaboration.

```java
class SynchroniseMoviesUseCaseTest {

    @Test
    void should_save_all_movies_returned_by_provider() {
        // Arrange
        MovieProvider provider = mock(MovieProvider.class);
        MovieRepository repository = mock(MovieRepository.class);
        Movie movie = MovieBuilder.builder()
            .withId(new MovieId("m-1"))
            .withTitle("Dune")
            .withReleaseYear(2021)
            .build();
        when(provider.fetchAll()).thenReturn(List.of(movie));
        SynchroniseMoviesUseCase useCase = new SynchroniseMoviesUseCase(provider, repository);

        // Act
        useCase.synchronise();

        // Assert
        verify(repository).saveAll(List.of(movie));
        verifyNoMoreInteractions(repository);
    }
}
```

### Rules

- **No `@SpringBootTest`.** Use-case tests instantiate the class with plain constructors. Booting Spring here is a ten-second tax on every run.
- **Mockito for ports, builders for entities.** Never mock a `Movie` or a `MovieId`.
- **AssertJ** (`org.assertj.core.api.Assertions.assertThat`) — reads well, chains well, reports well.
- **Name tests as sentences** — `should_save_all_movies_when_provider_returns_any` — or use `@DisplayName` with a readable string. Pick one per file.
- **Verify interactions sparingly.** `verify(...)` is appropriate for asserting the behavior under test. Extra `verify` calls on unrelated interactions clutter the test and couple it to implementation.

### Pure-domain tests

See `testing/unit-testing.instructions.md` — same file covers front and back unit tests.

## Integration tests (`*IT.java`)

### HTTP adapters — MockServer

Adapters that call third-party APIs (via OkHttp) are integration-tested against a local MockServer instance.

```java
class TmdbMovieProviderIT {

    private ClientAndServer mockServer;
    private TmdbMovieProvider provider;

    @BeforeEach
    void startServer() {
        mockServer = ClientAndServer.startClientAndServer();
        provider = new TmdbMovieProvider("http://localhost:" + mockServer.getLocalPort(), "api-key");
    }

    @AfterEach
    void stopServer() {
        mockServer.stop();
    }

    @Test
    void should_map_tmdb_response_into_domain_movie() {
        // Arrange
        mockServer.when(request().withMethod("GET").withPath("/movie/42"))
            .respond(response().withStatusCode(200).withBody("""
                { "id": 42, "title": "Dune", "release_date": "2021-10-22" }
                """));

        // Act
        Movie movie = provider.fetchById(new MovieId("42"));

        // Assert
        assertThat(movie.title()).isEqualTo("Dune");
        assertThat(movie.releaseYear()).isEqualTo(2021);
    }
}
```

- **Start MockServer per test or per class** — `ClientAndServer.startClientAndServer()` is cheap. Don't share an instance across packages.
- **Match requests precisely** — method, path, headers that matter. Loose matchers let tests pass for the wrong reason.
- **Assert the mapping, not the HTTP mechanics.** If your adapter returns the right domain object, that's the contract — don't re-assert that Jackson parsed JSON.

### Firestore repositories — emulator

Repository adapters run against the Firestore emulator via the Firebase CLI:

```bash
./gradlew integrationTestWithEmulator
```

The Gradle task (`integrationTestWithEmulator`) boots the emulator for the duration of the test run. Tests use the injected `Firestore` bean pointed at the emulator host/port.

```java
@Test
void should_roundtrip_a_movie_through_firestore() throws Exception {
    // Arrange
    Movie movie = MovieBuilder.builder()
        .withId(new MovieId("m-rt-1"))
        .withTitle("Dune")
        .withReleaseYear(2021)
        .build();

    // Act
    repository.save(movie);
    Optional<Movie> reloaded = repository.findById(movie.id());

    // Assert
    assertThat(reloaded).isPresent();
    assertThat(reloaded.get().title()).isEqualTo("Dune");
    assertThat(reloaded.get().releaseYear()).isEqualTo(2021);
}
```

- **Never point tests at a real Firestore project.** The emulator is the only allowed backend. A stray `FIREBASE_PROJECT=popscore-frequencies-prod` in a test config is a critical bug.
- **Reset state between tests.** Either truncate the collection in `@BeforeEach` or use a unique per-test document id (`UUID.randomUUID()`).
- **Test the roundtrip** — save → clear any in-memory cache → reload → assert equality. This catches mapping bugs a save-and-assert misses.

### Controller / acceptance tests

Black-box HTTP tests live in `acceptance/`. They exercise the real Spring context with `@SpringBootTest(webEnvironment = RANDOM_PORT)` and issue real HTTP calls.

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
class MovieAcceptanceIT {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void should_return_201_when_posting_a_valid_movie() throws Exception {
        // Arrange
        String body = """
            { "id": "m-1", "title": "Dune", "releaseYear": 2021 }
            """;

        // Act / Assert
        mockMvc.perform(post("/api/movies")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.id").value("m-1"));
    }
}
```

- Acceptance tests that depend on Firestore run under the emulator (`integrationTestWithEmulator`).
- Use the project's `@ExcludeOnScenarioProfile` annotation when a test should skip under a specific profile (see `annotation/`).
- Thin controller + fat use case means acceptance tests can focus on HTTP semantics (status, headers, response shape), not business logic — the use-case test already covers that.

## Coverage

JaCoCo runs after `test`:

```bash
./gradlew jacocoTestReport
```

Don't regress existing coverage. New behavior ships with its tests — `test` task finishes green before you commit.

## What the agent must never do

- Add `@SpringBootTest` to a pure use-case test.
- Point a test at a real Firestore project (only the emulator).
- Mock a domain entity (`Movie`, `MovieId`) — build them.
- Use `@MockBean` in a unit test — that's a Spring-context-only abstraction, and the unit test shouldn't boot Spring.
- Share a `ClientAndServer` or a Firestore document id across tests without explicit cleanup.
- Rename a test from `*IT` to `*Test` to get it to run under `./gradlew test` — if it needs external services, it's an IT.
- Assert on the shape of Jackson-serialized JSON when the contract is already enforced by the DTO type.
- Land a commit whose `./gradlew test` or `./gradlew integrationTest` fails.
