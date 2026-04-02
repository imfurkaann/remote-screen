# Android Player

This folder contains the Android signage player application.

## Quality Baseline

- Kotlin style is enforced via `.editorconfig`.
- Planned next step: add Gradle project and `ktlintCheck` task.

## Implemented Core Modules (Phase 5)

- boot: `BootReceiver` and startup coordinator.
- storage: `HardwareIdStore`, Room entities/DAO/database/repository.
- network: Retrofit models/service/factory and socket reconnect manager.
- mediaplayer: lifecycle-safe ExoPlayer wrapper.

## Planned Core Modules

- mediaplayer
- network
- sync
- commands
- storage
- telemetry
