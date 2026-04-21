---
name: Frequencies Popscore — Project Context
description: Architecture, commands, and project-specific agent rules for the Frequencies Popscore project. Loaded into the Frequencies profile entry point.
---

# Frequencies Popscore — Project Context

Project-specific context for Frequencies Popscore. The shared and stack guidelines are loaded separately via the profile entry point (`CLAUDE.md`) and the Copilot generated artifacts — this file holds only what is unique to this project.

## Stack at a glance

- **Frontend** (`Frequencies-Popscore/popscore-frontend/`) — Angular 20 (standalone components, signals), TypeScript 5.8, TailwindCSS 4, Vitest + jsdom, Cypress + Cucumber, MSW. SSR via `@angular/ssr`.
- **Backend** (`Frequencies-Popscore/popscore/`) — Java 21, Spring Boot 3.5.3, Gradle, Firebase Admin + Firestore, JUnit 5, MockServer, Checkstyle / PMD / SpotBugs, JaCoCo.
- **Platform** — Firebase App Hosting (front), Firestore + scheduled jobs (back).

Both sides follow a **hexagonal architecture**. The backend is additionally split into a CQRS `command/` vs `query/` layout.

## Architectural context

### Frontend (`popscore-frontend/src/app/`)

```
domain/            # Pure TS: Movie, MovieBuilder, MovieId, spi/ (ports)
infrastructure/    # Adapters: ApiClient, RestApi*, CodesToFrench
core/              # App-level services (e.g. movie-search-bus.service)
components/        # Standalone Angular components (features + shared UI)
shared/            # Pipes, directives, cross-feature utilities
```

- `domain/` has zero Angular, zero HTTP, zero framework imports.
- `domain/spi/` holds repository/service interfaces — "ports". Implementations live in `infrastructure/`.
- Components consume domain types and call services; they never reach into `infrastructure/` directly.

### Backend (`popscore/src/main/java/fr/frequencies/popscore/`)

```
domain/
  command/{model, spi, usecase}   # Write side: entities, ports, use cases
  query/{model, spi, usecase}     # Read side: projections, ports, use cases
infrastructure/                    # Adapters (Firestore, HTTP clients, schedulers)
acceptance/                        # Black-box HTTP acceptance tests + DTOs
annotation/                        # @UseCase, @ExcludeOnScenarioProfile
PopscoreApplication.java
```

- Domain depends on nothing outside itself. Infrastructure depends on domain. API / acceptance depend on both.
- Use cases are the only entry points into domain logic. Controllers delegate to them; they never inline business rules.

## Common commands

### Frontend

```bash
npm run dev              # dev server (localhost:4200)
npm run mock             # dev server with MSW request interception
npm run build            # production build
npm test                 # Vitest unit + component tests
npm run test:coverage    # with coverage (thresholds enforced: 80/80/80/80)
npm run cypress          # open Cypress + start dev server
```

### Backend

```bash
./gradlew build                      # compile + unit tests + checks
./gradlew test                       # unit tests only (*Test.class)
./gradlew integrationTest            # integration tests (*IT.class)
./gradlew integrationTestWithEmulator  # integration tests under Firestore emulator
./gradlew allTests                   # unit + integration
./gradlew lint                       # checkstyle + pmd
./gradlew jacocoTestReport           # coverage report
```

Always run the relevant test suite before declaring a task finished. Don't declare success when you haven't actually executed the tests.

## Agent workflow rules

1. **Work from context, not assumption.** Before editing, read the concrete file, don't rely on memory of "how Angular projects usually look". The hexagonal split here is stricter than most.
2. **Respect the dependency direction.** `domain/` never imports `infrastructure/`. Same rule front and back. A test that imports from both is a smell.
3. **Factories over constructors for entities.** Front (`MovieBuilder`) and back (static factory methods) both enforce this. See the coding guidelines.
4. **No framework leakage into domain.** No `@Component`, no `HttpClient`, no `@Service` annotations in front-`domain/`. No `@RestController`, no `@Document`, no Spring/Firestore types in back-`domain/`.
5. **Tests follow the architecture.** Unit tests for `domain/`, component tests for Angular components, E2E for user flows, MockServer / emulator for backend integration. See `testing-guidelines.md`.
6. **TDD when adding behavior.** Red / Green / Refactor. Mark the phase in the reply (see `testing-guidelines.md`).
7. **Never declare success without running the relevant checks.** `npm test` / `./gradlew test` / the matching lint — run them, read the output.

## What the agent must never do

- Introduce `@Component`, `@Injectable`, or `HttpClient` imports in `popscore-frontend/src/app/domain/`.
- Introduce Spring or Firestore types in `popscore/.../domain/`.
- Bypass the factory / builder to construct a domain entity directly (new `Movie(...)`, `new Order(...)`).
- Write code for a new behavior without a failing test first (TDD).
- Declare "tests pass" without having run them in this session.
- Add agentic workflow files (`CLAUDE.md`, `.claude/`, agent instructions) into the project tree. They belong in the toolbox repo.
