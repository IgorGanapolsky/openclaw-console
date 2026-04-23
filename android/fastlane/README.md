fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## Android

### android internal

```sh
[bundle exec] fastlane android internal
```

Submit a new Internal Build to Google Play

### android promote_to_production

```sh
[bundle exec] fastlane android promote_to_production
```

Promote internal to production

### android firebase_dev

```sh
[bundle exec] fastlane android firebase_dev
```

Distribute to Firebase App Distribution

### android apptesting

```sh
[bundle exec] fastlane android apptesting
```

Run Firebase App Testing Agent against latest release APK

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
