import { db, auth } from './firebase-config.js';
import { collection, query, where, onSnapshot, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

const ordersContainer = document.getElementById('orders-container');
const availableTab = document.getElementById('availableTab');
const acceptedTab = document.getElementById('acceptedTab');
const logoutButton = document.getElementById('logoutButton');

let currentView = 'available'; // Vista por defecto

// --- Función para mostrar los pedidos en la UI ---
const renderOrders = (orders) => {
    ordersContainer.innerHTML = ''; // Limpiar la lista
    if (orders.length === 0) {
        ordersContainer.innerHTML = '<p class="no-orders">No hay pedidos en esta sección.</p>';
        return;
    }
    orders.forEach(order => {
        const card = document.createElement('div');
        card.className = 'order-card';
        card.innerHTML = `
            <h3>Pedido #${order.id.substring(0, 6)}</h3>
            <p><strong>Restaurante:</strong> ${order.restaurantName}</p>
            <p><strong>Destino:</strong> ${order.destinationAddress}</p>
            <p class="price">$${order.price.toFixed(2)}</p>
            <button class="action-btn" data-id="${order.id}" data-status="${order.status}">
                ${getButtonTextForStatus(order.status)}
            </button>
        `;
        ordersContainer.appendChild(card);
    });
};

// --- Función para obtener el texto del botón según el estado ---
const getButtonTextForStatus = (status) => {
    switch (status) {
        case 'available':
        case 'ready_for_pickup':
            return 'Aceptar Pedido';
        case 'accepted':
            return 'En Camino';
        case 'en_camino':
            return 'Recogido';
        case 'recogido':
            return 'Iniciar Navegación';
        default:
            return 'Ver Detalles';
    }
};

// --- Función para actualizar el estado de un pedido ---
const updateOrderStatus = async (orderId, currentStatus) => {
    let newStatus = '';
    switch (currentStatus) {
        case 'available':
        case 'ready_for_pickup':
            newStatus = 'accepted';
            break;
        case 'accepted':
            newStatus = 'en_camino';
            break;
        case 'en_camino':
            newStatus = 'recogido';
            break;
        case 'recogido':
            newStatus = 'completed'; // Asumimos que la navegación es el paso final
            break;
        default:
            return;
    }

    const orderRef = doc(db, 'orders', orderId);
    try {
        await updateDoc(orderRef, { status: newStatus });
        alert(`Pedido actualizado a: ${newStatus}`);
    } catch (e) {
        console.error("Error al actualizar el pedido: ", e);
        alert("No se pudo actualizar el pedido.");
    }
};

// --- Lógica para manejar clics en los botones de acción ---
ordersContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('action-btn')) {
        const orderId = e.target.dataset.id;
        const status = e.target.dataset.status;
        if (status === 'recogido') {
            // Lógica de navegación (abrir Google Maps)
            const orderCard = e.target.closest('.order-card');
            // Necesitamos obtener latitud y longitud, asumimos que están en el objeto order
            // Esto requeriría una búsqueda del pedido completo si no se almacena en el DOM
            alert("Redirigiendo a Google Maps...");
        } else {
            updateOrderStatus(orderId, status);
        }
    }
});


// --- Escuchar cambios en la colección de pedidos ---
const listenToOrders = (userId) => {
    const q = query(collection(db, "orders"));
    onSnapshot(q, (querySnapshot) => {
        const allOrders = [];
        querySnapshot.forEach((doc) => {
            allOrders.push({ id: doc.id, ...doc.data() });
        });

        // Filtrar pedidos según la vista actual
        let filteredOrders;
        if (currentView === 'available') {
            filteredOrders = allOrders.filter(o => o.status === 'available' || o.status === 'ready_for_pickup');
        } else {
            // En "Aceptados" mostramos los que no están disponibles ni completados
            filteredOrders = allOrders.filter(o => o.status !== 'available' && o.status !== 'ready_for_pickup' && o.status !== 'completed');
        }
        renderOrders(filteredOrders);
    });
};

// --- Control de Pestañas ---
availableTab.addEventListener('click', () => {
    currentView = 'available';
    availableTab.classList.add('active');
    acceptedTab.classList.remove('active');
    listenToOrders(auth.currentUser.uid); // Recargar datos para la nueva vista
});

acceptedTab.addEventListener('click', () => {
    currentView = 'accepted';
    acceptedTab.classList.add('active');
    availableTab.classList.remove('active');
    listenToOrders(auth.currentUser.uid); // Recargar datos para la nueva vista
});

// --- Autenticación y cierre de sesión ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        listenToOrders(user.uid);
    } else {
        window.location.href = 'index.html';
    }
});

logoutButton.addEventListener('click', () => {
    signOut(auth).catch((error) => console.error("Error al cerrar sesión:", error));
});