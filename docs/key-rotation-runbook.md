# Firebase Key Rotation Runbook

## Purpose
Use this runbook to complete the final operational security step: rotate Firebase/API credentials and verify application health after rotation.

## Preconditions
- Access to Firebase Console for project `shieldher-fyp`.
- Access to CI/CD or local environment variable management.
- Team communication ready for a short maintenance window.

## Step 1: Inventory Current Credentials
1. In Firebase Console, open Project Settings.
2. Record currently active Web API key and related app identifiers.
3. Confirm no credentials are hardcoded in repository files.

## Step 2: Create New Credentials
1. Generate a new Web API key.
2. Apply key restrictions (recommended):
- Restrict by API scope to only required Firebase APIs.
- Restrict by app/platform where applicable.

## Step 3: Update Runtime Configuration
1. Update local/CI secret stores with new values:
- `FIREBASE_API_KEY`
- any rotated supporting IDs if changed by console operations
2. Ensure `.env` remains git-ignored.
3. Validate `.env.example` remains template-only.

## Step 4: Revoke Old Credentials
1. Disable/delete old key(s) in console.
2. Confirm old key can no longer be used.

## Step 5: Verification
Run these from repo root after updating env values:

```bash
npm run security:status
npm run test:ci
npm run test:rules:emulator
```

Expected:
- `security:status` reports healthy.
- Unit/integration/functions tests pass.
- Rules tests pass via emulator command.

## Step 6: Production Smoke Checks
1. Login/signup flow works.
2. SOS trigger creates alert documents.
3. Guardian notifications deliver.
4. Escalation scheduler still processes due alerts.

## Rollback
If any critical failure appears:
1. Temporarily re-enable previous key (if still available).
2. Restore previous secret values in environment manager.
3. Investigate failed service/logs, then retry rotation.

## Completion Criteria
- New key active and restricted.
- Old key revoked.
- Tests and smoke checks passed.
- No secrets committed in git history/index.
