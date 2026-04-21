---
name: E2E Testing Instructions
description: Conventions for Cypress + Cucumber end-to-end tests on Frequencies Popscore — MSW-mocked backend, feature-file authoring, stable selectors.
---

# E2E Testing Instructions

Load when the task involves **end-to-end user flow tests** — opening a page, clicking through a journey, asserting on the rendered app. Stack: Cypress + `@badeball/cypress-cucumber-preprocessor` + `@bahmutov/cypress-esbuild-preprocessor`, with MSW mocking HTTP when a real backend isn't available.

## Scope

- Everything under `cypress/e2e/`, `cypress/api/`, `cypress/support/`, and the `.feature` files that drive them.
- `cypress.config.ts` is the Cypress entry point. `vitest.config.ts` is for the unit / component layer — do not collapse them.

For rendering assertions on a single component, use `testing/component-testing.instructions.md` instead. An E2E test that only verifies one component's output is an over-reach.

## Writing features (Cucumber / Gherkin)

Feature files live under `cypress/e2e/*.feature` and follow Gherkin syntax:

```gherkin
Feature: Browse movies

  As a visitor
  I want to paginate through the movie catalog
  So that I can discover the full list without scrolling a single huge page

  Background:
    Given the catalog contains 100 movies

  Scenario: Navigating to the next page
    When I open the movies page
    And I click the "Next" pagination button
    Then I see page 2 of 34
    And the first visible movie has id "m-013"
```

### Rules

- **One scenario = one behavior.** If a scenario has more than five `Then` lines, split it.
- **Scenario titles describe outcomes, not mechanics.** "Navigating to the next page", not "Click the next button".
- **Background for shared setup only** — genre filters, logged-in state, seeded data. Not for assertions.
- **Step definitions live in `cypress/support/step_definitions/`** (or whatever path `cypress-cucumber-preprocessor` is configured for). Keep them small; push complex logic into page-object-style helpers under `cypress/support/pages/`.
- Reuse steps across features. Rewriting "When I open the movies page" in two files is a smell — extract.

## Step definitions

```typescript
import { Given, When, Then } from '@badeball/cypress-cucumber-preprocessor';

Given('the catalog contains {int} movies', (count: number) => {
  cy.intercept('GET', '/api/movies*', {
    statusCode: 200,
    body: seedMovies(count),
  }).as('listMovies');
});

When('I open the movies page', () => {
  cy.visit('/movies');
  cy.wait('@listMovies');
});

Then('I see page {int} of {int}', (current: number, total: number) => {
  cy.get('[data-testid="pagination-current"]').should('have.text', `${current}`);
  cy.get('[data-testid="pagination-total"]').should('have.text', `${total}`);
});
```

### Rules

- **Selectors: `data-testid`.** Not CSS classes, not text content for interactive elements. Class names churn; test IDs are a contract.
- **Intercept before visit.** `cy.intercept(...)` must be registered before the navigation that triggers the request.
- **Alias every intercept.** `.as('listMovies')` lets you `cy.wait('@listMovies')` deterministically instead of racing against a timeout.
- **Assert intentionally.** Every `Then` line maps to at least one `cy.should(...)`. An empty step is a bug.

## MSW vs `cy.intercept`

Two mocking options are wired up:

- **MSW** (`npm run mock`) — service-worker-based. The app starts with MSW enabled and all `/api/*` calls go to the handlers under `src/mocks/`. Good for exercising the real app against a consistent fake backend during dev and for E2E scenarios that want fine-grained request matching.
- **`cy.intercept`** — Cypress-level network stubbing. Good for per-scenario overrides (simulating a 500, delaying a response, verifying a request was made).

Pick one per scenario, don't layer them. Default to `cy.intercept` in E2E; reach for MSW when you need the same fake backend in dev (`npm run mock`) and in E2E for parity.

## Fixtures

Static response bodies live in `cypress/fixtures/*.json`. Seed-data generators live in `cypress/support/seeds/`. Prefer generators for variable-length lists (paginated catalogs, filter results) and fixtures for canonical single-object responses.

## Organization

```
cypress/
├── e2e/                    # .feature files
├── support/
│   ├── step_definitions/   # Gherkin bindings
│   ├── pages/              # Page-object helpers (visit, click, assert primitives)
│   ├── seeds/              # Data generators
│   └── commands.ts         # Custom cy.* commands
├── fixtures/               # Static JSON payloads
├── api/                    # API-contract tests (hitting the real backend)
└── window_driver/          # SSR / window driver specific helpers
```

Don't put step definitions in `e2e/`. Don't put assertions in `pages/`.

## Running

```bash
npm run cypress     # opens Cypress runner with dev server (via concurrently)
```

CI should use `cypress run` (headless) against a built / previewed bundle. Set the app URL via `CYPRESS_BASE_URL` rather than hard-coding in `cypress.config.ts`.

## What to cover in E2E

- **Golden paths** through each feature — the flow a new user is most likely to take.
- **Critical edge cases** a unit test can't cover — routing, SSR hydration, multi-component coordination, actual HTTP semantics.
- **Regressions** — reproduce user-reported bugs in a scenario before fixing.

## What NOT to cover in E2E

- Component rendering details (text formatting, pipe output, CSS). Those belong in component tests — E2E is expensive and slow.
- Domain invariants (a movie with a negative release year must throw). Unit test.
- Every permutation of a form's validation. Pick the representative cases; unit-test the rest.

## What the agent must never do

- Select elements by CSS class name (`.btn-primary`) or by text on interactive elements.
- `cy.wait(2000)` instead of `cy.wait('@alias')`. Time-based waits mask real bugs.
- Let a scenario depend on another scenario's state. Cypress resets between tests — don't fight it.
- Assert on a response payload shape in E2E when the contract is already covered by a type-checked API client. E2E asserts user-visible behavior.
- Ship an E2E test that passes when the feature is broken (false negatives come from asserting on the mock, not the app).
- Commit a `.only` or `.skip` modifier.
