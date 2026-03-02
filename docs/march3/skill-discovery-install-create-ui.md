# Add Skill (Discover, Install, Create) UI + API — March 3, 2026

## Scope

Implemented end-to-end “Add Skill” support in mobile settings and API:

- Discover and install catalog skills via `find-skills`.
- Install from trusted GitHub sources (via existing skill installer path).
- Create local skills via skill creator pipeline.
- Reflect install and lock metadata in the existing skill model and keep runtime enablement synchronized.
- Add focused mobile interaction test coverage for modal search/install/create flows.

## Backend work

### New/updated service layer

- Added a dedicated skill management module at `server/skills/management.js`.
- Added runtime validation and normalization for:
  - Discover/search source selection.
  - Install requests (`find-skills` and `github`).
  - Create requests (slug/id/category/metadata validation).
- Added canonical path/URL safety checks and allowlisted GitHub install behavior.
- Added lockfile update support in `skills-lock.json` for:
  - `id`, `name`, `source`, `sourceRef`, `installedAt`, `path`, `version/commit`.
- Ensured post-mutation enablement and refresh flow:
  - Persist enabled IDs.
  - Call existing enabled-skills sync path so active sessions pick up changes immediately.

### New/updated API routes

File: `server/routes/skills.js`

- `GET /api/skills/search`  
  Supports catalog lookups and returns normalized `skills` hits.

- `POST /api/skills/install`  
  Accepts payload with:

  - `source: find-skills | github`
  - `skillId` (catalog path)
  - `repoUrl` / `path` (direct path mode)
  - `autoEnable` (default `true`)

- `POST /api/skills/create`  
  Accepts:

  - `name`, `id`, `category`
  - optional `description`, `author`, `repoUrl`
  - optional `autoEnable`

- `GET /api/skills/sources`  
  Returns source options with status/health for UI state.

### Discovery/enablement behavior

- Existing `GET /api/skills` now exposes enriched metadata from lockfile:
  `source`, `installedAt`, `path`, `sourceRef`, `version`, `isRemote`.
- Existing `GET /api/skills-enabled` and existing `/api/skills/:id` endpoint remain intact and include new metadata fields when present.
- Errors use the implemented status mapping:
  - `400` validation/input issues
  - `409` duplicate or already-present IDs
  - `422` metadata/creator validation
  - `500` script/installer runtime errors

## Frontend work

### Skill settings UI

File: `apps/mobile/src/components/settings/SkillConfigurationView.tsx`

- Added `+ Add Skill` action in the settings panel.
- Added Add Skill modal with two tabs:
  - **Install from Catalog**  
    - Debounced query input (find-skills source).
    - Search results and action button per item (`Install` / `Enable` / `Installed` states).
  - **Create Skill**  
    - Required `name`, `id`, `category`.
    - Optional `description`, `author`, `sourceUrl`.
    - Submit posts to create endpoint and closes modal on success.
- Kept existing skill enable/disable flow and detail overlay behavior intact.

### Mobile services/API client changes

File: `apps/mobile/src/services/server/skillsApi.ts`

- Added/extended client methods and payload types:
  - `searchSkills`
  - `installSkill`
  - `createSkill`
  - `getSkillSources`

## Test automation pass completed

### Jest interaction coverage

File: `apps/mobile/src/components/settings/__tests__/SkillConfigurationView.test.tsx`

Added/extended test:
- opens Add Skill modal
- performs catalog search flow
- triggers install action and validates payload
- switches to Create flow
- submits create flow and validates payload
- verifies success feedback path (`showAlert` calls) and post-install/list refresh behavior via mocked fetch responses

Run command:

```bash
npm run -w mobile test -- SkillConfigurationView.test.tsx
```

Result observed:
- both tests in file pass:
  - asynchronous load test
  - catalog search/install + create end-to-end interaction test

## Where are installed skills written?

Install target is:

- `projectRoot + config.skillsLibraryDir + "/" + skillId`

In this repo:

- `config/skills.json` sets `skillsLibraryDir` to `server/skills/library`.
- so installed skills land under `server/skills/library/<skill-id>`.

Enabled/runtimelink behavior:

- `skillsEnabledFile` and `skillsEnabledDir` continue to control persisted enablement and sync target.
- `syncEnabledSkillsFolder(...)` updates the active session-visible folder for Pi startup/runtime use after mutation.
