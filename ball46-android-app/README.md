# BALL46 Android — Beta 2 (test only)

Android WebView shell for BALL46. This is an app-only test build, not a website Production deployment.

- Package: `com.ball46.app`
- Version: `1.0.0-beta2`, versionCode 2
- Website: `https://ball46.com/` (existing Production web data, read-only from the app)
- Internal links: BALL46 domains and subdomains open in-app
- External links: device browser
- Android 15 / targetSdk 35: native root applies real system-bar and display-cutout insets to keep web content out of the status and navigation bars
- On phones (CSS viewport <= 760 px): the Android WebView injects one durable, app-scoped stylesheet hiding the mobile Favorite star controls, including on live card re-renders
- First paint is withheld until the app-scoped style has been installed to prevent star flicker over the consent dialog
- Desktop website, live score data, Signals, Full Market, Event Flow, member and Cloudflare Production settings are unchanged

## Validation

GitHub Actions workflow `.github/workflows/build-ball46-android-beta2.yml` compiles a debug APK and uploads an artifact only. It does not deploy or publish a release.

**Manual Android QA still required:** install on a device running Android 15 and test both website themes, opening and closing the Privacy/Consent dialog, switching live fixtures during several refresh cycles, status/navigation bar overlap, back navigation, and desktop behavior separately. An automated Gradle build is not proof that this visual QA passed.

Debug APK signing keys on separate GitHub Actions runners may differ. If upgrading from Beta 1 reports a signature mismatch, uninstall Beta 1 first (this may erase local app data) then install Beta 2.
