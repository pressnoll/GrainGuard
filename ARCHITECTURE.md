# GrainGuard Application Architecture

## 1. Purpose and scope

GrainGuard is an Android-first React Native application for monitoring stored grain. It combines three sources of evidence:

1. environmental readings such as temperature, relative humidity, and grain moisture;
2. acoustic readings intended to represent insect-feeding activity; and
3. on-device visual classification of grain photographs.

The application turns these readings into silo health scores, warnings, histories, and recommended actions. Firebase provides identity, shared facility data, and cloud synchronization. Both the visual model and exported acoustic random forest are bundled inside the application and run locally.

This document describes the architecture that is currently implemented in the repository. It also identifies external integration points, particularly the ESP32/MQTT ingestion path, so planned infrastructure is not confused with working application code.

---

## 2. System context

```text
                                      External system boundary
                              ┌──────────────────────────────────┐
 ESP32 grain probe            │ MQTT broker                     │
 ┌──────────────────┐  JSON   │        │                        │
 │ DHT22            │────────►│        ▼                        │
 │ Acoustic DSP     │  MQTT   │ MQTT-to-Firestore gateway      │
 │ Battery monitor  │         │        │                        │
 └──────────────────┘         └────────┼────────────────────────┘
                                      │ validated telemetry
                                      ▼
                              ┌──────────────────┐
                              │ Firebase         │
                              │ Auth + Firestore │
                              └────────┬─────────┘
                                       │ realtime listeners/writes
                                       ▼
 ┌───────────────────────────────────────────────────────────────┐
 │ GrainGuard React Native application                           │
 │                                                               │
 │ Screens → Zustand stores → services → Firebase SDK            │
 │                    ├──────────────→ TFLite + device storage    │
 │                    └──────────────→ bundled JSON random forest │
 └───────────────────────────────────────────────────────────────┘
```

The ESP32 does not communicate directly with the mobile application. Its firmware publishes MQTT messages to the deployed trusted gateway, which validates the payload, maps the probe to a facility and silo, and creates an `acousticInbox` document. The gateway is external to this repository and the phone contains no MQTT credentials.

---

## 3. Technology stack

| Concern | Implementation | Role |
|---|---|---|
| Mobile framework | React Native 0.86 with React 19 and TypeScript | Native Android/iOS application and UI |
| Navigation | React Navigation 7 | Authenticated route tree, bottom tabs, and detail screens |
| Client state | Zustand | Auth session orchestration, facility state, subscriptions, and write actions |
| Authentication | React Native Firebase Auth | Email/password and Google authentication |
| Cloud database | Cloud Firestore | Profiles, facilities, current silo state, and scan histories |
| Vision inference | `react-native-fast-tflite` | Local execution of the GrainVisual model |
| Acoustic inference | TypeScript RF evaluator + exported JSON forest | Local execution of the thesis random forest |
| Image acquisition | `react-native-image-picker` | Camera capture and gallery selection |
| Image preparation | `@bam.tech/react-native-image-resizer`, `jpeg-js`, `react-native-fs` | JPEG normalization, pixel decoding, model-resource loading |
| Native runtime | Nitro Modules | JSI/native host used by the TFLite package |
| UI state visualization | Custom React Native components | Gauges, sparklines, waveforms, thresholds, and status bands |

The application does not use React Query, Redux, MMKV, Expo, or a browser-based Firebase SDK. Firebase subscriptions and caching are handled by the native React Native Firebase SDK, while Zustand exposes the resulting state to screens.

---

## 4. Architectural layers

```text
┌──────────────────────────────────────────────────────────────────┐
│ Presentation                                                     │
│ screens/ + components/ + navigation/                             │
├──────────────────────────────────────────────────────────────────┤
│ Application state                                                │
│ state/authStore.ts + state/facilityStore.ts                      │
├──────────────────────────────────────────────────────────────────┤
│ Services and adapters                                            │
│ auth, user, facility, silo, scan, visual inference, mappings     │
├──────────────────────────────────────────────────────────────────┤
│ Domain model                                                     │
│ core/monitoring.ts + core/telemetry.ts + formatting/theme        │
├──────────────────────────────────────────────────────────────────┤
│ Infrastructure                                                   │
│ Firebase native SDK, TFLite, bundled RF JSON, filesystem, camera │
└──────────────────────────────────────────────────────────────────┘
```

### 4.1 Presentation layer

Screens are responsible for interaction and rendering. They select state from Zustand and call store actions; they do not construct Firestore paths or use Firebase directly.

The main bottom tabs are:

- **Overview:** current facility and silo health dashboard;
- **Scan:** phone-camera vision capture and status/results for the paired remote acoustic probe;
- **Analysis:** trends, histories, and cross-silo insights; and
- **Settings:** profile, silo, threshold, and application settings.

Stack screens provide focused flows such as scan results, vision history, acoustic detail, silo editing, profile editing, and threshold configuration.

Reusable components such as `Panel`, `DataRow`, `TickGauge`, `ThresholdBar`, `Sparkline`, `ProportionBar`, and `StatusMark` keep presentation rules consistent. Theme tokens live in `core/theme.ts`; screens should not invent independent color or spacing systems.

### 4.2 Application-state layer

There are two Zustand stores.

#### Authentication store

`state/authStore.ts` owns:

- Firebase session restoration;
- sign-in, sign-up, Google sign-in, password reset, and sign-out;
- creation or loading of the user's Firestore profile;
- resolution or provisioning of the user's facility;
- the live profile listener; and
- attachment/detachment of the facility store.

The authentication listener is the root of the application lifecycle. A Firebase user is not considered fully initialized until the app has resolved a profile and facility. This distinction explains why a user may be authenticated but still see “Not signed in to a store”: Firebase Auth succeeded, but facility resolution did not.

#### Facility store

`state/facilityStore.ts` owns:

- the active `facilityId`;
- facility metadata and thresholds;
- silo current-state documents;
- acoustic and vision history;
- Firestore listener and acoustic-inbox processor lifecycle;
- freshness aging for displayed telemetry; and
- all facility-scoped write actions.

When `attach(facilityId)` runs, the store establishes listeners for the facility, silos, acoustic events, and vision scans, then starts the serialized acoustic-inbox processor. `detach()` removes all listeners, stops the processor, and returns state to its disconnected/demo condition.

The store uses narrow selectors such as `useSilos`, `useVisionScans`, and `useThresholds`. This reduces unnecessary screen re-renders and prevents components from depending on the full store shape.

### 4.3 Service layer

The service layer isolates infrastructure details:

- `firebase.ts` lazily resolves the native Firebase app, Auth instance, and Firestore instance;
- `authService.ts` wraps Firebase Auth and translates SDK errors into user-facing messages;
- `userService.ts` manages `users/{uid}` profiles;
- `facilityService.ts` provisions facilities and handles facility metadata/thresholds;
- `siloService.ts` handles silo subscriptions and CRUD operations;
- `scanService.ts` stores vision results and subscribes to both histories;
- `visualScanService.ts` owns image preprocessing, segmentation, TFLite execution, and result interpretation;
- `acousticInferenceService.ts` validates and lazily loads the exported forest, traverses its trees with sklearn-compatible `<=` semantics, and averages tree/window probabilities;
- `acousticInboxService.ts` validates gateway events, serializes inference, and atomically promotes results into history/current silo state;
- `mappers.ts` converts Firestore documents into domain objects and back;
- `paths.ts` is the single source of truth for Firestore collection/document paths; and
- `write.ts` bounds how long the UI waits for Firestore acknowledgement when offline.

This separation means UI code handles domain values rather than Firebase snapshots, timestamps, or collection paths.

### 4.4 Domain layer

`core/monitoring.ts` contains the principal domain model:

- environmental, acoustic, and vision reading types;
- configurable safe-storage thresholds;
- conversion of readings into `ok`, `caution`, and `critical` bands;
- per-metric 0–100 scores;
- vision defect percentages derived from counts;
- the fused health index; and
- alert derivation.

These functions are pure apart from the deliberately shared active threshold table. Firestore data is first mapped into domain types; screens then derive health and alerts from those types.

`core/telemetry.ts` contains demonstration/seed records. Those records serve two purposes: they populate a newly provisioned facility and provide an explicitly non-live presentation fallback. They are not outputs of the vision model.

---

## 5. Navigation and application lifecycle

`App.tsx` starts the authentication store once and renders `AppNavigator`.

```text
Application launch
      │
      ▼
Firebase configuration available?
      │
      ├── no  → expose configuration error
      │
      ▼ yes
Restore Auth session
      │
      ├── no user → Auth screen
      │
      ▼ user
Ensure users/{uid} profile
      │
      ▼
Resolve linked facility or provision one
      │
      ▼
Attach Firestore listeners
      │
      ▼
Authenticated tabs and detail routes
```

While this sequence runs, the navigator displays `BootScreen`. Once complete, the route tree contains either authentication screens or authenticated application screens—never both. Signing out changes the route map, which prevents navigating backward into private screens.

The authenticated stack contains `MainApp` plus detail screens. `MainApp` contains the four bottom tabs. Scan results are passed through navigation as a plain `VisualScanResult`; the result screen will not substitute stored/demo values if a fresh vision result is missing.

---

## 6. Firebase architecture

### 6.1 Document model

```text
users/{uid}
  displayName
  email
  phone
  photoURL
  role
  notifications
  facilityId ───────────────────────────────┐
                                            │
facilities/{facilityId} ◄───────────────────┘
  name
  operator
  region
  gatewayId
  firmware
  ownerUid
  memberUids[]
  thresholds
  retentionDays
  createdAt / updatedAt

  silos/{siloId}
    identity and capacity
    environment (latest reading)
    acoustic (latest reading)
    vision (latest reading)
    lastFrameAt

  acousticInbox/{scanId}
    gateway-owned raw feature event (read-only to facility members)

  acousticEvents/{eventId}
    immutable classified acoustic history and model audit record

  visionScans/{scanId}
    immutable model result and audit metadata
```

Profiles belong to users, while telemetry belongs to facilities. This supports multiple operators sharing the same physical store without duplicating silo data under every account.

### 6.2 Facility provisioning

On first sign-in, the application:

1. creates `users/{uid}` if it does not exist;
2. queries for a facility whose `memberUids` contains the UID;
3. creates a facility if no membership exists;
4. seeds initial silo and history records in the same batch; and
5. writes the new `facilityId` back to the profile.

The batch prevents a half-created facility from being presented as ready. Existing sessions use `users/{uid}.facilityId` as the direct link to the facility.

### 6.3 Realtime reads

The facility store uses Firestore `onSnapshot` listeners rather than polling. Current silo state and history update the UI as soon as Firestore changes. History queries are ordered newest-first and capped to avoid unbounded reads.

Freshness values such as `minutesAgo` are recalculated locally every minute after the latest snapshot. A stale sensor can therefore move offline even when no new server event arrives.

### 6.4 Writes and atomicity

Profile, facility, and silo edits use direct Firestore updates. Recording a vision scan uses a batch with two operations:

```text
create facilities/{fid}/visionScans/{scanId}
update facilities/{fid}/silos/{siloId}.vision
```

The history record and the silo’s current vision reading therefore advance together. Acoustic promotion uses a transaction:

```text
read facilities/{fid}/acousticEvents/{scanId}
read facilities/{fid}/silos/{siloId}
create immutable acoustic event if absent
update silo acoustic state and valid DHT readings
```

The history document ID is the gateway `scanId`, so concurrent phones converge on one result. Inbox records remain immutable and are not used as mutable acknowledgement flags.

`services/write.ts` waits up to four seconds for acknowledgement. If the native SDK has queued an offline write but cannot reach the server, the UI stops waiting and treats it as queued. Firestore persistence later synchronizes it. Immediate permission failures are returned to the screen.

### 6.5 Security model

`firestore.rules` enforces two ownership models:

- a user can read/write only their own `users/{uid}` profile; and
- a facility and its subcollections require the caller UID to appear in the facility's `memberUids`.

Only the facility owner may change membership or delete the facility. History records are append-only from the mobile client. `acousticInbox` is readable by members but never writable by a phone. Unmatched paths are denied.

The rules file in the repository is not automatically active: it must be published to project `grainguard-a3e3c`. In addition, the signed-in UID must match the profile document ID and appear in the linked facility's membership array.

---

## 7. Vision-analysis architecture

Vision is the most self-contained processing pipeline in the application:

```text
Camera/gallery image
       │
       ▼
Resize/normalize to JPEG (maximum 2048 × 2048)
       │
       ▼
Read bytes and decode RGBA pixels
       │
       ├── beans → multiple whole-heap training-scale views
       │
       └── other grains → Otsu foreground segmentation → kernel boxes
       │
       ▼
Convert each view/kernel to 224 × 224 × 3 float32 tensor
       │
       ▼
GrainVisual multi-head TFLite model
       │
       ├── selected crop head
       └── generic sound/damaged/impurity cross-check
       │
       ▼
Softmax + aggregation + confidence + recommendation
       │
       ▼
ScanResults screen → optional Firestore batch save
```

### 7.1 Model packaging

The model and its contracts live under `src/assets/models/`:

- `grainvisual_f32.tflite` contains the network;
- `deploy_manifest.json` describes input shape, heads, output tensor names, class order, and model file; and
- `recommendations.json` maps crop/class predictions to actions.

Metro treats `.tflite` as an asset through `metro.config.js`. In Android release builds, Metro packages it as a raw resource. Because the installed TFLite loader expects a URL but React Native resolves that raw resource to a bare resource name, `visualScanService.ts` copies the resource once to the application's private cache and loads it through `file://`. This is a packaging adapter, not a network download.

### 7.2 Preprocessing routes

The model has crop-specific heads for maize, rice, wheat, sorghum, and beans.

For maize, rice, wheat, and sorghum, the application detects foreground kernel regions, creates padded square crops, resizes them to the model canvas, and classifies each kernel. The result includes the detected sample size, class counts, plurality class, mean confidence, and a generic-head cross-check.

Beans use a direct route because that head was trained on whole-heap photographs. The application evaluates several training-scale views of the heap. The number of views classified as infested becomes a measured extent percentage and maps to clean, light, moderate, or severe infestation.

### 7.3 Output interpretation

The service resolves output positions by tensor name and shape rather than assuming that the array position equals the graph tensor ID. It applies softmax to logits before exposing confidence.

Crop class codes are mapped into readable labels and recommendations. For compatibility with the existing dashboard health model, detailed classes are also folded into four aggregate defect buckets:

- pest attack or an infested bean view → bore holes;
- Fusarium/sprout, sun/moisture, heat, under-development, or black point → discoloration;
- broken kernels → fragmentation; and
- mould → mould.

The detailed class counts remain the authoritative audit data stored with the scan; the four buckets support existing trend and health views.

### 7.4 Trust and failure behavior

A confidence floor marks uncertain results as low-trust but does not silently replace them. The UI asks for confirmation with a second photograph. If segmentation detects no kernels, model loading fails, or no fresh result reaches the result screen, the app shows an error and refuses to save fabricated values.

All inference runs locally. The source image is not uploaded by this application; only derived result data is written to Firestore when the operator selects **Save to log**.

---

## 8. Monitoring, scoring, and alerts

Every numeric metric has four reference points: floor, safe ceiling, caution threshold, and hard limit. A facility may edit its safe ceilings. The caution and hard boundaries shift with that setting so their order remains valid.

`scoreOf` maps each reading onto a 0–100 scale:

- safe range: 100 down to 80;
- caution range: 80 down to 50; and
- critical range: 50 down to 0.

Environmental health is limited by the worst available temperature, humidity, and moisture measurement. Acoustic health maps the model's infestation probability and authoritative `clean` / `needs_review` / `infested` classification. Vision health is limited by total damage or the worst defect category. Missing channels are excluded rather than converted to zero-valued evidence.

The fused health index is a weighted mean:

```text
environment 35% + acoustic 30% + vision 35%
```

Within each modality, the worst constituent reading governs. Across modalities, weighted fusion prevents one noisy source from completely determining health while still making a bad modality visible. If a modality is unavailable, the weights of available evidence are naturally re-normalized.

Alerts are derived from the active readings and threshold table, not stored as static cards. Changing facility thresholds therefore changes both score bands and generated warning text consistently.

---

## 9. Sensor and acoustic integration boundary

The deployed probe samples sound and DHT data, computes the exact 30-feature vector for each of five one-second windows, and publishes through the existing MQTT/gateway path:

```text
ESP32 → Wi-Fi → MQTT broker → trusted gateway
      → facilities/{fid}/acousticInbox/{scanId}
      → signed-in phone validates + runs bundled RF
      → immutable acousticEvents/{scanId} + silo current state
```

The mobile contract is strict: protocol/feature schema 1, raw feature space, nominal 24 kHz, five ordered windows, 30 finite values per window, valid probe/silo identifiers, DHT validity, battery value, sequence, and gateway timestamp. Malformed records are surfaced as processor errors and are not classified.

The bundled artifact is `src/assets/models/grain_infestation_rf.json`, exported from the trusted thesis joblib. The evaluator reproduces sklearn traversal, averages 500 tree probabilities per window, then averages five windows. With threshold 0.55 and review band 0.15, probability below 0.40 is `clean`, 0.40 through 0.70 inclusive is `needs_review`, and above 0.70 is `infested`.

The forest was trained with batch-confound correction. The artifact notes allow raw features for a single-session deployment without batch context, but representative field validation remains mandatory before treatment decisions are automated. The app therefore exposes the model version, threshold, review band, window probabilities, captured DHT/battery metadata, and this limitation in the audit UI.

The phone does not record acoustic audio and has no MQTT client. MQTT broker credentials and device-write authority remain outside the distributable application.

---

## 10. Offline and standalone behavior

There are three different meanings of “offline” in this architecture:

### Standalone executable

A release APK includes the JavaScript bundle, native libraries, images, and TFLite model. It runs without Metro or a development computer.

### Offline vision inference

Camera/gallery analysis and TFLite inference run completely on-device. They remain available without internet access once the user is inside the authenticated application.

### Offline cloud data

The native Firestore SDK caches previously read documents and queues supported writes. However:

- first-time account creation and facility provisioning require connectivity;
- a user generally needs a previously restored Firebase session;
- uncached facility data cannot be invented offline; and
- queued writes remain subject to security rules when they reach the server.

Demo telemetry is a presentation fallback and seed dataset, not proof that a cloud write succeeded. The `live` flag distinguishes Firestore-backed silo data from demo state.

---

## 11. Build and runtime configuration

Android native dependencies are built with Gradle, CMake, and the React Native new architecture. The project currently enables Hermes and the new architecture.

For a connected ARM64 phone, the efficient standalone build is:

```powershell
cd C:\GG\android
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a
```

The APK is written to:

```text
android/app/build/outputs/apk/release/app-release.apk
```

The current release build uses the debug keystore. It is appropriate for local testing, but production distribution requires a private release keystore, secure credential handling, versioning, and Play signing configuration.

Metro excludes Gradle/CMake generated output (`build` and `.cxx`) from its file watcher. Those directories are created and deleted during native builds and must not participate in JavaScript dependency discovery.

---

## 12. Source-tree responsibilities

```text
src/
├── assets/       images, video, TFLite model, manifest, recommendations
├── components/   reusable presentation primitives and data visualizations
├── core/         domain types, scoring, thresholds, formatting, and theme
├── navigation/   route types, authenticated stack, and bottom tabs
├── screens/      user-facing application flows
├── services/     Firebase adapters, persistence, mapping, and inference
├── state/        authentication and facility Zustand stores
└── types/        local TypeScript declarations

android/          native Android project and release packaging
firestore.rules   authorization policy deployed to Firebase
firebase.json     Firebase deployment mapping
metro.config.js   Metro assets and generated-directory exclusions
```

Dependency direction should remain:

```text
screens/components → state/services → core + infrastructure adapters
```

Core monitoring logic must not import screens or Firebase. Screens should not create Firestore paths or interpret raw model tensors.

---

## 13. Current limitations and next architectural work

1. **Acoustic field validation:** evaluate raw-feature RF performance across representative probes, silos, grain types, seasons, fans/generators, and unseen recording batches before automating treatment.
2. **Background ownership:** inference runs while an authenticated app process is attached. A production design may add one trusted server/worker owner if processing must continue with every phone closed.
3. **Facility recovery:** a stale or unauthorized `users/{uid}.facilityId` needs a clearer in-app repair/retry flow.
4. **Rules testing:** Firestore rules should gain emulator-based tests for inbox read-only access, concurrent classification, provisioning, membership, and rejected cross-facility access.
5. **Vision validation:** segmentation and model accuracy should be evaluated on representative device photographs, lighting conditions, backgrounds, and grain layouts.
6. **Production signing:** release credentials and secure CI packaging are not configured.
7. **Background synchronization feedback:** queued Firestore writes are not currently exposed as a durable per-record pending/failed state.
8. **Demo-state separation:** future production builds may choose to remove demo fallback data or gate it behind an explicit demonstration mode.

---

## 14. Architectural principles

- Keep raw infrastructure details behind services.
- Derive percentages, health scores, and alerts from measured values rather than storing duplicated conclusions.
- Treat model manifests and recommendations as part of the deployed model contract.
- Never substitute demo or previous readings for a failed fresh vision scan.
- Use atomic writes when history and current state must agree.
- Authorize by facility membership, not merely by being signed in.
- Keep device credentials and MQTT authority outside the mobile application.
- Clearly label external, cached, demo, and live data paths.

This document should be updated whenever a model contract, Firestore schema, security rule, navigation flow, or external integration boundary changes.
