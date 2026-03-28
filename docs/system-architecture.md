# ShieldHer System Architecture

## Overview
ShieldHer is a React Native (Expo) mobile safety platform backed by Firebase services and Cloud Functions. The architecture is event-driven and safety-first, with fallback paths for unstable connectivity.

## Core Components
- Mobile App (Expo + React Native)
- Firebase Auth and Firestore
- Firebase Cloud Functions (guardian notification, OTP, escalation scheduler)
- Offline delivery subsystem (local retry queue + SMS fallback)

## High-Level Data Flow
1. User triggers SOS from UI, voice, or AI scream detection.
2. App attempts Firestore alert write using idempotent alert ID.
3. On failure, app queues alert locally in AsyncStorage and retries.
4. Cloud Function on alert creation notifies guardians.
5. Guardian response updates alert lifecycle to responding/resolved.
6. Escalation scheduler promotes unresolved alerts to police workflow.

## Module Boundaries
- `src/services/alertService.js`: SOS dispatch, queue integration, fallback orchestration.
- `src/services/alertRetryQueue.js`: Local persistence, retry policy, connectivity listener.
- `src/services/alertLifecycleService.js`: Respond, resolve, cancel transitions.
- `src/hooks/useScreamDetection.js`: AI trigger stabilization and telemetry.
- `functions/index.js`: Firestore and HTTP function entry points.
- `functions/escalationService.js`: Escalation queue/scheduler logic.

## Reliability Design
- Idempotent alert creation prevents duplicate alerts.
- Retry queue handles transient network failures.
- Connectivity-triggered immediate retries reduce alert latency after reconnection.
- SMS fallback is triggered after max retry exhaustion.
- Structured logs enable post-incident traceability.

## Security Controls
- Firestore rules enforce owner, guardian, and police access constraints.
- Immutable alert fields are protected after creation.
- OTP verification and escalation operations run in trusted backend functions.

## Deployment Notes
- Mobile app deploys via Expo build process.
- Firebase Functions deploy independently from app binaries.
- Firestore rules and emulator-backed tests are part of CI gating.
