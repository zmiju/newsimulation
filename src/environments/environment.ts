export const environment = {
  production: false,
  firebase: {
    apiKey: "AIzaSyCF3FAqgCvaHOaLWkHLVuHEM5igLIPokMk",
    authDomain: "agile-game.firebaseapp.com",
    databaseURL: "https://agile-game-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "agile-game",
    storageBucket: "agile-game.appspot.com",
    messagingSenderId: "586809061808",
    appId: "1:586809061808:web:829b7821c323bb8808e675",
    measurementId: "G-LKT82WL19R"
  },
  // reCAPTCHA v3 site key for Firebase App Check.
  // Register the web app in Firebase console -> App Check -> reCAPTCHA v3
  // and paste the site key here. Leave empty to skip App Check init.
  appCheckRecaptchaSiteKey: "",
  // When true, FirebaseService sets self.FIREBASE_APPCHECK_DEBUG_TOKEN = true
  // so the SDK prints a debug token in the browser console that you can
  // register in Firebase console -> App Check -> Apps -> Manage debug tokens.
  appCheckDebug: true,
};
