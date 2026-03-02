# iOS Development Instructions

## Architecture
- MVVM with @Observable (Swift 6)
- SwiftUI
- Swift Concurrency (async/await)
- Swift Package Manager for dependencies

## Project Structure
```
ios/OpenClawConsole/
  Sources/
    App/           # App entry point
    Views/         # SwiftUI views
    ViewModels/    # Observable ViewModels
    Services/      # Gateway client, notifications
    Models/        # Data models
  Tests/           # Unit tests
```

## Build
```bash
cd ios/OpenClawConsole && xcodebuild -scheme OpenClawConsole build
```

## Test
```bash
cd ios/OpenClawConsole && xcodebuild -scheme OpenClawConsole test -destination 'platform=iOS Simulator,name=iPhone 16'
```
