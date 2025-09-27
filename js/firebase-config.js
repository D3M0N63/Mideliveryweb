// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
// ---- LÍNEA NUEVA AÑADIDA ----
import { getStorage } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";

// Tu configuración de Firebase Web App
const firebaseConfig = {
  apiKey: "AIzaSyCUMoE_2vypwKDSjTgvTCf8RZ_SInbirZ4",
  authDomain: "mi-delivery-2b62c.firebaseapp.com",
  projectId: "mi-delivery-2b62c",
  storageBucket: "mi-delivery-2b62c.firebasestorage.app",
  messagingSenderId: "796070702650",
  appId: "1:796070702650:web:43977d02ec9485eb324f03"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
// ---- LÍNEA NUEVA AÑADIDA ----
const storage = getStorage(app); // Inicializa Firebase Storage

// Exporta los servicios para que otros archivos los puedan usar
export { db, auth, storage }; // <-- Añadido 'storage' a la exportación