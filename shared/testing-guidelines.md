---
name: Testing Guidelines
description: Cross-stack testing philosophy, tooling, and per-layer conventions the agent must follow when writing or reviewing tests on Frequencies Popscore.
---

# Testing Guidelines

Load whenever the task involves **writing, reviewing, or debugging tests**. Then load the matching per-layer file under `testing/`.

The testing strategy mirrors the hexagonal split: every layer gets the kind of test that matches the kind of code it holds. A port is unit-tested through the use case that calls it. An adapter is integration-tested against the real external system (HTTP via MockServer, Firestore via emulator).

## Tooling

### Frontend

| Purpose | Package | Used by |
|---|---|---|
| Test runner | `vitest` | `npm test`, `npm run test:coverage` |
| DOM environment | `jsdom` | Component and pipe tests |
| Coverage | `@vitest/coverage-istanbul` | `npm run test:coverage`, thresholds enforced |
| E2E | `cypress` + `@badeball/cypress-cucumber-preprocessor` | `npm run cypress` |
| HTTP mocking | `msw` | Dev mock config, E2E fixtures |

Coverage thresholds are **80 lines / 80 branches / 80 functions / 80 statements**, pinned in `vitest.config.ts`. A task that lowers coverage below the threshold is not finished.

### Backend

| Purpose | Package | Used by |
|---|---|---|
| Test framework | JUnit 5 (`junit-jupiter`) | All test projects |
| Spring test utilities | `spring-boot-starter-test` | Use-case tests, slice tests |
| Mocking | Mockito (pulled in by starter) | Use-case and adapter tests |
| External-service fake | `org.mock-server:mockserver-netty` | Adapter integration tests (HTTP clients) |
| Firestore emulator | Firebase CLI, via `integrationTestWithEmulator` Gradle task | Repository integration tests |
| Coverage | JaCoCo 0.8.10 | `./gradlew jacocoTestReport` |

Unit tests match `**/*Test.class`. Integration tests match `**/*IT.class`. Never mix them in the same file — the Gradle tasks separate them explicitly.

## Core rules (all layers)

- **Arrange / Act / Assert** — every test has three visually separated blocks with `// Arrange`, `// Act`, `// Assert` comments (or the Java equivalent). Keep Arrange short; extract a builder or faker if it's not.
- **One behavior per test.** Multiple assertions are fine when they describe the same behavior. Branching on test state is not.
- **Test names describe behavior, not implementation.** Pattern: `methodUnderTest_scenario_expectedOutcome` or a full sentence `should <expected> when <scenario>`. Pick one per test file, don't mix.
- **Use factories / builders, not raw constructors.** Tests must construct domain entities the same way production code does — through `MovieBuilder`, `MovieId`, etc. A test that bypasses the builder is lying about the real invariants.
- **No shared mutable state between tests.** Each test builds what it needs. Fixtures shared across tests are allowed only for expensive setup (emulator, WebApplicationFactory equivalent).
- **Mock the boundary, not the logic.** Mock ports (repositories, HTTP clients, clocks). Do not mock domain objects. If you feel you need to, the test belongs in a different layer.
- **Never use a real network, a real Firestore prod instance, or a real third-party API from a test.** Use the emulator (Firestore) or MockServer (HTTP).

## Per-layer test choice

| Code under test | Layer | File to load |
|---|---|---|
| Pure domain logic (TS or Java — no framework, no I/O) | Unit | `testing/unit-testing.instructions.md` |
| Angular component or pipe | Component | `testing/component-testing.instructions.md` |
| User flow through the real app (front-to-back when possible, MSW-mocked otherwise) | E2E | `testing/e2e-testing.instructions.md` |
| Spring use case, repository, or HTTP controller | Backend | `testing/backend-testing.instructions.md` |

## TDD loop

Every new behavior follows Red / Green / Refactor. Mark the phase explicitly in the reply:

1. **Red** — write one failing test that captures the next behavior. Start your reply with `RED`. The test should fail for the right reason (assertion failure, not compile error) when possible.
2. **Green** — write the minimum production code to make the test pass. Start your reply with `GREEN`. No speculative generalization, no fixing unrelated things.
3. **Refactor** — improve structure without changing behavior. Start your reply with `REFACTOR`. All tests (not just the new one) must still pass.

Don't jump ahead. Don't write two tests at once. Don't write production code before a failing test justifies it.

When fixing a bug: start with a Red test that reproduces the bug, then Green the fix. This is non-negotiable — it's how regressions get locked down.

## Running tests

### Frontend

```bash
npm test                                  # all Vitest tests
npm test -- pagination                    # filter by filename
npm run test:coverage                     # full run with coverage thresholds
npm run cypress                           # open Cypress (starts dev server via concurrently)
```

### Backend

```bash
./gradlew test                            # unit tests only (*Test.class)
./gradlew test --tests "*MovieUseCase*"   # filter
./gradlew integrationTest                 # integration tests (*IT.class)
./gradlew integrationTestWithEmulator     # integration tests under the Firestore emulator
./gradlew allTestsWithEmulator            # everything
./gradlew jacocoTestReport                # HTML coverage in build/reports/jacoco
```

## What the agent must never do

- Skip the Red step and start writing production code before a failing test exists.
- Land a commit that fails `npm test`, `./gradlew test`, or the coverage threshold.
- Mock a domain entity.
- Use the real Firestore project from a test — always the emulator.
- Share mutable state across tests.
- Write a test that reaches into `private` state instead of exercising the public API.
- Construct a domain entity with `new` in a test — go through the builder / factory.
- Declare a test-writing task done without having executed the test.
