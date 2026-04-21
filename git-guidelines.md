---
name: Git Guidelines
description: Branching model, commit conventions, and revert policy the agent must follow when creating commits, branches, or pull requests on Frequencies Popscore.
---

# Git Guidelines

Load and follow these guidelines whenever the current task involves **creating commits, branches, or pull requests** — staging changes, writing commit messages, opening PRs, or rewriting / reverting history.

## Branching model

**Trunk-based development on `main`.**

- `main` is always releasable. Never merge a broken build.
- Feature branches are **short-lived** — hours to a few days. A branch still open after three days is a signal to split the work.
- No long-lived release branches. Release from tagged commits on `main`.
- Use **feature flags / environment config** for work-in-progress that needs to land on `main` before it's user-visible.
- Branch naming: `<type>/<short-kebab-description>` — e.g. `feat/movie-pagination`, `fix/movie-filter-genre-mapping`. `<type>` matches a Conventional Commit type.

## Conventional commits

Every commit on `main` follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

<optional body — motivation, contrast with previous behavior>

<optional footer — issue refs, breaking changes>
```

### Allowed types

| Type | When to use |
|---|---|
| `feat` | A new user-visible feature or capability |
| `fix` | A bug fix |
| `docs` | Documentation-only changes (README, inline docs) |
| `style` | Formatting, whitespace, semicolons — no logic change |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | A change that improves performance |
| `test` | Adding or fixing tests |
| `chore` | Maintenance that doesn't fit elsewhere |
| `build` | Build system or dependency changes (`package.json`, `build.gradle`, `angular.json`) |
| `ci` | CI configuration (`azure-pipelines.yml`, Firebase hosting configs) |

Use the narrowest type that still describes the change.

### Scope

Optional but encouraged. Prefer feature or module names.

- **Front scopes:** `movies`, `pagination`, `search`, `navbar`, `footer`, `core`, `domain`, `infra`, `shared`
- **Back scopes:** `command`, `query`, `usecase`, `repository`, `acceptance`, `firestore`
- **Cross-cutting:** `front`, `back`, `deps`, `ci`, `docs`

Examples: `feat(movies)`, `fix(pagination)`, `build(deps)`, `ci(front)`.

### Subject line rules

- **Imperative, present tense**: "add pagination", not "added" / "adds".
- **Max 72 characters** total (including `type(scope):`).
- **No trailing period.**
- **Lowercase after the colon** unless the first word is a proper noun.

### Body

Explains **why** and **how it differs** from the previous behavior — not what the diff already shows.

- Wrap at 72 characters.
- Short paragraphs.
- Omit when there's no meaningful "why" beyond the subject.

### Footer

- `Refs #123` or `Closes #123` for issues.
- `BREAKING CHANGE: <description>` for any change that breaks the public API, the HTTP contract, a persisted schema (Firestore document shape), or a configuration format. Also mention in the body.
- **No `Co-Authored-By` trailer.** Single-author commits. Credit collaborators / AI assistants in the PR description, not the commit.

### Examples

```
feat(movies): add genre filter on the results page

Before this change the results page always returned every genre. The
filter plugs into MovieFilter and narrows the Firestore query in the
query-side repository.

Refs #87
```

```
fix(pagination): clamp visible-pages window on last page

The window could show pages beyond totalPages when currentPage equaled
totalPages, producing disabled links. Clamp the upper bound to
totalPages and keep the window size at three.
```

```
refactor(domain): extract MovieId value object from Movie

```

```
build(deps): bump @angular/core from 20.1.0 to 20.1.3

```

```
test(usecase): cover SynchroniseMoviesUseCase with repository fake

```

## Commit granularity

- **One logical change per commit.** A commit that adds a feature, fixes an unrelated bug, and reformats three files is three commits.
- **Every commit on `main` must build and pass tests.** Don't land a commit that depends on a follow-up to be correct.
- Prefer a small series of clean commits over one monster squash when the intermediate steps help the reviewer.

## Staging

- Stage specific files. `git add -A` / `git add .` risks pulling in secrets, `.env*`, build artifacts (`dist/`, `coverage/`, `.angular/`, `build/`), or unrelated local edits.
- Double-check the diff (`git diff --staged`) before the commit command.

## Reverting

Use a **revert commit**, not history rewriting, to undo changes on `main`:

```bash
git revert <commit-sha>
git push origin main
```

The revert subject keeps Conventional-Commit format:

```
revert: feat(movies) add genre filter on the results page

This reverts commit <sha>. The filter masked movies that should have
stayed visible when no genre was selected. Will re-land after
movies/filter-default is merged.

Refs #87
```

Never rewrite history on `main` (`git push --force`, `git reset --hard` then push, `git rebase -i` on pushed commits). On local feature branches before the first push, rebasing is fine — after that, it's not.

## Pull requests

- PR title follows the same Conventional-Commit format as the commit subject.
- PR description restates the "why" and lists the files / areas touched.
- Link the issue the PR closes.
- Keep PRs small enough to review in under 30 minutes. Split if not.
- Check Firebase App Hosting preview on UI-touching PRs before marking ready.

## What the agent must never do

- Create a commit that mixes unrelated changes.
- Write a subject in the past tense or with a trailing period.
- Exceed 72 characters on the subject line.
- Force-push to `main` or rewrite pushed history.
- Use `git reset --hard` on shared branches.
- Skip `git revert` in favor of history rewriting to undo a landed commit.
- Land a commit that breaks the build or fails tests.
- Merge a long-lived feature branch instead of using a feature flag.
- `git add -A` / `git add .` — always stage specific files.
- Add a `Co-Authored-By` trailer (including for AI assistants).
