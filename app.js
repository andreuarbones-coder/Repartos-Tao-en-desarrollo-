// Captura global de errores
window.addEventListener('error', function (e) {
    console.error('Error capturado:', e.error);
    alert('Error inesperado en la aplicación: ' + (e.error?.message || e.message));
});

(function () {
    console.log('Iniciando aplicación...');

    // --- Configuración de Firebase ---
    const firebaseConfig = {
        apiKey: "AIzaSyD4iPoxUkrOWdyWkMDnOSdoDJNg96SUKTs",
        authDomain: "repartos-tao.firebaseapp.com",
        projectId: "repartos-tao",
        storageBucket: "repartos-tao.firebasestorage.app",
        messagingSenderId: "794636373269",
        appId: "1:794636373269:web:12bb9f59b8fc50fe79ad1c"
    };

    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const storage = firebase.storage();

    // Persistencia offline
    db.enablePersistence({ synchronizeTabs: true }).catch(err => console.warn('Persistencia:', err));

    // Colecciones
    const refs = {
        customers: db.collection('customers'),
        products: db.collection('products'),
        orders: db.collection('orders')
    };

    // --- Estado Centralizado ---
    const state = {
        customers: [],
        products: [],
        orders: [],
        currentView: 'orders',
        // Para paginación
        pagination: {
            orders: { lastVisible: null, hasMore: true, pageSize: 50 },
            customers: { lastVisible: null, hasMore: true, pageSize: 50 },
            products: { lastVisible: null, hasMore: true, pageSize: 50 }
        }
    };

    // --- Utilidades DOM & Seguridad ---
    const getEl = (id) => document.getElementById(id);
    const loader = getEl('globalLoader');

    // Helper contra XSS
    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/[&<>'"]/g, match => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[match]));
    }

    // Wrapper para operaciones asíncronas
    async function withLoader(actionMsg, asyncFunc) {
        if (loader) loader.classList.remove('hidden');
        try {
            await asyncFunc();
        } catch (e) {
            console.error(`Error en [${actionMsg}]:`, e);
            alert(`Error: ${actionMsg}. Revisá la consola.`);
        } finally {
            if (loader) loader.classList.add('hidden');
        }
    }

    // --- Inicialización y Cargas ---
    function loadInitialData() {
        return Promise.all([
            loadMoreCustomers(true),
            loadMoreProducts(true),
            loadMoreOrders(true)
        ]);
    }

    async function loadMoreOrders(reset = false) {
        let query = refs.orders.orderBy('date', 'desc').limit(state.pagination.orders.pageSize);
        if (!reset && state.pagination.orders.lastVisible) {
            query = query.startAfter(state.pagination.orders.lastVisible);
        }
        const snap = await query.get();
        const newOrders = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (reset) {
            state.orders = newOrders;
        } else {
            state.orders = [...state.orders, ...newOrders];
        }
        state.pagination.orders.lastVisible = snap.docs[snap.docs.length - 1];
        state.pagination.orders.hasMore = snap.docs.length === state.pagination.orders.pageSize;
        if(state.currentView === 'orders') renderOrders();
    }

    async function loadMoreCustomers(reset = false) {
        let query = refs.customers.orderBy('name').limit(state.pagination.customers.pageSize);
        if (!reset && state.pagination.customers.lastVisible) {
            query = query.startAfter(state.pagination.customers.lastVisible);
        }
        const snap = await query.get();
        const newCustomers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (reset) {
            state.customers = newCustomers;
        } else {
            state.customers = [...state.customers, ...newCustomers];
        }
        state.pagination.customers.lastVisible = snap.docs[snap.docs.length - 1];
        state.pagination.customers.hasMore = snap.docs.length === state.pagination.customers.pageSize;
        if(state.currentView === 'customers') renderCustomers();
    }

    async function loadMoreProducts(reset = false) {
        let query = refs.products.orderBy('name').limit(state.pagination.products.pageSize);
        if (!reset && state.pagination.products.lastVisible) {
            query = query.startAfter(state.pagination.products.lastVisible);
        }
        const snap = await query.get();
        const newProducts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (reset) {
            state.products = newProducts;
        } else {
            state.products = [...state.products, ...newProducts];
        }
        state.pagination.products.lastVisible = snap.docs[snap.docs.length - 1];
        state.pagination.products.hasMore = snap.docs.length === state.pagination.products.pageSize;
        if(state.currentView === 'products') renderProductsList();
        updateProductDatalist();
    }

    // --- Suscripciones en tiempo real usando docChanges() ---
    function subscribeToCustomers() {
        refs.customers.orderBy('name').limit(50).onSnapshot(snap => {
            let hasChanges = false;
            snap.docChanges().forEach(change => {
                const data = { id: change.doc.id, ...change.doc.data() };
                if (change.type === 'added') {
                    if (!state.customers.some(c => c.id === data.id)) state.customers.unshift(data);
                } else if (change.type === 'modified') {
                    const idx = state.customers.findIndex(c => c.id === data.id);
                    if (idx !== -1) state.customers[idx] = data;
                } else if (change.type === 'removed') {
                    state.customers = state.customers.filter(c => c.id !== data.id);
                }
                hasChanges = true;
            });
            if (hasChanges && state.currentView === 'customers') renderCustomers();
        }, err => console.error('Error suscripción customers:', err));
    }

    function subscribeToProducts() {
        refs.products.orderBy('name').limit(50).onSnapshot(snap => {
            let hasChanges = false;
            snap.docChanges().forEach(change => {
                const data = { id: change.doc.id, ...change.doc.data() };
                if (change.type === 'added') {
                    if (!state.products.some(p => p.id === data.id)) state.products.unshift(data);
                } else if (change.type === 'modified') {
                    const idx = state.products.findIndex(p => p.id === data.id);
                    if (idx !== -1) state.products[idx] = data;
                } else if (change.type === 'removed') {
                    state.products = state.products.filter(p => p.id !== data.id);
                }
                hasChanges = true;
            });
            if (hasChanges) {
                if (state.currentView === 'products') renderProductsList();
                updateProductDatalist();
            }
        }, err => console.error('Error suscripción products:', err));
    }

    function subscribeToOrders() {
        refs.orders.orderBy('date', 'desc').limit(50).onSnapshot(snap => {
            let hasChanges = false;
            snap.docChanges().forEach(change => {
                const data = { id: change.doc.id, ...change.doc.data() };
                if (change.type === 'added') {
                    // Evitar duplicar los que ya cargó la consulta manual initialData
                    if (!state.orders.some(o => o.id === data.id)) state.orders.unshift(data);
                } else if (change.type === 'modified') {
                    const idx = state.orders.findIndex(o => o.id === data.id);
                    if (idx !== -1) state.orders[idx] = data;
                } else if (change.type === 'removed') {
                    state.orders = state.orders.filter(o => o.id !== data.id);
                }
                hasChanges = true;
            });
            if (hasChanges && state.currentView === 'orders') renderOrders();
        }, err => console.error('Error suscripción orders:', err));
    }

    function startSubscriptions() {
        subscribeToCustomers();
        subscribeToProducts();
        subscribeToOrders();
    }

    async function initApp() {
        await withLoader('Cargando datos iniciales', async () => {
            await loadInitialData();
            startSubscriptions();
            setActiveView('orders');
        });
    }

    // --- Navegación ---
    function setActiveView(view) {
        state.currentView = view;
        document.querySelectorAll('.views-container > div').forEach(div => div.classList.remove('active-view'));
        const viewEl = getEl(`view-${view}`);
        if (viewEl) viewEl.classList.add('active-view');

        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.nav-btn[data-view="${view}"]`);
        if (activeBtn) activeBtn.classList.add('active');

        renderView(view);
    }

    // --- Vistas ---
    function renderView(view) {
        if (view === 'orders') renderOrders();
        else if (view === 'customers') renderCustomers();
        else if (view === 'products') renderProductsList();
    }

    // --- Render Orders ---
    function renderOrders() {
        const ordersListDiv = getEl('ordersList');
        if (!ordersListDiv) return;

        const filterText = getEl('searchOrders')?.value.toLowerCase() || '';
        const filterStatus = getEl('statusFilter')?.value || 'todos';
        const from = getEl('dateFrom')?.value || '';
        const to = getEl('dateTo')?.value || '';

        let filtered = state.orders.filter(o => {
            if (filterStatus !== 'todos' && o.status !== filterStatus) return false;
            const d = o.date ? o.date.split('T')[0] : '';
            if (from && d < from) return false;
            if (to && d > to) return false;
            if (filterText) {
                // Búsqueda optimizada por index
                if (o.searchIndex) {
                    return o.searchIndex.includes(filterText);
                } else {
                    // Fallback a mapeo en vivo para pedidos antiguos
                    const c = state.customers.find(c => c.id === o.customerId) || {};
                    const txt = `${c.name} ${c.phone || ''} ${c.address || ''} ${c.email || ''} ${o.comments || ''} ${o.items.map(i => i.productName).join(' ')}`.toLowerCase();
                    return txt.includes(filterText);
                }
            }
            return true;
        });

        if (!filtered.length) {
            ordersListDiv.innerHTML = '<p class="card">No hay pedidos.</p>';
            return;
        }

        let html = '<table><thead><tr><th>Fecha</th><th>Cliente</th><th>Estado</th><th>Productos</th><th>Comentarios</th><th>Acciones</th></tr></thead><tbody>';
        filtered.forEach(o => {
            const c = state.customers.find(c => c.id === o.customerId) || { name: '?' };
            const itemsHtml = o.items.map(i => `<li>${escapeHTML(i.productName)} x${i.quantity} ($${i.price})</li>`).join('');
            html += `<tr>
                <td data-label="Fecha">${escapeHTML(o.date ? new Date(o.date).toLocaleString() : '')}</td>
                <td data-label="Cliente">${escapeHTML(c.name)}</td>
                <td data-label="Estado">
                    <span class="badge ${o.status}" data-action="toggle-status" data-id="${o.id}">${o.status}</span>
                    <div class="status-menu hidden" id="status-menu-${o.id}">
                        <button data-status="pendiente" data-id="${o.id}">Pendiente</button>
                        <button data-status="entregado" data-id="${o.id}">Entregado</button>
                        <button data-status="incompleto" data-id="${o.id}">Incompleto</button>
                    </div>
                </td>
                <td data-label="Productos"><ul class="product-list">${itemsHtml}</ul></td>
                <td data-label="Comentarios">${escapeHTML(o.comments)}</td>
                <td class="actions-cell" data-label="Acciones">
                    <button class="icon-btn" data-action="edit-order" data-id="${o.id}">✏️</button>
                    <button class="icon-btn" data-action="delete-order" data-id="${o.id}">🗑️</button>
                    ${o.ticketPhoto ? `<button class="icon-btn" data-action="view-file" data-file-url="${o.ticketPhoto}">📎</button>` : ''}
                </td>
            </tr>`;
        });
        html += '</tbody></table>';

        if (state.pagination.orders.hasMore) {
            // Se usa el delegado de datos data-action en vez del id suelto
            html += '<div style="text-align: center; margin: 1rem 0;"><button data-action="load-more-orders" class="secondary">Cargar más pedidos</button></div>';
        }

        ordersListDiv.innerHTML = html;
    }

    // --- Render Customers ---
    function renderCustomers() {
        const customersListDiv = getEl('customersList');
        if (!customersListDiv) return;

        if (!state.customers.length) {
            customersListDiv.innerHTML = '<p class="card">No hay clientes.</p>';
            return;
        }

        let html = '<table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Dirección</th><th>Email</th><th>Acciones</th></tr></thead><tbody>';
        state.customers.forEach(c => {
            html += `<tr>
                <td data-label="Nombre">${escapeHTML(c.name)}</td>
                <td data-label="Teléfono">${escapeHTML(c.phone)}</td>
                <td data-label="Dirección">${escapeHTML(c.address)}</td>
                <td data-label="Email">${escapeHTML(c.email)}</td>
                <td class="actions-cell" data-label="Acciones">
                    <button class="icon-btn" data-action="edit-customer" data-id="${c.id}">✏️</button>
                    <button class="icon-btn" data-action="delete-customer" data-id="${c.id}">🗑️</button>
                </td>
            </tr>`;
        });
        html += '</tbody></table>';

        if (state.pagination.customers.hasMore) {
            html += '<div style="text-align: center; margin: 1rem 0;"><button data-action="load-more-customers" class="secondary">Cargar más clientes</button></div>';
        }

        customersListDiv.innerHTML = html;
    }

    // --- Render Products ---
    function renderProductsList() {
        const productListDiv = getEl('productList');
        if (!productListDiv) return;

        if (!state.products.length) {
            productListDiv.innerHTML = '<p>No hay productos cargados.</p>';
            return;
        }

        let html = '<table><thead><tr><th>Nombre</th><th>Precio</th><th>Acciones</th></tr></thead><tbody>';
        state.products.forEach(p => {
            html += `<tr>
                <td data-label="Nombre">${escapeHTML(p.name)}</td>
                <td data-label="Precio">${p.price ? '$' + p.price : '-'}</td>
                <td class="actions-cell" data-label="Acciones">
                    <button class="icon-btn" data-action="delete-product" data-id="${p.id}">🗑️</button>
                </td>
            </tr>`;
        });
        html += '</tbody></table>';

        if (state.pagination.products.hasMore) {
            html += '<div style="text-align: center; margin: 1rem 0;"><button data-action="load-more-products" class="secondary">Cargar más productos</button></div>';
        }

        productListDiv.innerHTML = html;
    }

    function updateProductDatalist() {
        let datalist = getEl('productDatalist');
        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = 'productDatalist';
            document.body.appendChild(datalist);
        }
        datalist.innerHTML = state.products.map(p => `<option value="${escapeHTML(p.name)}">${p.price ? '$' + p.price : ''}</option>`).join('');
    }

    // --- Delegación de Eventos Global ---
    document.addEventListener('click', async e => {
        const target = e.target;

        // Cierra modales si clickea afuera de la caja o en la equis
        if (target.matches('.modal')) target.style.display = 'none';
        if (target.closest('.close') || target.closest('.cancel-btn')) {
            const modal = target.closest('.modal') || target.closest('.image-modal');
            if (modal) modal.style.display = 'none';
        }

        if (!target.closest('.status-menu') && !target.closest('[data-action="toggle-status"]')) {
            document.querySelectorAll('.status-menu').forEach(m => m.classList.add('hidden'));
        }

        const actionBtn = target.closest('[data-action]');
        if (!actionBtn) return;

        const action = actionBtn.dataset.action;
        const id = actionBtn.dataset.id;
        const fileUrl = actionBtn.dataset.fileUrl;

        switch (action) {
            case 'edit-order':
                openOrderModal(id); break;
            case 'delete-order':
                if (confirm('¿Eliminar pedido?')) await withLoader('Eliminando pedido', () => refs.orders.doc(id).delete());
                break;
            case 'view-file':
                openFileModal(fileUrl); break;
            case 'toggle-status':
                const menu = getEl(`status-menu-${id}`);
                if (menu) {
                    document.querySelectorAll('.status-menu').forEach(m => m.classList.add('hidden'));
                    const rect = actionBtn.getBoundingClientRect();
                    menu.style.top = rect.bottom + window.scrollY + 'px';
                    menu.style.left = rect.left + window.scrollX + 'px';
                    menu.classList.remove('hidden');
                }
                break;
            case 'edit-customer':
                openCustomerModal(id); break;
            case 'delete-customer':
                if (state.orders.some(o => o.customerId === id)) {
                    alert('Cliente tiene pedidos, no se puede eliminar');
                    return;
                }
                if (confirm('¿Eliminar cliente?')) await withLoader('Eliminando cliente', () => refs.customers.doc(id).delete());
                break;
            case 'delete-product':
                if (confirm('¿Eliminar producto?')) await withLoader('Eliminando producto', () => refs.products.doc(id).delete());
                break;
            // Paginación migrada a delegación global
            case 'load-more-orders':
                loadMoreOrders(false); break;
            case 'load-more-customers':
                loadMoreCustomers(false); break;
            case 'load-more-products':
                loadMoreProducts(false); break;
        }

        if (target.matches('.status-menu button')) {
            const status = target.dataset.status;
            const orderId = target.dataset.id;
            await withLoader('Actualizando estado', () => refs.orders.doc(orderId).update({ status }));
            target.closest('.status-menu').classList.add('hidden');
        }
    });

    // --- Modal de archivo ---
    function openFileModal(fileUrl) {
        let modalDiv = getEl('fileModal');
        if (!modalDiv) {
            modalDiv = document.createElement('div');
            modalDiv.id = 'fileModal';
            modalDiv.className = 'image-modal';
            modalDiv.innerHTML = `
                <span class="close">&times;</span>
                <div id="fileModalContent" style="width:90%; height:90%; display:flex; justify-content:center; align-items:center;"></div>
            `;
            document.body.appendChild(modalDiv);
        }
        const contentDiv = getEl('fileModalContent');
        const isPdf = fileUrl.toLowerCase().endsWith('.pdf');

        if (isPdf) {
            contentDiv.innerHTML = `<iframe src="${fileUrl}" style="width:100%; height:100%; border:none;" title="PDF Viewer"></iframe>`;
        } else {
            contentDiv.innerHTML = `<img src="${fileUrl}" style="max-width:100%; max-height:100%; object-fit:contain;">`;
        }
        modalDiv.style.display = 'flex';
    }

    // --- Funciones de Modales Formulario ---
    function openOrderModal(id) {
        const orderForm = getEl('orderForm');
        orderForm.reset();
        getEl('orderId').value = '';
        getEl('productsContainer').innerHTML = '';
        const previewContainer = getEl('photoPreviewContainer');
        previewContainer.innerHTML = '';

        const select = getEl('customerSelect');
        select.innerHTML = '<option value="">Seleccionar cliente</option>' + state.customers.map(c => `<option value="${c.id}">${escapeHTML(c.name)}</option>`).join('');

        if (id) {
            const o = state.orders.find(order => order.id === id);
            if (o) {
                getEl('orderId').value = o.id;
                select.value = o.customerId;
                getEl('orderDate').value = o.date;
                getEl('orderStatus').value = o.status;
                getEl('orderComments').value = o.comments || '';
                o.items.forEach(item => addProductRow(item));

                if (o.ticketPhoto) {
                    showFilePreview(o.ticketPhoto, previewContainer, true);
                }
            }
        } else {
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            getEl('orderDate').value = now.toISOString().slice(0, 16);
            addProductRow();
        }
        getEl('orderModal').style.display = 'flex';
    }

    function showFilePreview(fileUrl, container, isExisting = false) {
        container.innerHTML = '';
        const isPdf = fileUrl.toLowerCase().endsWith('.pdf');

        if (isPdf) {
            const pdfDiv = document.createElement('div');
            pdfDiv.className = 'pdf-preview';
            pdfDiv.innerHTML = `
                <span>📄 PDF - ${escapeHTML(fileUrl.split('/').pop())}</span>
                <button type="button" class="remove-file-btn" data-remove-file>Eliminar</button>
            `;
            container.appendChild(pdfDiv);
        } else {
            const img = document.createElement('img');
            img.src = fileUrl;
            img.className = 'photo-preview';
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'remove-file-btn';
            removeBtn.textContent = 'Eliminar';
            removeBtn.style.display = 'block';
            removeBtn.style.marginTop = '0.5rem';
            container.appendChild(img);
            container.appendChild(removeBtn);
        }

        container.querySelector('[data-remove-file], .remove-file-btn')?.addEventListener('click', () => {
            container.innerHTML = '';
            getEl('ticketPhoto').value = '';
        });
    }

    getEl('ticketPhoto')?.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const container = getEl('photoPreviewContainer');
        container.innerHTML = '';

        if (file.type === 'application/pdf') {
            const url = URL.createObjectURL(file);
            const pdfDiv = document.createElement('div');
            pdfDiv.className = 'pdf-preview';
            pdfDiv.innerHTML = `
                <span>📄 ${escapeHTML(file.name)}</span>
                <button type="button" class="remove-file-btn" data-remove-file>Eliminar</button>
            `;
            container.appendChild(pdfDiv);
            
            const viewLink = document.createElement('button');
            viewLink.type = 'button';
            viewLink.textContent = 'Ver PDF';
            viewLink.className = 'secondary';
            viewLink.style.marginLeft = '1rem';
            viewLink.onclick = () => openFileModal(url);
            pdfDiv.appendChild(viewLink);
        } else if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = document.createElement('img');
                img.src = ev.target.result;
                img.className = 'photo-preview';
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'remove-file-btn';
                removeBtn.textContent = 'Eliminar';
                removeBtn.style.display = 'block';
                removeBtn.style.marginTop = '0.5rem';
                container.appendChild(img);
                container.appendChild(removeBtn);
            };
            reader.readAsDataURL(file);
        } else {
            alert('Tipo de archivo no soportado. Seleccioná una imagen o PDF.');
            e.target.value = '';
            return;
        }

        setTimeout(() => {
            container.querySelector('[data-remove-file], .remove-file-btn')?.addEventListener('click', () => {
                container.innerHTML = '';
                getEl('ticketPhoto').value = '';
            });
        }, 100);
    });

    function addProductRow(item) {
        const container = getEl('productsContainer');
        const div = document.createElement('div');
        div.className = 'product-item';
        div.innerHTML = `
            <input type="text" placeholder="Producto" list="productDatalist" value="${item ? escapeHTML(item.productName) : ''}" class="product-name">
            <input type="number" placeholder="Cant" value="${item ? item.quantity : 1}" min="1" style="width:80px;" class="product-qty">
            <input type="number" placeholder="Precio" value="${item ? item.price : ''}" min="0" step="0.01" style="width:100px;" class="product-price">
            <button type="button" class="remove-product">✕</button>
        `;
        div.querySelector('.remove-product').addEventListener('click', () => div.remove());
        container.appendChild(div);
    }

    // --- CRUD ---
    async function saveCustomer(cust) {
        await withLoader('Guardando cliente', async () => {
            if (cust.id) await refs.customers.doc(cust.id).set(cust);
            else await refs.customers.add(cust);
        });
    }

    async function saveOrder(order, file) {
        await withLoader('Guardando pedido', async () => {
            if (file) {
                const ref = storage.ref(`tickets/${Date.now()}_${file.name}`);
                await ref.put(file);
                order.ticketPhoto = await ref.getDownloadURL();
            } else {
                const previewContainer = getEl('photoPreviewContainer');
                if (previewContainer && previewContainer.children.length === 0) {
                    order.ticketPhoto = '';
                }
            }

            // Indexar info para búsquedas más rápidas y económicas
            const cust = state.customers.find(c => c.id === order.customerId) || { name:'', phone:'', address:'', email:'' };
            order.searchIndex = `${cust.name} ${cust.phone || ''} ${cust.address || ''} ${cust.email || ''} ${order.comments || ''} ${order.items.map(i => i.productName).join(' ')}`.toLowerCase();

            const { id, ...orderData } = order;
            if (id) await refs.orders.doc(id).set(orderData);
            else await refs.orders.add(orderData);
        });
    }

    // Bindings de UI
    getEl('addProductBtn')?.addEventListener('click', () => addProductRow());

    const debouncedRenderOrders = debounce(renderOrders, 300);
    ['searchOrders', 'statusFilter', 'dateFrom', 'dateTo'].forEach(id => {
        getEl(id)?.addEventListener('input', debouncedRenderOrders);
    });

    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // Botones para modales y cancelaciones específicas (la de cruz/fuera de modal está en la delgación global)
    document.querySelectorAll('#cancelOrderBtn, #cancelQuickBtn, #cancelCustomerBtn').forEach(btn => {
        btn.addEventListener('click', e => {
            const modal = e.target.closest('.modal');
            if (modal) modal.style.display = 'none';
        });
    });

    getEl('newOrderBtn')?.addEventListener('click', () => openOrderModal());

    getEl('quickAddCustomerBtn')?.addEventListener('click', () => {
        getEl('quickCustomerModal').style.display = 'flex';
    });
    getEl('quickCustomerForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const cust = {
            name: getEl('quickName').value.trim(),
            phone: getEl('quickPhone').value.trim(),
            address: getEl('quickAddress').value.trim(),
            email: getEl('quickEmail').value.trim()
        };
        if (!cust.name) return alert('Nombre obligatorio');
        await saveCustomer(cust);
        getEl('quickCustomerModal').style.display = 'none';
    });

    getEl('newCustomerBtn')?.addEventListener('click', () => {
        getEl('customerModalTitle').textContent = '👤 Nuevo Cliente';
        getEl('customerForm').reset();
        getEl('customerId').value = '';
        getEl('customerModal').style.display = 'flex';
    });

    getEl('customerForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const cust = {
            id: getEl('customerId').value || undefined,
            name: getEl('customerName').value.trim(),
            phone: getEl('customerPhone').value.trim(),
            address: getEl('customerAddress').value.trim(),
            email: getEl('customerEmail').value.trim()
        };
        if (!cust.name) return alert('Nombre obligatorio');
        await saveCustomer(cust);
        getEl('customerModal').style.display = 'none';
    });

    getEl('orderForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const customerId = getEl('customerSelect').value;
        if (!customerId) return alert('Seleccioná un cliente');
        const items = [];
        document.querySelectorAll('#productsContainer .product-item').forEach(row => {
            const name = row.querySelector('.product-name').value.trim();
            if (!name) return;
            items.push({
                productName: name,
                quantity: parseInt(row.querySelector('.product-qty').value) || 1,
                price: parseFloat(row.querySelector('.product-price').value) || 0
            });
        });
        if (!items.length) return alert('Agregá al menos un producto');

        const fileInput = getEl('ticketPhoto');
        const file = fileInput.files[0];

        const order = {
            id: getEl('orderId').value || undefined,
            customerId,
            date: getEl('orderDate').value,
            status: getEl('orderStatus').value,
            comments: getEl('orderComments').value,
            items,
            ticketPhoto: getEl('orderId').value ? state.orders.find(o => o.id === getEl('orderId').value)?.ticketPhoto || '' : ''
        };

        await saveOrder(order, file);
        getEl('orderModal').style.display = 'none';
    });

    // --- Arranque ---
    initApp();
})();
