document.addEventListener('DOMContentLoaded', () => {
    if (typeof loadSidebar === 'function') {
        loadSidebar('employees');
    }

    const searchInput = document.querySelector('.search-box input');
    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            filterTable(searchTerm);
        });
    }
});

const EMPLOYEE_STATUS_CLASS_MAP = {
    'Pre-Employment': 'pre-employment',
    'Onboarding': 'onboarding',
    'Regularization': 'regularization',
    'Exit Interview': 'exit-interview',
    'Departure': 'departure',
    'Active': 'active'
};


function toggleFilterMenu(menuId) {
    const menu = document.getElementById(menuId);

    document.querySelectorAll('.filter-dropdown').forEach(el => {
        if (el.id !== menuId) el.classList.remove('show');
    });

    if (menu) {
        menu.classList.toggle('show');
    }
}

window.addEventListener('click', function (e) {
    if (!e.target.closest('.search-group') && !e.target.closest('.btn-filter')) {
        document.querySelectorAll('.filter-dropdown').forEach(el => {
            el.classList.remove('show');
        });
    }
});

function applyEmployeeFilters() {
    const deptValue = document.getElementById('filterDept').value;
    const statusValue = document.getElementById('filterStatus').value;

    const rows = document.querySelectorAll('#employeeTableBody tr');

    rows.forEach(row => {
        if (row.cells.length < 5) return;

        const deptText = row.children[2].textContent.trim();
        const statusText = row.children[4].textContent.trim();

        const deptMatch = (deptValue === 'all') || (deptText === deptValue);
        const statusMatch = (statusValue === 'all') || (statusText === statusValue);

        if (deptMatch && statusMatch) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });

    const menu = document.getElementById('employeeFilter');
    if (menu) menu.classList.remove('show');
}

function filterTable(searchTerm) {
    const rows = document.querySelectorAll('tbody tr');

    rows.forEach(row => {
        const nameText = row.children[0].textContent.toLowerCase();
        const roleText = row.children[1].textContent.toLowerCase();

        if (nameText.includes(searchTerm) || roleText.includes(searchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}



async function loadEmployees() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/get_employees`);
        const employees = await response.json();
        const tableBody = document.getElementById('employeeTableBody');

        tableBody.innerHTML = '';

        if (employees.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px; color: #64748b;">No employees found.</td></tr>`;
            return;
        }

        employees.forEach(emp => {
            let initials = "?";
            if (emp.full_name) {
                const names = emp.full_name.trim().split(' ');
                initials = names.length > 1 
                    ? (names[0][0] + names[names.length - 1][0]).toUpperCase() 
                    : names[0][0].toUpperCase();
            }
        
            const badgeClass = EMPLOYEE_STATUS_CLASS_MAP[emp.status] || 'active';
            const row = document.createElement('tr');
            row.style.cursor = "pointer";
            // Redirect when clicking the row, but NOT if clicking the delete button
            row.onclick = (e) => {
                if (!e.target.closest('.action-btn')) {
                    window.location.href = `/employee-profile?id=${emp.id}`;
                }
            };
        
            row.innerHTML = `
                <td>
                    <div class="user-info-cell">
                        <div class="avatar-circle">${initials}</div>
                        <div class="user-text">
                            <span class="name">${emp.full_name}</span>
                            <span class="email">${emp.email || 'N/A'}</span>
                        </div>
                    </div>
                </td>
                <td>${emp.position || 'N/A'}</td>
                <td>${emp.department || 'General'}</td>
                <td>${emp.join_date || 'N/A'}</td>
                <td>
                    <span class="badge ${badgeClass}">${emp.status}</span>
                </td>
                <td style="text-align: right;">
                    <button class="action-btn" onclick="deleteEmployee(${emp.id})">
                        <i class="ph ph-trash"></i>
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error("Failed to load dynamic employees:", error);
    }
}

async function deleteEmployee(id) {
    if (!confirm("Remove this employee record?")) return;
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/employees/${id}`, { method: 'DELETE' });
        if (response.ok) await loadEmployees();
    } catch (e) { console.error("Delete failed:", e); }
}

async function populateFilterDepartments() {
    const filterSelector = document.getElementById('filterDept');
    if (!filterSelector) return;

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/get_jobs`);
        const data = await response.json();

        let optionsHTML = '<option value="all">All Departments</option>';

        if (data.jobs && data.jobs.length > 0) {
            const uniqueDepts = [...new Set(data.jobs.map(job => job.department))];

            uniqueDepts.forEach(dept => {
                if (dept) {
                    optionsHTML += `<option value="${dept}">${dept}</option>`;
                }
            });
        }

        filterSelector.innerHTML = optionsHTML;
    } catch (error) {
        console.error("Error syncing filter departments:", error);
    }
}

function toggleFilterMenu(menuId) {
    const menu = document.getElementById(menuId);

    document.querySelectorAll('.filter-dropdown').forEach(el => {
        if (el.id !== menuId) el.classList.remove('show');
    });

    if (menu) {
        menu.classList.toggle('show');
        if (menu.classList.contains('show') && menuId === 'employeeFilter') {
            populateFilterDepartments();
        }
    }
}

async function deleteEmployee(id) {
    if (!confirm("Are you sure you want to remove this employee? This will also delete their login account.")) return;

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/employees/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            await loadEmployees();
            alert("Employee removed successfully.");
        } else {
            const errorData = await response.json();
            alert("Delete failed: " + (errorData.detail || "Unknown error"));
        }
    } catch (error) {
        console.error("Error during deletion:", error);
        alert("Could not connect to the server.");
    }
}

document.addEventListener('DOMContentLoaded', loadEmployees);

function openResetPasswordModal(employeeEmail, employeeName) {
    const newPass = prompt(`Reset password for ${employeeName}.\n\nEnter new password:`);
    if (!newPass) return;
    if (newPass.length < 6) {
        alert('Password must be at least 6 characters.');
        return;
    }
    confirmResetPassword(employeeEmail, employeeName, newPass);
}

async function confirmResetPassword(email, name, newPass) {
    if (!confirm(`Reset password for ${name}?`)) return;
    
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, new_password: newPass })
        });

        if (response.ok) {
            alert(`Password for ${name} has been reset successfully.`);
        } else {
            const err = await response.json();
            alert('Error: ' + (err.detail || 'Could not reset password.'));
        }
    } catch (e) {
        console.error(e);
    }
}