import { auth, db } from './firebase-config.js'; 
import { supabase } from './supabase-config.js';
import { collection, query, where, onSnapshot, doc, updateDoc, addDoc, getDoc, serverTimestamp, deleteDoc, orderBy, GeoPoint } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

let currentUserId = null;
let products = [];
let selectedItems = [];
let restaurantLocationUrl = '';
let profilePictureFile = null;
let productPictureFile = null;

// --- Autenticación y Carga Inicial ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserId = user.uid;
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().role === 'restaurante') {
            const userData = userDoc.data();
            restaurantLocationUrl = userData.locationUrl || '';
            document.getElementById('restaurant-name').textContent = userData.nombreRestaurante || "Mi Restaurante";
            setupTabs();
            loadRestaurantData();
        } else {
            alert("Acceso denegado.");
            window.location.href = 'index.html';
        }
    } else {
        window.location.href = 'index.html';
    }
});

function loadRestaurantData() {
    listenToWebOrders(); 
    listenToProducts();
    listenToOrders();
    loadProfile();
    setupCreateOrderForm();
    setupModalListeners();
}

// --- Pestañas ---
function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const views = document.querySelectorAll('.view');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const targetViewId = 'view-' + tab.id.split('-')[1];
            views.forEach(view => {
                view.style.display = view.id === targetViewId ? 'block' : 'none';
            });
        });
    });
    document.getElementById('view-web').style.display = 'block';
    document.getElementById('btn-web').classList.add('active');
}

// --- Pedidos Web ---
function listenToWebOrders() {
    const container = document.getElementById('web-orders-container');
    const q = query(collection(db, "pedidos"), where("restauranteId", "==", null), where("estado", "==", "Pendiente"));

    onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = '<p class="card">No hay nuevos pedidos de la web por el momento.</p>';
            return;
        }
        snapshot.forEach(docSnap => {
            const order = { id: docSnap.id, ...docSnap.data() };
            const card = document.createElement('div');
            card.className = 'order-card';
            const itemsList = (order.items || []).map(item => `<li>${item.cantidad}x ${item.nombre}</li>`).join('');
            card.innerHTML = `
                <h3>Pedido para: ${order.nombreCliente}</h3>
                <p><strong>Dirección:</strong> ${order.direccionCliente}</p>
                <p><strong>Total:</strong> ₲ ${(order.total || 0).toLocaleString('es-PY')}</p>
                <ul>${itemsList}</ul>
                <button class="action-btn accept-order-btn" data-id="${order.id}">Aceptar Pedido</button>
            `;
            container.appendChild(card);
        });
        container.querySelectorAll('.accept-order-btn').forEach(btn => {
            btn.onclick = () => acceptOrder(btn.dataset.id);
        });
    });
}

async function acceptOrder(orderId) {
    const orderRef = doc(db, "pedidos", orderId);
    try {
        const orderDoc = await getDoc(orderRef);
        if (orderDoc.exists() && orderDoc.data().restauranteId) {
            alert("Este pedido ya fue tomado por otro restaurante.");
            return;
        }
        await updateDoc(orderRef, {
            restauranteId: currentUserId,
            estado: "available",
            direccionRestaurante: restaurantLocationUrl
        });
        alert("¡Pedido aceptado! Ahora lo encontrarás en tu historial.");
    } catch (error) {
        console.error("Error al aceptar el pedido: ", error);
        alert("Hubo un error al intentar aceptar el pedido.");
    }
}


// --- Gestión de Productos ---
function listenToProducts() {
    const q = query(collection(db, `users/${currentUserId}/productos`));
    onSnapshot(q, (snapshot) => {
        products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderProductsList();
        populateProductSpinners();
    });
}

function renderProductsList() {
    const container = document.getElementById('products-list-container');
    container.innerHTML = '<h3>Mis Productos</h3>';
    if (products.length === 0) {
        container.innerHTML += '<p>No tienes productos registrados.</p>';
        return;
    }
    products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'user-card';
        card.innerHTML = `
            <img class="product-list-image" src="${p.photoURL || 'https://via.placeholder.com/80'}" alt="${p.nombre}">
            <div class="product-info">
                <p><strong>${p.nombre}</strong></p>
                <p>₲ ${p.precio.toLocaleString('es-PY')} (${p.categoria})</p>
            </div>
            <div class="product-actions">
                <button class="action-btn-small edit" data-id="${p.id}">Editar</button>
                <button class="action-btn-small delete" data-id="${p.id}">Eliminar</button>
            </div>
        `;
        container.appendChild(card);
    });
    container.querySelectorAll('.edit').forEach(btn => btn.onclick = () => editProduct(btn.dataset.id));
    container.querySelectorAll('.delete').forEach(btn => btn.onclick = () => deleteProduct(btn.dataset.id));
}

document.getElementById('product-image-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        productPictureFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('product-image-preview').src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
});

// 👇 FUNCIÓN MODIFICADA 👇
document.getElementById('save-product-btn').addEventListener('click', async () => {
    const id = document.getElementById('product-id').value;
    const nombre = document.getElementById('product-name').value.trim();
    const precio = parseFloat(document.getElementById('product-price').value);
    const categoria = document.getElementById('product-category').value;
    
    if (!nombre || isNaN(precio)) {
        alert("Por favor, completa el nombre y el precio del producto.");
        return;
    }

    try {
        let photoURL = null;
        if (productPictureFile) {
            console.log("Iniciando subida de imagen de producto...");
            const fileName = `product-images/${currentUserId}-${Date.now()}`;
            const { data: uploadData, error: uploadError } = await supabase.storage.from('Midelivery').upload(fileName, productPictureFile, {
                contentType: productPictureFile.type
            });

            console.log("Respuesta de Supabase (upload):", { uploadData, uploadError });
            if (uploadError) throw uploadError;

            console.log("Obteniendo URL pública...");
            const { data: urlData } = supabase.storage.from('Midelivery').getPublicUrl(fileName);
            
            console.log("Respuesta de Supabase (getPublicUrl):", urlData);
            photoURL = urlData.publicUrl;
        }

        const productData = { nombre, precio, categoria };
        if (photoURL) {
            productData.photoURL = photoURL;
        } else if (id) {
            // Mantener la foto anterior si no se sube una nueva al editar
            const existingProduct = products.find(p => p.id === id);
            productData.photoURL = existingProduct?.photoURL || null;
        }

        console.log("Datos a guardar en Firebase:", productData);

        if (id) {
            await updateDoc(doc(db, `users/${currentUserId}/productos`, id), productData);
        } else {
            await addDoc(collection(db, `users/${currentUserId}/productos`), productData);
        }

        alert(id ? "Producto actualizado." : "Producto añadido.");
        resetProductForm();

    } catch (e) {
        console.error("Error guardando producto: ", e);
        alert(`No se pudo guardar el producto. Error: ${e.message}`);
    }
});


function editProduct(id) {
    const product = products.find(p => p.id === id);
    if (product) {
        document.getElementById('product-id').value = product.id;
        document.getElementById('product-name').value = product.nombre;
        document.getElementById('product-price').value = product.precio;
        document.getElementById('product-category').value = product.categoria;
        document.getElementById('product-image-preview').src = product.photoURL || 'https://via.placeholder.com/150';
        
        document.getElementById('cancel-edit-btn').style.display = 'inline-block';
        document.getElementById('product-form').scrollIntoView({ behavior: 'smooth' });
    }
}

async function deleteProduct(id) {
    if (confirm("¿Estás seguro de que quieres eliminar este producto?")) {
        try {
            await deleteDoc(doc(db, `users/${currentUserId}/productos`, id));
            alert("Producto eliminado.");
        } catch(e) {
            alert("Error al eliminar producto.");
        }
    }
}

document.getElementById('cancel-edit-btn').addEventListener('click', resetProductForm);

function resetProductForm() {
    document.getElementById('product-form').reset();
    document.getElementById('product-id').value = '';
    document.getElementById('cancel-edit-btn').style.display = 'none';
    document.getElementById('product-image-preview').src = 'https://via.placeholder.com/150';
    productPictureFile = null;
}


// --- Creación de Pedidos ---
function populateProductSpinners() {
    const productsSpinner = document.getElementById('products-spinner');
    const drinksSpinner = document.getElementById('drinks-spinner');
    productsSpinner.innerHTML = '<option value="">Selecciona un producto...</option>';
    drinksSpinner.innerHTML = '<option value="">Selecciona una bebida...</option>';
    products.forEach(p => {
        const option = new Option(`${p.nombre} - ₲ ${p.precio.toLocaleString('es-PY')}`, p.id);
        if (p.categoria === 'Producto') {
            productsSpinner.add(option);
        } else {
            drinksSpinner.add(option);
        }
    });
}

function setupCreateOrderForm() {
    document.getElementById('add-product-btn').onclick = () => {
        const id = document.getElementById('products-spinner').value;
        const quantity = parseInt(document.getElementById('product-quantity').value);
        addItemToOrder(id, quantity);
    };
    document.getElementById('add-drink-btn').onclick = () => {
        const id = document.getElementById('drinks-spinner').value;
        const quantity = parseInt(document.getElementById('drink-quantity').value);
        addItemToOrder(id, quantity);
    };
    document.getElementById('delivery-cost').oninput = updateTotal;
    document.getElementById('createOrderButton').onclick = createOrder;
}

function addItemToOrder(productId, quantity) {
    if (!productId || isNaN(quantity) || quantity <= 0) return;
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const existingItem = selectedItems.find(item => item.id === productId);
    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        selectedItems.push({ ...product, quantity });
    }
    renderSelectedItems();
    updateTotal();
}

function renderSelectedItems() {
    const container = document.getElementById('selected-items-container');
    container.innerHTML = '';
    selectedItems.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'selected-item';
        itemDiv.innerHTML = `
            <span>${item.quantity}x ${item.nombre}</span>
            <span>₲ ${(item.precio * item.quantity).toLocaleString('es-PY')}</span>
            <button class="remove-item-btn" data-index="${index}">&times;</button>
        `;
        container.appendChild(itemDiv);
    });
    container.querySelectorAll('.remove-item-btn').forEach(btn => {
        btn.onclick = () => {
            selectedItems.splice(btn.dataset.index, 1);
            renderSelectedItems();
            updateTotal();
        };
    });
}

function updateTotal() {
    const subtotal = selectedItems.reduce((sum, item) => sum + (item.precio * item.quantity), 0);
    const deliveryCost = parseFloat(document.getElementById('delivery-cost').value) || 0;
    const total = subtotal + deliveryCost;
    document.getElementById('total-display').textContent = `Total: ₲ ${total.toLocaleString('es-PY')}`;
}

async function createOrder() {
    const formError = document.getElementById('form-error');
    formError.textContent = '';
    const nombreCliente = document.getElementById('customer-name').value.trim();
    const direccionCliente = document.getElementById('delivery-address').value.trim();
    const costoDelivery = parseFloat(document.getElementById('delivery-cost').value);
    if (!nombreCliente || !direccionCliente || isNaN(costoDelivery) || selectedItems.length === 0) {
        formError.textContent = 'Completa todos los campos y añade al menos un producto.';
        return;
    }
    const subtotal = selectedItems.reduce((sum, item) => sum + (item.precio * item.quantity), 0);
    const total = subtotal + costoDelivery;
    const metodoPago = document.querySelector('input[name="payment"]:checked').value;
    const nuevoPedido = {
        nombreCliente,
        direccionCliente,
        telefonoCliente: document.getElementById('customer-phone').value.trim(),
        costoDelivery,
        total,
        restauranteId: currentUserId,
        direccionRestaurante: restaurantLocationUrl,
        estado: "Pendiente",
        timestamp: serverTimestamp(),
        metodoPago,
        items: selectedItems.map(item => ({ nombre: item.nombre, cantidad: item.quantity, precio: item.precio }))
    };
    try {
        await addDoc(collection(db, "pedidos"), nuevoPedido);
        alert("Pedido creado con éxito.");
        document.getElementById('create-order-form').reset();
        selectedItems = [];
        renderSelectedItems();
        updateTotal();
    } catch (e) {
        console.error("Error al crear el pedido: ", e);
        formError.textContent = "No se pudo crear el pedido.";
    }
}


// --- Historial de Pedidos ---
function listenToOrders() {
    const container = document.getElementById('restaurant-orders-container');
    const q = query(collection(db, "pedidos"), where("restauranteId", "==", currentUserId), orderBy("timestamp", "desc"));
    onSnapshot(q, (snapshot) => {
        container.innerHTML = '<h3>Mis Pedidos Asignados</h3>';
        if (snapshot.empty) {
            container.innerHTML += '<p>Aún no tienes pedidos asignados.</p>';
            return;
        }
        snapshot.forEach(docSnap => {
            const order = { id: docSnap.id, ...docSnap.data() };
            const card = document.createElement('div');
            card.className = 'order-card';
            const orderDate = order.timestamp ? order.timestamp.toDate().toLocaleString('es-ES') : 'Fecha no disponible';
            card.innerHTML = `
                <h4>Pedido para: ${order.nombreCliente}</h4>
                <p><strong>Total:</strong> ₲ ${(order.total || 0).toLocaleString('es-PY')}</p>
                <p><strong>Estado:</strong> <span class="status status-${(order.estado || 'pendiente').toLowerCase().replace(/ /g, '_')}">${order.estado}</span></p>
                <small>${orderDate}</small>
                <button class="action-btn" data-id="${order.id}">Ver Detalles</button>
            `;
            container.appendChild(card);
        });
        container.querySelectorAll('.action-btn').forEach(btn => {
            btn.onclick = () => showOrderDetails(btn.dataset.id);
        });
    });
}

// --- Modales (Detalles y Edición de Pedidos) ---
function setupModalListeners() {
    const detailModal = document.getElementById('order-detail-modal');
    const editModal = document.getElementById('edit-order-modal');
    detailModal.querySelector('.close-button').onclick = () => detailModal.style.display = 'none';
    editModal.querySelector('.close-button-edit').onclick = () => editModal.style.display = 'none';
    window.onclick = (event) => {
        if (event.target == detailModal) detailModal.style.display = 'none';
        if (event.target == editModal) editModal.style.display = 'none';
    };
}

async function showOrderDetails(orderId) {
    const detailModal = document.getElementById('order-detail-modal');
    const docSnap = await getDoc(doc(db, "pedidos", orderId));
    if (docSnap.exists()) {
        const order = {id: docSnap.id, ...docSnap.data()};
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = `
            <div class="detail-section">
                <p class="detail-label">Cliente:</p>
                <p class="detail-value">${order.nombreCliente}</p>
            </div>
            <div class="detail-section">
                <p class="detail-label">Teléfono:</p>
                <p class="detail-value">${order.telefonoCliente || 'N/A'}</p>
            </div>
            <div class="detail-section">
                <p class="detail-label">Dirección:</p>
                <p class="detail-value">${order.direccionCliente}</p>
            </div>
            <div class="detail-section">
                <p class="detail-label">Estado Actual:</p>
                <p class="detail-value"><span class="status status-${(order.estado || 'pendiente').toLowerCase().replace(/ /g, '_')}">${order.estado}</span></p>
            </div>
            <h4 class="items-title">Items del Pedido:</h4>
            <ul class="items-list">
                ${(order.items || []).map(item => `<li>${item.cantidad}x ${item.nombre} <span>₲ ${(item.precio * item.cantidad).toLocaleString('es-PY')}</span></li>`).join('')}
            </ul>
            <div class="detail-section total-section">
                <p class="detail-label">Total:</p>
                <p class="detail-value total-value">₲ ${(order.total || 0).toLocaleString('es-PY')}</p>
            </div>
        `;
        detailModal.style.display = 'flex';
        document.getElementById('edit-order-info-btn').onclick = () => showEditOrderModal(order);
        document.getElementById('manage-status-btn').onclick = () => manageOrderStatus(order);
    }
}

function showEditOrderModal(order) {
    const editModal = document.getElementById('edit-order-modal');
    document.getElementById('edit-order-id').value = order.id;
    document.getElementById('edit-customer-name').value = order.nombreCliente;
    document.getElementById('edit-customer-phone').value = order.telefonoCliente;
    document.getElementById('edit-delivery-address').value = order.direccionCliente;
    document.getElementById('edit-delivery-cost').value = order.costoDelivery;
    editModal.style.display = 'flex';
    document.getElementById('save-order-changes-btn').onclick = async () => {
        const orderId = document.getElementById('edit-order-id').value;
        const subtotal = (order.total || 0) - (order.costoDelivery || 0);
        const newDeliveryCost = parseFloat(document.getElementById('edit-delivery-cost').value) || 0;
        const updates = {
            nombreCliente: document.getElementById('edit-customer-name').value,
            telefonoCliente: document.getElementById('edit-customer-phone').value,
            direccionCliente: document.getElementById('edit-delivery-address').value,
            costoDelivery: newDeliveryCost,
            total: subtotal + newDeliveryCost
        };
        await updateDoc(doc(db, 'pedidos', orderId), updates);
        alert("Pedido actualizado.");
        editModal.style.display = 'none';
        document.getElementById('order-detail-modal').style.display = 'none';
    };
}

async function manageOrderStatus(order) {
    const action = prompt("Elige una acción: 'listo', 'en camino', 'entregado', 'cancelar' o 'eliminar'");
    if (!action) return;
    const actionLower = action.toLowerCase();
    if (actionLower === 'eliminar') {
        if (confirm("¿Estás seguro de ELIMINAR este pedido? La acción es permanente.")) {
            await deleteDoc(doc(db, 'pedidos', order.id));
            alert("Pedido eliminado.");
            document.getElementById('order-detail-modal').style.display = 'none';
        }
        return;
    }
    let nuevoEstado = '';
    switch(actionLower) {
        case 'listo': nuevoEstado = 'available'; break;
        case 'en camino': nuevoEstado = 'En camino'; break;
        case 'entregado': nuevoEstado = 'Entregado'; break;
        case 'cancelar': nuevoEstado = 'Cancelado'; break;
        default: alert("Acción no válida."); return;
    }
    await updateDoc(doc(db, 'pedidos', order.id), { estado: nuevoEstado });
    alert(`Estado del pedido actualizado a: ${nuevoEstado}`);
    document.getElementById('order-detail-modal').style.display = 'none';
}


// --- SECCIÓN DE PERFIL ---
async function loadProfile() {
    const docSnap = await getDoc(doc(db, "users", currentUserId));
    if (docSnap.exists()) {
        const userData = docSnap.data();
        document.getElementById('profile-name').value = userData.nombreRestaurante || '';
        document.getElementById('profile-location-url').value = userData.locationUrl || '';
        
        if (userData.photoURL) {
            document.getElementById('profile-picture-preview').src = userData.photoURL;
        }

        if (userData.coordenadas) {
            const lat = userData.coordenadas.latitude;
            const lon = userData.coordenadas.longitude;
            document.getElementById('profile-coordinates').value = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
        }
    }
}

document.getElementById('profile-picture-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        profilePictureFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('profile-picture-preview').src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
});

document.getElementById('get-location-btn').addEventListener('click', () => {
    const feedback = document.getElementById('location-feedback');
    if (!navigator.geolocation) {
        feedback.textContent = 'Tu navegador no soporta geolocalización.';
        return;
    }

    feedback.textContent = 'Obteniendo ubicación...';
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            document.getElementById('profile-coordinates').value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            feedback.textContent = '¡Ubicación obtenida! Presiona "Guardar Perfil" para almacenarla.';
        },
        () => {
            feedback.textContent = 'No se pudo obtener la ubicación. Revisa los permisos.';
        }
    );
});

// 👇 FUNCIÓN MODIFICADA 👇
document.getElementById('save-profile-btn').addEventListener('click', async () => {
    const saveButton = document.getElementById('save-profile-btn');
    saveButton.textContent = 'Guardando...';
    saveButton.disabled = true;

    try {
        let photoURL = null;
        if (profilePictureFile) {
            console.log("Iniciando subida de foto de perfil...");
            const fileName = `${currentUserId}-${Date.now()}`;
            const { data: uploadData, error: uploadError } = await supabase
                .storage
                .from('Midelivery')
                .upload(fileName, profilePictureFile, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: profilePictureFile.type
                });
            
            console.log("Respuesta de Supabase (upload):", { uploadData, uploadError });
            if (uploadError) throw uploadError;

            console.log("Obteniendo URL pública del perfil...");
            const { data: urlData } = supabase
                .storage
                .from('Midelivery')
                .getPublicUrl(fileName);
            
            console.log("Respuesta de Supabase (getPublicUrl):", urlData);
            photoURL = urlData.publicUrl;
        }

        const nombre = document.getElementById('profile-name').value.trim();
        const url = document.getElementById('profile-location-url').value.trim();
        const coordsString = document.getElementById('profile-coordinates').value.trim();

        const updates = {
            nombreRestaurante: nombre,
            locationUrl: url
        };

        if (photoURL) {
            updates.photoURL = photoURL;
        }

        if (coordsString) {
            const [lat, lon] = coordsString.split(',').map(Number);
            if (!isNaN(lat) && !isNaN(lon)) {
                updates.coordenadas = new GeoPoint(lat, lon);
            }
        }
        
        console.log("Datos de perfil a actualizar en Firebase:", updates);
        await updateDoc(doc(db, "users", currentUserId), updates);
        alert("Perfil actualizado con éxito.");
        profilePictureFile = null;

    } catch (error) {
        console.error("Error al actualizar el perfil: ", error);
        alert(`No se pudo actualizar el perfil. Error: ${error.message}`);
    } finally {
        saveButton.textContent = 'Guardar Perfil';
        saveButton.disabled = false;
    }
});


// --- Cierre de Sesión ---
document.getElementById('logoutButton').addEventListener('click', () => {
    signOut(auth).catch(error => console.error("Error al cerrar sesión:", error));
});