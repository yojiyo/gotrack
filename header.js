function loadHeader(pageTitle) {
    const headerContainer = document.getElementById('header-container');

    if (headerContainer) {
        headerContainer.innerHTML = `
        <header class="top-bar">
            <h1 id="pageTitle">${pageTitle}</h1>

            <div class="user-menu">
                
                <div class="notif-wrapper" style="position:relative;">
                    <button class="icon-btn" id="notifBtn" onclick="toggleNotifPanel()">
                        <i class="ph ph-bell"></i>
                        <span class="notification-dot" id="notifDot" style="display:none;"></span>
                    </button>

                    <!-- Notification Panel -->
                    <div id="notifPanel" style="
                        display:none;
                        position:absolute;
                        top:48px;
                        right:0;
                        width:340px;
                        background:white;
                        border-radius:14px;
                        box-shadow:0 8px 32px rgba(0,0,0,0.15);
                        z-index:9999;
                        overflow:hidden;
                        border:1px solid #f1f5f9;
                    ">
                        <div style="padding:16px 20px; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center;">
                            <h4 style="margin:0; font-size:15px; font-weight:700; color:#0f172a;">Notifications</h4>
                            <button onclick="markAllRead()" style="background:none; border:none; font-size:12px; color:#3b82f6; cursor:pointer; font-weight:600;">Mark all read</button>
                        </div>
                        <div id="notifList" style="max-height:360px; overflow-y:auto;">
                            <p style="text-align:center; padding:24px; color:#94a3b8; font-size:13px;">Loading...</p>
                        </div>
                    </div>
                </div>

                <div class="user-info">
                    <div class="details">
                        <span class="name" id="headerUserName">${localStorage.getItem('userName') || 'User'}</span>
                        <span class="role" id="headerUserRole">${localStorage.getItem('userRole') || 'Employee'}</span>
                    </div>
                    <div class="avatar">${(localStorage.getItem('userName') || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2)}</div>
                </div>

            </div>
        </header>
        `;

        // Close panel when clicking outside
        document.addEventListener('click', function (e) {
            const panel = document.getElementById('notifPanel');
            const btn = document.getElementById('notifBtn');
            if (panel && !panel.contains(e.target) && !btn.contains(e.target)) {
                panel.style.display = 'none';
            }
        });

        loadNotifications();

        setInterval(loadNotifications, 30000);
    }
}

function getNotifKey() {
    return 'gotrack_read_notifs';
}

function getReadIds() {
    return JSON.parse(localStorage.getItem(getNotifKey()) || '[]');
}
 
function markIdRead(id) {
    const ids = getReadIds();
    if (!ids.includes(id)) {
        ids.push(id);
        localStorage.setItem(getNotifKey(), JSON.stringify(ids));
    }
}

async function loadNotifications() {
    try {
        const res = await fetch(`${CONFIG.API_BASE_URL}/get_schedules`);
        const schedules = await res.json();

        const readIds = getReadIds();
        const notifList = document.getElementById('notifList');
        const notifDot = document.getElementById('notifDot');

        // Only show schedules with a meaningful response status
        const responseItems = schedules.filter(s =>
            s.response_status && 
            s.response_status !== 'Pending' &&
            s.response_status !== 'Done'
        );

        if (responseItems.length === 0) {
            notifList.innerHTML = '<p style="text-align:center; padding:24px; color:#94a3b8; font-size:13px;">No notifications yet.</p>';
            notifDot.style.display = 'none';
            return;
        }

        const unreadCount = responseItems.filter(s => !readIds.includes(s.id)).length;
        notifDot.style.display = unreadCount > 0 ? 'block' : 'none';

        notifList.innerHTML = '';
        responseItems.forEach(s => {
            const isUnread = !readIds.includes(s.id);
            const { icon, color, bg, label } = getNotifStyle(s.response_status);

            notifList.insertAdjacentHTML('beforeend', `
                <div onclick="markIdRead(${s.id}); this.style.background='white'; document.getElementById('notifDot').style.display = getReadIds().length >= ${responseItems.length} ? 'none' : 'block';"
                    style="
                        display:flex;
                        gap:14px;
                        padding:14px 20px;
                        border-bottom:1px solid #f8fafc;
                        background:${isUnread ? '#f8faff' : 'white'};
                        cursor:pointer;
                        transition:background 0.2s;
                    ">
                    <div style="
                        width:38px; height:38px;
                        border-radius:50%;
                        background:${bg};
                        color:${color};
                        display:flex; align-items:center; justify-content:center;
                        font-size:18px; flex-shrink:0;
                    ">${icon}</div>
                    <div style="flex:1;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
                            <span style="font-size:13px; font-weight:${isUnread ? '700' : '500'}; color:#1e293b;">${s.candidate_name}</span>
                            ${isUnread ? '<span style="width:8px;height:8px;background:#3b82f6;border-radius:50%;display:inline-block;"></span>' : ''}
                        </div>
                        <p style="margin:0; font-size:12px; color:#64748b; line-height:1.5;">
                            <span style="color:${color}; font-weight:600;">${label}</span> their interview for <strong>${s.role}</strong>
                        </p>
                        <span style="font-size:11px; color:#94a3b8;">${s.date} at ${s.time}</span>
                    </div>
                </div>
            `);
        });

    } catch (e) {
        console.error('Failed to load notifications:', e);
    }
}

function getNotifStyle(status) {
    switch (status) {
        case 'Confirmed':
            return { icon: '✅', color: '#16a34a', bg: '#dcfce7', label: 'Confirmed' };
        case 'Declined':
            return { icon: '❌', color: '#dc2626', bg: '#fee2e2', label: 'Declined' };
        case 'Reschedule Requested':
            return { icon: '🔄', color: '#d97706', bg: '#fef3c7', label: 'Requested a reschedule for' };
        default:
            return { icon: '🔔', color: '#3b82f6', bg: '#dbeafe', label: 'Updated' };
    }
}

function toggleNotifPanel() {
    const panel = document.getElementById('notifPanel');
    const isVisible = panel.style.display === 'block';
    panel.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) loadNotifications();
}

function markAllRead() {
    const readIds = getReadIds();
    const items = document.querySelectorAll('#notifList [onclick]');
    items.forEach(item => {
        item.style.background = 'white';
    });

    fetch('/get_schedules')
        .then(r => r.json())
        .then(schedules => {
            schedules.forEach(s => markIdRead(s.id));
            document.getElementById('notifDot').style.display = 'none';
            // Remove all blue dots
            document.querySelectorAll('#notifList span[style*="background:#3b82f6"]').forEach(dot => dot.remove());
        });
}