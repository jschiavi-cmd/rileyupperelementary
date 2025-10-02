// /scripts/firebase-sdk.js
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAUME3KPgg062UdnBdbgC0yhkcKJWzu448",
  authDomain: "riley-bmw-22879.firebaseapp.com",
  projectId: "riley-bmw-22879",
  storageBucket: "riley-bmw-22879.firebasestorage.app",
  messagingSenderId: "323090295177",
  appId: "1:323090295177:web:9fcaf4ed6cb98ccb639958"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);