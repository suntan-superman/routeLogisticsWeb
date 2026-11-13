const { getMobileFirebaseConfig } = require('./constants/firebaseConfig');

export default ({ config }) => ({
  ...config,
  owner: "sjroy5",
  name: "Route Logistics",
  slug: "route-logistics",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  plugins: ["expo-font", "@react-native-community/datetimepicker", ["expo-location", { locationWhenInUsePermission: "Share your location with your company only while you choose to work with this app open.", isIosBackgroundLocationEnabled: false, isAndroidBackgroundLocationEnabled: false, isAndroidForegroundServiceEnabled: false }], ["expo-image-picker", {
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
    buildNumber: "1",
    supportsTablet: true,
    bundleIdentifier: "com.workside.routelogistics",
    infoPlist: {
      "ITSAppUsesNonExemptEncryption": false
    }
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff"
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
