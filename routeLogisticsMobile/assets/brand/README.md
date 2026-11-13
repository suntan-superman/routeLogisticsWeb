# Route Logistics mobile icons

Emerald background, pearlescent ivory route-shaped R. Artwork generated with the
built-in image_gen tool; store sizing, alpha-mask encoding and Android padding are
prepared by JavaScript using Expo's existing image utilities. Original app assets
are retained.

| File | Purpose | Format |
| --- | --- | --- |
| app-icon-ios.png | iOS/App Store master and legacy Android icon | 1024×1024 RGB PNG; no alpha channel |
| android-adaptive-foreground.png | Android adaptive foreground | 1024×1024 RGBA; transparent padding and negative space |
| android-monochrome.png | Android themed icon | Same alpha silhouette with white RGB |
| google-play-icon.png | Google Play listing upload | 512×512 RGBA PNG; 225,775 bytes |
| route-mark-source.png | Generated foreground source | Retained for reproducible exports |
| preview-android-circle.png | Circular launcher preview | Preview only; opaque gray surround |
| preview-android-rounded-square.png | Rounded-square launcher preview | Preview only; opaque gray surround |

The iOS and listing masters have square corners. System masks apply launcher
corners. Android foreground artwork is inset 132 pixels on a 1024 canvas; the
essential mark's maximum radius is 309.55 pixels, inside the 312.89-pixel safe
circle (66dp within a 108dp adaptive canvas). The adaptive background is #046A36.
Preview masks and backgrounds are not baked into production masters.

Both app.config.js and app.json reference these assets. Bundle/package identifier
com.workside.routelogistics and the existing EAS project are preserved.

Validation passed: resolved Expo configuration points to existing assets; Expo
Doctor 18/18; Expo's installed iOS icon generator emits a 1024 RGB AppIcon catalog
image without alpha; Android's generator emits five density folders and adaptive
XML with the monochrome layer. Native icon generation was checked in an ignored
scratch folder, without changing the application's native projects. Circular and
rounded-square launcher previews were inspected after alpha compositing.

Regenerate exports from the committed master/source, in routeLogisticsMobile:

```bash
node scripts/generate-app-icons.js
```

After pulling main on the Mac, run npm ci and npm run ios:prepare, open
ios/*.xcworkspace, clean the Xcode build folder and rebuild/run or archive. Expo
prebuild generates the native AppIcon catalog; Metro reload alone cannot change
the installed launcher icon. For Android, run npx expo prebuild --platform android
--no-install before the native build. Upload google-play-icon.png separately for
the Play listing. Native Xcode/Gradle builds and store acceptance remain to be
verified on the relevant build machines.

References:
[Expo icon configuration](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/),
[Apple app icon delivery](https://developer.apple.com/help/app-store-connect/manage-app-information/add-an-app-icon),
[Android adaptive icons](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive),
[Google Play icon format](https://developer.android.com/distribute/google-play/resources/icon-design-specifications).

## Final generation prompts

Master artwork:

```text
Use case: logo-brand. Asset type: finished production mobile app icon for Route Logistics, a professional field-service scheduling and routing app. Create one exquisitely polished square 1024x1024 icon. Edge-to-edge opaque deep emerald-green background with a very subtle rich emerald-to-forest tonal gradient, bright enough to stand out on a home screen. Center a single bold geometric capital R made as a smooth continuous ivory-white route ribbon: clearly readable R silhouette with generous rounded geometry, a precise circular route-node cutout in its bowl, and a clean diagonal lower leg suggesting forward movement. One unified sculptural mark, not several separate symbols. The white mark has restrained pearlescent liquid-glass edge highlights and gentle depth, with crisp almost-vector contours, exceptionally simple strong silhouette at 40px. Premium modern enterprise utility design. The mark occupies the central 60% of the square with generous even margin, no small details. Background fills the entire square; NO rounded outer corners or border, NO mockup, NO phone, NO inset icon tile, NO typography apart from the R-shaped emblem, NO words or company name, NO drop shadow outside the artwork, NO checkerboard or transparency. Avoid trucks, globes, buildings, busy maps, thin roads, complex gradients or tiny ornamental nodes. Full-bleed square opaque RGB artwork ready for an iOS App Store master icon.
```

Selected Android foreground source:

```text
Edit target: the attached Route Logistics app icon. Create the Android adaptive foreground layer by isolating ONLY the exact ivory-white sculptural R emblem from this image. Preserve its silhouette, circular cutout, route-shaped negative space, proportions, ivory tone and subtle pearlescent highlights. Remove ALL green background pixels and ALL external cast shadow; the background and all holes/negative spaces must be truly transparent. The white R must be completely unchanged, do not redraw a different letter, no extra symbols, no text. Keep a square canvas and center the R with generous transparent margins. This is a clean production cutout, not a checkerboard rendering and not a mockup.
```

