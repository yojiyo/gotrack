function loadSidebar(activePage) {
    const sidebarContainer = document.getElementById('sidebar-container');

    const userRole = localStorage.getItem('userRole');

    let menuItems = [];

    if (userRole && userRole.trim().toLowerCase() === 'employee') {
        const empId = localStorage.getItem('employeeId');
        menuItems = [
            { name: 'My Profile', link: `/employee-profile?id=${empId}`, icon: 'ph-user-circle', id: 'profile' },
            { name: 'Time Logs', link: '/timelog', icon: 'ph-clock', id: 'timelogs' },
            { name: 'Gallery', link: '/gallery', icon: 'ph-image', id: 'gallery' }
        ];
    } else {
        menuItems = [
            { name: 'Dashboard', link: '/dashboard', icon: 'ph-squares-four', id: 'dashboard' },
            { name: 'Jobs', link: '/jobs', icon: 'ph-briefcase', id: 'jobs' },
            { name: 'Candidates', link: '/candidates', icon: 'ph-users', id: 'candidates' },
            { name: 'Employees', link: '/employees', icon: 'ph-identification-card', id: 'employees' },
            { name: 'Schedule', link: '/schedule', icon: 'ph-calendar', id: 'schedule' }
        ];
    }

    let menuHtml = '';

    menuItems.forEach(item => {
        const isActive = (item.id === activePage) ? 'active' : '';

        menuHtml += `
            <li class="${isActive}">
                <a href="${item.link}">
                    <i class="ph ${item.icon}"></i> ${item.name}
                </a>
            </li>
        `;
    });

    if (sidebarContainer) {
        sidebarContainer.innerHTML = `
            <nav class="sidebar">
                <div class="sidebar-header">
                    <div class="logo-wrapper">
                        <img src="/static/logo_GoCloud.png" alt="GoCloud Logo" class="sidebar-logo">
                        <h2>GoTrack</h2>
                    </div>
                </div>
                <ul class="menu">
                    ${menuHtml}
                </ul>
                <div class="sidebar-footer">
                    <a href="#" id="logoutBtn" class="logout-btn">
                        <i class="ph ph-sign-out"></i> Sign Out
                    </a>
                </div>
            </nav>
        `;

        // --- PLACE THE CODE HERE ---
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();

                // 1. Clear ALL storage immediately
                localStorage.clear();
                sessionStorage.clear();

                // 2. Stop Electron background tasks
                if (window.electronAPI && window.electronAPI.stopMonitoring) {
                    window.electronAPI.stopMonitoring();
                }

                // 3. Give Electron a tiny moment (100ms) to process the 'stop-monitoring' IPC
                setTimeout(() => {
                    // Use the absolute URL for the Electron EXE to follow
                    window.location.replace(`${CONFIG.API_BASE_URL}/`);
                }, 100);
            });
        }
    }
}