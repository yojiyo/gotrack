function formatTimeAgo(dateString) {
    if (!dateString) return "N/A";

    const now = new Date();
    const timestamp = dateString.endsWith('Z') ? dateString : dateString + "Z";
    const past = new Date(timestamp);

    const diffInSeconds = Math.floor((now - past) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;

    return past.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
const modal = document.getElementById('jobModal');
const createBtn = document.querySelector('.create-btn');
const closeBtns = document.querySelectorAll('.close-modal-btn');
const jobForm = document.getElementById('createJobForm');
const jobsTableBody = document.querySelector('tbody');

const filterTabs = document.querySelectorAll('.filter-tab');

filterTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
        e.preventDefault();

        filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const filterValue = tab.textContent.trim().toLowerCase();

        const rows = jobsTableBody.querySelectorAll('tr');

        rows.forEach(row => {
            const statusBadge = row.querySelector('.badge.status-open, .badge.status-closed');
            const statusText = statusBadge ? statusBadge.textContent.trim().toLowerCase() : '';

            if (filterValue === 'all jobs') {
                row.style.display = '';
            } else if (statusText === filterValue) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    });
});

createBtn.addEventListener('click', () => {
    modal.classList.add('show');
});

closeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        modal.classList.remove('show');
    });
});

window.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.classList.remove('show');
    }
});

jobForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('jobTitle').value;
    const department = document.getElementById('jobDept').value;
    const location = document.getElementById('jobLoc').value;

    const jobData = { title, department, location };

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(jobData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            alert(errorData.detail || "An error occurred."); 
            return; 
        }

        await loadJobs();
        jobForm.reset();
        modal.classList.remove('show');

    } catch (error) {
        console.error("Connection error:", error);
        alert("Cannot connect to the backend server.");
    }
});

document.querySelector('tbody').addEventListener('click', async (e) => {
    const toggleBtn = e.target.closest('.toggle-status-btn');
    if (toggleBtn) {
        const jobId = toggleBtn.getAttribute('data-id');
        const currentStatus = toggleBtn.getAttribute('data-status');
        const action = currentStatus === 'Open' ? 'close' : 'reopen';
        if (confirm(`Are you sure you want to ${action} this job?`)) {
            try {
                const response = await fetch(`${CONFIG.API_BASE_URL}/jobs/${jobId}/toggle-status`, {
                    method: 'PATCH'
                });
                if (response.ok) await loadJobs();
                else alert("Error: Could not update job status.");
            } catch (error) {
                console.error("Toggle failed:", error);
            }
        }
        return;
    }

    const deleteBtn = e.target.closest('.delete-job-btn');

    if (deleteBtn) {
        const jobId = deleteBtn.getAttribute('data-id');

        if (confirm("Are you sure you want to delete this job?")) {
            try {
                const response = await fetch(`${CONFIG.API_BASE_URL}/jobs/${jobId}`, {
                    method: 'DELETE'
                });

                if (response.ok) {
                    await loadJobs();
                } else {
                    alert("Error: Could not delete the job.");
                }
            } catch (error) {
                console.error("Delete failed:", error);
                alert("Server connection error.");
            }
        }
    }
});

async function saveJob() {
    const jobData = {
        title: document.getElementById('jobTitle').value,
        department: document.getElementById('jobDept').value,
        location: document.getElementById('jobLoc').value
    };

    const response = await fetch(`${CONFIG.API_BASE_URL}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jobData)
    });

    if (response.ok) {
        alert("Job saved to database!");
        loadJobs();
    }
}

async function loadJobs() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/get_jobs`);
        const data = await response.json();

        const tableBody = document.querySelector('tbody');
        tableBody.innerHTML = '';

        data.jobs.forEach(job => {
            let deptClass = 'dept-eng';
            const dept = job.department ? job.department.toLowerCase() : '';
            if (dept === 'marketing') deptClass = 'dept-mkt';
            else if (dept === 'design') deptClass = 'dept-des';
            else if (dept === 'sales') deptClass = 'dept-sales';
            else if (dept === 'product') deptClass = 'dept-prod';

            const postedTime = formatTimeAgo(job.posted_at);

            const statusClass = job.status === 'Open' ? 'status-open' : 'status-closed';
            const row = `
            <tr>
                <td><strong>${job.title}</strong></td>
                <td><span class="badge ${deptClass}">${job.department}</span></td>
                <td>${job.location}</td>
                <td>
                    <div class="applicant-count">
                        <i class="ph ph-users"></i> ${job.applicant_count || 0}
                    </div>
                </td>
                <td>${postedTime}</td> 
                <td><span class="badge ${statusClass}">${job.status}</span></td>
                <td>
                    <button class="action-btn toggle-status-btn" data-id="${job.id}" data-status="${job.status}" title="${job.status === 'Open' ? 'Close Job' : 'Reopen Job'}" style="color:${job.status === 'Open' ? '#f59e0b' : '#16a34a'};">
                        <i class="ph ${job.status === 'Open' ? 'ph-lock-simple' : 'ph-lock-simple-open'}"></i>
                    </button>
                    <button class="action-btn delete-job-btn" data-id="${job.id}">
                        <i class="ph ph-trash"></i>
                    </button>
                </td>
            </tr>`;
            tableBody.innerHTML += row;
        });
    } catch (error) {
        console.error("Failed to load jobs:", error);
    }
}

window.onload = loadJobs;