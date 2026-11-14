const { getMobileFirebaseConfig } = require('./constants/firebaseConfig');

export default ({ config }) => ({
  ...config,
  owner: "sjroy5",
  name: "Route Logistics",
  slug: "route-logistics",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/brand/app-icon-ios.png",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  plugins: ["expo-font", "@react-native-community/datetimepicker", ["expo-location", {
    locationWhenInUsePermission: "Share your work location with your company during your on-duty shift.",
    locationAlwaysAndWhenInUsePermission: "Share your work location during an active shift, including when the app is in the background. End your shift to stop tracking.",
    isIosBackgroundLocationEnabled: true,
    isAndroidBackgroundLocationEnabled: true,
    isAndroidForegroundServiceEnabled: true
  }], ["expo-image-picker", {
    photosPermission: "Choose photos to document completed jobs.",
    cameraPermission: "Take photos to document completed jobs.",
    microphonePermission: false
  }]],
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff"
  },
  ios: {
    icon: "./assets/brand/app-icon-ios.png",
    buildNumber: "1",
    supportsTablet: true,
    bundleIdentifier: "com.workside.routelogistics",
    infoPlist: {
      "ITSAppUsesNonExemptEncryption": false
    }
  },
  android: {
    icon: "./assets/brand/app-icon-ios.png",
    adaptiveIcon: {
      foregroundImage: "./assets/brand/android-adaptive-foreground.png",
      monochromeImage: "./assets/brand/android-monochrome.png",
      backgroundColor: "#046A36"
    },
    edgeToEdgeEnabled: true,
    package: "com.workside.routelogistics"
  },
  web: {
    favicon: "./assets/favicon.png"
  },
  extra: {
    eas: {
      projectId: "a6b5d885-dd99-4435-bef0-b7ffe09a2890"
    },
    // Same validated public client configuration used by constants/firebase.js.
    firebase: getMobileFirebaseConfig()
  }
});
