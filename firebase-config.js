// Importa las funciones que necesitas de los SDKs que necesitas
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// TODO: Reemplaza lo siguiente con la configuración de tu propio proyecto de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCUMoE_2vypwKDSjTgvTCf8RZ_SInbirZ4",
  authDomain: "mi-delivery-2b62c.firebaseapp.com",
  projectId: "mi-delivery-2b62c",
  storageBucket: "mi-delivery-2b62c.firebasestorage.app",
  messagingSenderId: "796070702650",
  appId: "1:796070702650:web:43977d02ec9485eb324f03"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Exporta las instancias para usarlas en otros archivos
export { db, auth };