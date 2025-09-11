import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorMessage = document.getElementById('error-message');

// --- Función para redirigir al usuario según su rol ---
const redirectUserByRole = async (userId) => {
    try {
        const userDocRef = doc(db, "users", userId);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            const userData = userDoc.data();
            switch (userData.role) {
                case 'admin':
                    window.location.href = 'admin.html';
                    break;
                case 'restaurante':
                    window.location.href = 'restaurant.html';
                    break;
                case 'repartidor':
                    window.location.href = 'delivery.html';
                    break;
                default:
                    errorMessage.textContent = 'Rol de usuario no reconocido.';
            }
        } else {
            errorMessage.textContent = 'No se encontraron datos para este usuario.';
        }
    } catch (error) {
        errorMessage.textContent = 'Error al verificar el rol del usuario.';
    }
};

// --- Listener para el envío del formulario ---
loginForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const email = emailInput.value;
    const password = passwordInput.value;
    errorMessage.textContent = '';

    if (!email || !password) {
        errorMessage.textContent = 'Por favor, complete todos los campos.';
        return;
    }

    signInWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            // El observador onAuthStateChanged se encargará de la redirección
        })
        .catch((error) => {
            errorMessage.textContent = 'Error de autenticación. Verifique sus credenciales.';
            console.error("Firebase Auth Error:", error);
        });
});

// --- Observador para el estado de autenticación ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        redirectUserByRole(user.uid);
    } else {
        console.log("No hay usuario logueado.");
    }
});