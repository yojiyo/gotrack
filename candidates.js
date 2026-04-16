let activeCandidateId = null;

/**
 * Opens the candidate modal and stores the database ID for hiring logic.
 * @param {number} id - The unique database ID of the candidate.
 */

async function convertToEmployee() {
    if (!activeCandidateId) return;

    if (!confirm("Convert this candidate to a full-time employee?")) return;

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/candidates/${activeCandidateId}/hire`, {
            method: 'POST'
        });

        if (response.ok) {
            alert("Candidate hired successfully! They are now in the Employee list.");
            closeModal();
            await loadCandidates();
        } else {
            const error = await response.json();
            alert("Error: " + (error.detail || "Could not complete hiring."));
        }
    } catch (error) {
        console.error("Hiring failed:", error);
    }
}

const STATUS_MAP = {
    Applied: 'applied',
    Screening: 'screening',
    Shortlisted: 'shortlisted',
    Interview: 'interview',
    Offer: 'offer',
    Hired: 'hired',
    Rejected: 'rejected'
};

const btnBoard = document.getElementById('btnBoard');
const btnList = document.getElementById('btnList');
const kanbanView = document.getElementById('kanbanView');
const listView = document.getElementById('listView');

if (!kanbanView || !listView) {
    console.error("Kanban or List view missing from DOM");
}



let currentView = localStorage.getItem('candidateView') || 'board';

function showView() {
    localStorage.setItem('candidateView', currentView);
    const activePipeline = document.getElementById('btnCandidatePipeline').classList.contains('active') ? 'candidate' : 'employee';

    if (currentView === 'board') {
        listView.classList.add('hidden');
        btnBoard.classList.add('active');
        btnList.classList.remove('active');
        switchPipeline(activePipeline); // Refreshes board visibility
    } else {
        kanbanView.style.display = 'none';
        document.getElementById('employeePipelineView').style.display = 'none';
        listView.classList.remove('hidden');
        btnList.classList.add('active');
        btnBoard.classList.remove('active');
        switchPipeline(activePipeline); // Refreshes list data
    }
}

if (btnBoard && btnList) {
    btnBoard.addEventListener('click', () => { currentView = 'board'; showView(); });
    btnList.addEventListener('click', () => { currentView = 'list'; showView(); });
}

let currentCandidateName = "";
let isSchedulePopupOpen = false;
const schedulePopup = document.getElementById('schedulePopup');

function allowDrop(ev) {
    ev.preventDefault();
    ev.currentTarget.classList.add('drag-over');
}

function drag(ev) {
    ev.dataTransfer.setData("text", ev.target.id);
}


async function drop(ev) {
    ev.preventDefault();
    document.querySelectorAll('.kanban-col').forEach(col =>
        col.classList.remove('drag-over')
    );

    const data = ev.dataTransfer.getData("text");
    const card = document.getElementById(data);
    const column = ev.target.closest('.kanban-col');

    if (!card || !column) return;

    const newStatus = column.getAttribute('data-status');
    const oldStatus = card.closest('.kanban-col')?.getAttribute('data-status');
    const candidateId = data.replace('c', '');
    const candidateName = card.querySelector('h4').textContent;
    const candidateRole = card.querySelector('.role').textContent;

    // If dragging OUT of Interview, check for existing schedule
    if (oldStatus === 'Interview' && newStatus !== 'Interview') {
        try {
            const schedRes = await fetch(`${CONFIG.API_BASE_URL}/get_schedules`);
            const schedData = await schedRes.json();
            const hasSchedule = schedData.some(s =>
                s.candidate_name?.toLowerCase() === candidateName.toLowerCase() &&
                s.date && s.date !== null && s.date !== '' && s.date !== 'To be scheduled' && s.date !== 'Not Set' && s.date !== 'TBD' &&
                s.response_status !== 'Done'
            );
            if (hasSchedule) {
                const confirmed = confirm(
                    `⚠️ "${candidateName}" has an existing interview schedule.\n\nMoving them out of Interview will automatically cancel their schedule.\n\nAre you sure you want to proceed?`
                );
                if (!confirmed) {
                    await loadCandidates();
                    return;
                }

                // Auto-cancel the schedule
                const schedToDelete = schedData.find(s =>
                    s.candidate_name?.toLowerCase() === candidateName.toLowerCase() &&
                    s.date && s.date !== 'To be scheduled' && s.date !== 'Not Set' && s.date !== 'TBD' &&
                    s.response_status !== 'Done'
                );
                if (schedToDelete) {
                    await fetch(`${CONFIG.API_BASE_URL}/schedules/${schedToDelete.id}`, { method: 'DELETE' });
                    // Send cancellation email
                    await fetch(`${CONFIG.API_BASE_URL}/schedule/send-cancel`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: schedToDelete.candidate_email,
                            name: schedToDelete.candidate_name,
                            date: schedToDelete.date,
                            time: schedToDelete.time,
                            role: schedToDelete.role
                        })
                    });
                }
            }
        } catch (err) {
            console.error("Schedule check failed:", err);
        }
    }

    // If dragging OUT of Hired column, show confirmation
    if (oldStatus === 'Hired' && newStatus !== 'Hired') {
        const confirmed = confirm(
            `⚠️ "${candidateName}" is currently a Hired employee.\n\nMoving them out of Hired will remove their Employee record and user account.\n\nAre you sure?`
        );
        if (!confirmed) {
            await loadCandidates();
            return;
        }

        // Delete the employee record
        try {
            const empResponse = await fetch(`${CONFIG.API_BASE_URL}/get_employees`);
            const employees = await empResponse.json();
            const matchedEmp = employees.find(e => e.full_name === candidateName);
            if (matchedEmp) {
                await fetch(`${CONFIG.API_BASE_URL}/employees/${matchedEmp.id}`, { method: 'DELETE' });

                // ADD THIS: Also delete from employee cycle
                const cycleRes = await fetch(`${CONFIG.API_BASE_URL}/get_employee_cycles`);
                const cycles = await cycleRes.json();
                const matchedCycle = cycles.find(c => c.full_name === candidateName);
                if (matchedCycle) {
                    await fetch(`${CONFIG.API_BASE_URL}/employee_cycles/${matchedCycle.id}`, { method: 'DELETE' });
                }
            }
        } catch (err) {
            console.error("Employee deletion failed:", err);
        }
    }

    // If dropping INTO Hired, confirm before doing anything
    if (newStatus === 'Hired' && oldStatus !== 'Hired') {
        const confirmHire = confirm("Convert this candidate to a full-time employee?");
        if (!confirmHire) {
            await loadCandidates(); // snap card back
            return;
        }
    }

    const body = column.querySelector('.col-body');
    if (body) body.appendChild(card);
    updateCounts();

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/candidates/${candidateId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });

        if (response.ok) {
            if (newStatus === 'Hired') {
                try {
                    await fetch(`${CONFIG.API_BASE_URL}/candidates/${candidateId}/hire`, {
                        method: 'POST'
                    });
                } catch (err) {
                    console.error("Hire failed:", err);
                }
                await loadCandidates();
            } else if (newStatus === 'Interview') {
                isSchedulePopupOpen = true;

                // Get candidate email to store with schedule
                const candidateEmail = (() => {
                    try {
                        const emailEl = document.querySelector(`#c${candidateId} [data-email]`);
                        return emailEl ? emailEl.getAttribute('data-email') : 'N/A';
                    } catch { return 'N/A'; }
                })();

                const scheduleRes = await fetch(`${CONFIG.API_BASE_URL}/schedules/auto`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: candidateName, role: candidateRole || "N/A", email: candidateEmail })
                });
                console.log("[DEBUG] Schedule create status:", scheduleRes.status, "for", candidateName);

                currentCandidateName = candidateName;
                showSchedulePopup(candidateName);

            } else {
                await loadCandidates();
            }
        }
    } catch (error) {
        console.error("Update failed:", error);
        await loadCandidates();
    }
}

function closeSchedulePopup() {
    if (schedulePopup) {
        schedulePopup.classList.remove('show');
    }

    isSchedulePopupOpen = false;

    loadCandidates();
}



function showSchedulePopup(name) {
    isSchedulePopupOpen = true;

    const nameEl = document.getElementById('popupCandidateName');
    if (nameEl) {
        nameEl.textContent = name;
    }

    if (schedulePopup) {
        schedulePopup.classList.add('show');
    }
}

function redirectToSchedule() {
    window.location.href = `/schedule?candidate=${encodeURIComponent(currentCandidateName)}`;
}


async function openModal(id, name, role, status, email, timeAgo, phone, location, linkedin, resume_url) {
    activeCandidateId = id;

    // 1. Basic Info Populating
    document.getElementById('mName').textContent = name;
    document.getElementById('mRole').textContent = role;
    document.getElementById('mEmail').textContent = email;
    document.getElementById('mAppliedDate').textContent = `• Applied ${timeAgo}`;
    document.getElementById('mAvatar').textContent = name.charAt(0).toUpperCase();

    // 2. Dynamic Contact Info
    // We target the spans following the icons to inject the real data
    const phoneEl = document.querySelector('.info-row i.ph-phone').nextElementSibling;
    const locEl = document.querySelector('.info-row i.ph-map-pin').nextElementSibling;
    const linkEl = document.querySelector('.info-row i.ph-linkedin-logo').nextElementSibling;

    phoneEl.textContent = (phone && phone !== "N/A") ? phone : "+1 (000) 000-0000";
    locEl.textContent = (location && location !== "N/A") ? location : "Location not provided";

    if (linkedin && linkedin !== "N/A" && linkedin !== "#") {
        linkEl.innerHTML = `<a href="${linkedin}" target="_blank">LinkedIn Profile</a>`;
    } else {
        linkEl.innerHTML = `<span class="text-muted">No Profile Linked</span>`;
    }

    // 3. Status Pill Logic
    const pill = document.getElementById('mStatus');
    if (pill) {
        pill.textContent = status;
        pill.className = `status-pill ${getStatusColor(status)}`;
    }

    // 4. Hiring/Conversion Logic
    const convertNameSpan = document.getElementById('convertName');
    if (convertNameSpan) {
        convertNameSpan.textContent = name;
    }

    const convertSection = document.getElementById('convertSection');
    if (convertSection) {
        // Show only for Offer, hide if already Hired
        if (status === 'Offer') {
            convertSection.style.display = 'block';
        } else {
            convertSection.style.display = 'none';
        }
    }

    // 5. Update resume document section
    const fileCard = document.querySelector('.file-card');
    if (fileCard) {
        if (resume_url && resume_url !== "") {
            fileCard.innerHTML = `
                <div class="file-info">
                    <i class="ph ph-file-pdf file-icon"></i>
                    <span>Resume.pdf</span>
                </div>
                <a href="${resume_url}" target="_blank" download="${name}_Resume.pdf">
                    <i class="ph ph-download-simple action-icon"></i>
                </a>
            `;
        } else {
            fileCard.innerHTML = `
                <div class="file-info">
                    <i class="ph ph-file file-icon" style="color:#94a3b8;"></i>
                    <span style="color:#94a3b8;">No resume uploaded</span>
                </div>
            `;
        }
    }

    // Fetch logs from DB
    const logRes = await fetch(`${CONFIG.API_BASE_URL}/candidates/${id}/logs`);
    const logs = await logRes.json();

    // Add new entry if status changed
    const lastLog = logs[logs.length - 1];
    if (!lastLog || lastLog.status !== status) {
        await fetch(`${CONFIG.API_BASE_URL}/candidates/${id}/logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        logs.push({ status, timestamp: 'Just now' });
    }

    // Render timeline
    const timeline = document.querySelector('.activity-timeline');
    timeline.innerHTML = '';
    logs.forEach((log, index) => {
        const isLatest = index === logs.length - 1;
        timeline.innerHTML += `
        <div class="timeline-item">
            <div class="timeline-dot ${isLatest ? 'blue' : 'grey'}"></div>
            <div class="timeline-content">
                <strong>Moved to ${log.status}</strong>
                <span>${log.timestamp} by Admin</span>
            </div>
        </div>
    `;
    });

    // 5. Show the Panel
    const modal = document.getElementById('candidateModal');
    if (modal) {
        modal.classList.add('show');
    }
}

/**
 * Helper to map status strings to CSS classes
 */
function getStatusColor(status) {
    const map = {
        'Applied': 'blue',
        'Screening': 'yellow',
        'Shortlisted': 'sky',
        'Interview': 'orange',
        'Offer': 'violet',
        'Hired': 'green',
        'Rejected': 'red'
    };
    return map[status] || 'blue';
}

async function loadCandidates() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/get_candidates`);
        const data = await response.json();

        // 1. Identify all column bodies and the list view body
        const tableBody = document.getElementById('candidateListBody');
        const columns = ['applied', 'screening', 'shortlisted', 'interview', 'offer', 'hired', 'rejected'];

        // 2. Clear all existing cards and rows (prevents duplication)
        if (tableBody) tableBody.innerHTML = '';
        columns.forEach(id => {
            const el = document.getElementById(`body-${id}`);
            if (el) el.innerHTML = '';
        });

        // 3. Process each candidate from the database
        data.candidates.forEach(can => {
            const timeAgo = formatTimeAgo(can.created_at);
            const initial = can.name.charAt(0).toUpperCase();
            const email = can.email || "N/A";

            // New dynamic fields (ensuring they aren't undefined)
            const phone = can.phone || "+1 (555) 000-0000";
            const location = can.location || "Not Specified";
            const linkedin = can.linkedin_url || can.linkedin || "#";

            // Determine pill color based on status
            let color = 'blue';
            if (can.status === 'Screening') color = 'yellow';
            else if (can.status === 'Shortlisted') color = 'sky';
            else if (can.status === 'Interview') color = 'orange';
            else if (can.status === 'Offer') color = 'violet';
            else if (can.status === 'Hired') color = 'green';
            else if (can.status === 'Rejected') color = 'red';

            // Helper to escape strings for the onclick attribute
            const esc = (str) => str ? str.replace(/'/g, "\\'") : "";

            // Arguments for the openModal function
            const resume_url = can.resume_url || "";
            const modalArgs = `${can.id}, '${esc(can.name)}', '${esc(can.role)}', '${can.status}', '${esc(email)}', '${esc(timeAgo)}', '${esc(phone)}', '${esc(location)}', '${esc(linkedin)}', '${esc(resume_url)}'`;

            // Create the List View Row
            const row = `
                <tr onclick="openModal(${modalArgs})">
                    <td><div class="user-cell"><div class="avatar-sm blue">${initial}</div><span class="name">${can.name}</span></div></td>
                    <td>${can.role}</td>
                    <td><span class="status-pill ${color}">${can.status}</span></td>
                    <td class="text-muted">${timeAgo}</td>
                    <td>N/A</td>
                    <td style="text-align: right;">
                        <button class="action-icon" onclick="event.stopPropagation(); deleteCandidate(${can.id})">
                            <i class="ph ph-trash"></i>
                        </button>
                    </td>
                </tr>`;
            if (tableBody) tableBody.innerHTML += row;

            // Create the Kanban Card for the Board View
            const cardHTML = `
                <div class="kanban-card" draggable="true" ondragstart="drag(event)" id="c${can.id}" 
                    onclick="openModal(${modalArgs})" >
                    <div class="card-header"><h4>${can.name}</h4></div>
                    <p class="role">${can.role}</p>
                    <div class="card-footer">
                        <div class="avatar-sm blue">${initial}</div>
                        <span class="date">${timeAgo}</span>
                    </div>
                </div>`;

            // 4. Map the status to the correct column ID
            const targetColId = `body-${STATUS_MAP[can.status] || can.status.toLowerCase()}`;
            const col = document.getElementById(targetColId);

            if (col) {
                col.innerHTML += cardHTML;
            }
        });

        // 5. Update the numeric counts at the top of columns
        updateCounts();
        showView();

    } catch (e) {
        console.error("Load failed:", e);
    }
}

const modal = document.getElementById('candidateModal');
const convertSection = document.getElementById('convertSection');
const convertNameSpan = document.getElementById('convertName');

function closeModal() { modal.classList.remove('show'); }

function openAddModal() {
    const addModal = document.getElementById('addCandidateModal');
    addModal.classList.add('show');
    addModal.style.display = 'flex';
    populateJobRoles();
}

function closeAddModal() {
    const addModal = document.getElementById('addCandidateModal');
    addModal.classList.remove('show');
    setTimeout(() => { addModal.style.display = 'none'; }, 200);
    document.getElementById('addCandidateForm').reset();
}

async function populateJobRoles() {
    const roleSelector = document.getElementById('newCandRole');
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/get_jobs`);
        const data = await response.json();
        roleSelector.innerHTML = data.jobs.map(j => `<option value="${j.title}">${j.title}</option>`).join('');
    } catch (e) { console.error("Job load failed:", e); }
}

async function handleNewCandidate(e) {
    e.preventDefault();
    const payload = {
        name: document.getElementById('newCandName').value,
        role: document.getElementById('newCandRole').value,
        email: document.getElementById('newCandEmail').value || "N/A",
        phone: document.getElementById('newCandPhone').value || "N/A",
        location: document.getElementById('newCandAddress').value || "N/A",
        notes: ""
    };
    const response = await fetch(`${CONFIG.API_BASE_URL}/candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (response.ok) { closeAddModal(); await loadCandidates(); }
}

function toggleFilterMenu(id) {
    const menu = document.getElementById(id);
    if (menu) {
        menu.classList.toggle('show');
        if (menu.classList.contains('show') && id === 'candidateFilter') {
            populateFilterRoles();
        }
    }
}

async function populateFilterRoles() {
    const filterSelector = document.getElementById('filterRole');
    if (!filterSelector) return;

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/get_jobs`);
        const data = await response.json();

        let optionsHTML = '<option value="all">All Roles</option>';

        if (data.jobs && data.jobs.length > 0) {
            data.jobs.forEach(job => {
                optionsHTML += `<option value="${job.title.toLowerCase()}">${job.title}</option>`;
            });
        }

        filterSelector.innerHTML = optionsHTML;
    } catch (error) {
        console.error("Error syncing filter roles:", error);
    }
}

function applyCandidateFilters() {
    const roleFilter = document.getElementById('filterRole').value.toLowerCase();
    const sortFilter = document.getElementById('filterSort').value;

    if (currentView === 'board') {
        document.querySelectorAll('.kanban-col').forEach(col => {
            const body = col.querySelector('.col-body');
            const cards = Array.from(body.querySelectorAll('.kanban-card'));

            cards.forEach(card => {
                const role = card.querySelector('.role').textContent.toLowerCase();
                card.style.display = (roleFilter === 'all' || role.includes(roleFilter)) ? 'block' : 'none';
            });

            cards.sort((a, b) => {
                const dateA = parseDate(a.querySelector('.date').textContent);
                const dateB = parseDate(b.querySelector('.date').textContent);
                return sortFilter === 'newest' ? dateB - dateA : dateA - dateB;
            });
            cards.forEach(card => body.appendChild(card));
        });
    } else {
        const rows = Array.from(document.querySelectorAll('#candidateListBody tr'));
        rows.forEach(row => {
            const role = row.children[1].textContent.toLowerCase();
            row.style.display = (roleFilter === 'all' || role.includes(roleFilter)) ? '' : 'none';
        });

        rows.sort((a, b) => {
            const dateA = parseDate(a.children[3].textContent);
            const dateB = parseDate(b.children[3].textContent);
            return sortFilter === 'newest' ? dateB - dateA : dateA - dateB;
        });
        rows.forEach(row => document.getElementById('candidateListBody').appendChild(row));
    }
    updateCounts();
    toggleFilterMenu('candidateFilter');
}

function parseDate(str) {
    const s = str.toLowerCase().trim();
    if (s.includes('just now')) return 0;
    const num = parseInt(s.match(/\d+/) || 0);
    if (s.includes('m')) return num;
    if (s.includes('h')) return num * 60;
    if (s.includes('d')) return num * 1440;
    return 99999;
}

async function deleteCandidate(id) {
    try {
        // Check if candidate has a schedule
        const card = document.getElementById(`c${id}`);
        const candidateName = card?.querySelector('h4')?.textContent || '';

        const schedRes = await fetch(`${CONFIG.API_BASE_URL}/get_schedules`);
        const schedData = await schedRes.json();
        const hasSchedule = schedData.some(s =>
            s.candidate_name?.toLowerCase() === candidateName.toLowerCase()
        );

        if (hasSchedule) {
            if (!confirm(`⚠️ "${candidateName}" has an existing interview schedule.\n\nDeleting them will not automatically cancel the interview.\n\nAre you sure?`)) return;
        } else {
            if (!confirm("Remove this candidate?")) return;
        }

        const response = await fetch(`${CONFIG.API_BASE_URL}/candidates/${id}`, { method: 'DELETE' });
        if (response.ok) await loadCandidates();
    } catch (err) {
        console.error("Delete check failed:", err);
        if (!confirm("Remove this candidate?")) return;
        const response = await fetch(`${CONFIG.API_BASE_URL}/candidates/${id}`, { method: 'DELETE' });
        if (response.ok) await loadCandidates();
    }
}

function updateCounts() {
    document.querySelectorAll('.kanban-col').forEach(col => {
        const count = col.querySelectorAll('.kanban-card:not([style*="display: none"])').length;
        const span = col.querySelector('.count');
        if (span) span.textContent = count;
    });
}

function formatTimeAgo(dateString) {
    if (!dateString) return "N/A";
    const past = new Date(dateString + "Z");
    const diff = Math.floor((new Date() - past) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return past.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function archiveCandidateColumn(status) {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/get_candidates`);
        const data = await response.json();
        const rows = (data.candidates || []).filter(c => c.status === status);

        if (!rows.length) {
            alert(`No candidates to archive in ${status}.`);
            return;
        }

        const okay = confirm(`Archive ${rows.length} ${status} candidate(s)? This will export PDF and remove them from the pipeline.`);
        if (!okay) return;

        if (window.jspdf && window.jspdf.jsPDF) {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape' });
            const exportRows = rows.map(can => [
                can.name || 'N/A',
                can.role || 'N/A',
                can.status || 'N/A',
                formatTimeAgo(can.created_at),
                'N/A'
            ]);

            doc.setFontSize(14);
            doc.text(`Pipeline Archive - ${status}`, 14, 14);
            doc.autoTable({
                startY: 22,
                head: [['Name', 'Role', 'Stage', 'Applied Date', 'Hiring Lead']],
                body: exportRows,
                styles: { fontSize: 10 },
                headStyles: { fillColor: [35, 46, 73] }
            });
            doc.save(`pipeline-archive-${status.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`);
        } else {
            alert("PDF library failed to load. Please refresh and try again.");
            return;
        }

        await Promise.all(rows.map(can =>
            fetch(`${CONFIG.API_BASE_URL}/candidates/${can.id}`, { method: 'DELETE' })
        ));

        await loadCandidates();
        alert(`${status} candidates archived successfully.`);
    } catch (error) {
        console.error("Archive failed:", error);
        alert("Failed to archive this column.");
    }
}

async function markAsHired(candidateId) {
    if (!confirm("Convert this candidate to a full-time employee?")) return;

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/candidates/${id}/hire`, {
            method: 'POST'
        });

        if (response.ok) {
            await loadCandidates();
            alert("Candidate hired successfully! Check the Employees tab.");
        }
    } catch (error) {
        console.error("Error during hiring process:", error);
    }
}
window.onload = loadCandidates;



function switchPipeline(pipelineType) {
    const btnCandidate = document.getElementById('btnCandidatePipeline');
    const btnEmployee = document.getElementById('btnEmployeePipeline');
    const kanbanCandidate = document.getElementById('kanbanView');
    const kanbanEmployee = document.getElementById('employeePipelineView');
    const listView = document.getElementById('listView');

    // Toggle Button States
    if (pipelineType === 'candidate') {
        btnCandidate.classList.add('active');
        btnEmployee.classList.remove('active');
    } else {
        btnEmployee.classList.add('active');
        btnCandidate.classList.remove('active');
    }

    // Pipeline Visibility Logic
    if (currentView === 'board') {
        listView.classList.add('hidden');
        if (pipelineType === 'candidate') {
            kanbanCandidate.style.display = 'flex';
            kanbanEmployee.style.display = 'none';
            loadCandidates(); // Load Board data for candidates
        } else {
            kanbanCandidate.style.display = 'none';
            kanbanEmployee.style.display = 'flex';
            loadEmployeeCycles(); // Load Board data for employees
        }
    } else {
        // List View Logic
        kanbanCandidate.style.display = 'none';
        kanbanEmployee.style.display = 'none';
        listView.classList.remove('hidden');

        if (pipelineType === 'candidate') {
            loadCandidates(); // This needs to handle the list body
        } else {
            loadEmployeeCycleList(); // New helper function for Employee List
        }
    }
}

// --- EMPLOYEE CYCLE ---

const CYCLE_STAGE_MAP = {
    'Pre-Employment': 'preemp',
    'Onboarding': 'onboarding',
    'Regularization': 'regular',
    'Exit Interview': 'exit',
    'Departure': 'departure'
};

const CYCLE_STAGE_COLOR_CLASS = {
    'Pre-Employment': 'orange',
    'Onboarding': 'violet',
    'Regularization': 'blue',
    'Exit Interview': 'yellow',
    'Departure': 'red'
};

const EMPLOYEE_STAGE_UI = {
    'Pre-Employment': {
        moduleType: 'checklist',
        moduleTitle: 'Pre-Hire Requirements',
        items: ['NBI Clearance', 'SSS / Pag-IBIG', 'Medical Exam']
    },
    'Onboarding': {
        moduleType: 'checklist',
        moduleTitle: 'Week 1 Orientation',
        titleColor: '#a855f7',
        items: ['IT System Setup', 'Company Handbook', 'Team Introduction']
    },
    'Regularization': {
        moduleType: 'progress',
        moduleTitle: 'Probation Period',
        progressText: 'Month 1 of 6',
        progressPercent: 17,
        actionLabel: 'Log Evaluation'
    },
    'Exit Interview': {
        moduleType: 'exit',
        moduleTitle: '<i class="ph ph-warning"></i> Action Required',
        reasons: ['Voluntary Resignation', 'Terminated', 'Health Reasons']
    },
    'Departure': {
        moduleType: 'none'
    }
};

function renderStageModule(cycle) {
    const stageUI = EMPLOYEE_STAGE_UI[cycle.stage] || { moduleType: 'none' };

    if (stageUI.moduleType === 'checklist') {
        const titleStyle = stageUI.titleColor ? ` style="color: ${stageUI.titleColor};"` : '';
        const itemsHTML = (stageUI.items || []).map((label) => `
            <label class="check-item">
                <input type="checkbox">
                ${label}
            </label>
        `).join('');

        return `
            <div class="card-module checklist-module">
                <p class="module-title"${titleStyle}>${stageUI.moduleTitle}</p>
                ${itemsHTML}
            </div>
        `;
    }

    if (stageUI.moduleType === 'progress') {
        const safeProgress = Math.min(100, Math.max(0, Number(stageUI.progressPercent) || 0));
        return `
            <div class="card-module progress-module">
                <div class="progress-header">
                    <span class="module-title">${stageUI.moduleTitle}</span>
                    <span class="progress-text">${stageUI.progressText || ''}</span>
                </div>
                <div class="progress-track">
                    <div class="progress-fill" style="width: ${safeProgress}%;"></div>
                </div>
                <button class="btn-primary-small w-100 mt-2">${stageUI.actionLabel || 'Update'}</button>
            </div>
        `;
    }

    if (stageUI.moduleType === 'exit') {
        const reasonOptions = (stageUI.reasons || []).map(reason => `<option value="${reason}">${reason}</option>`).join('');
        return `
            <div class="card-module exit-module">
                <p class="module-title text-danger">${stageUI.moduleTitle}</p>
                <select class="card-select">
                    <option value="" disabled selected>Select Reason...</option>
                    ${reasonOptions}
                </select>
            </div>
        `;
    }

    return '';
}

async function loadEmployeeCycles() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/get_employee_cycles`);
        const cycles = await response.json();

        // Clear all cycle columns first
        Object.values(CYCLE_STAGE_MAP).forEach(id => {
            const el = document.getElementById(`body-${id}`);
            if (el) el.innerHTML = '';
        });

        cycles.forEach(cycle => {
            const stageSpecificHTML = renderStageModule(cycle);

            const cardHTML = `
        <div class="kanban-card" draggable="true" ondragstart="drag(event)" id="ec${cycle.id}"
            style="border-radius: 10px;">
            
            <div>
                <div class="card-header">
                    <h4>${cycle.full_name}</h4>
                </div>
                <p class="role">${cycle.position}</p>
                
                ${stageSpecificHTML}
            </div>
        </div>`;

            const colId = `body-${CYCLE_STAGE_MAP[cycle.stage] || 'preemp'}`;
            const col = document.getElementById(colId);
            if (col) col.innerHTML += cardHTML;
        });

        updateCounts();
    } catch (e) {
        console.error("Load employee cycles failed:", e);
    }
}

async function loadEmployeeCycleList() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/get_employee_cycles`);
        const cycles = await response.json();
        const tableBody = document.getElementById('candidateListBody');
        if (!tableBody) return;

        tableBody.innerHTML = ''; // Clear existing rows

        cycles.forEach(cycle => {
            const initial = cycle.full_name ? cycle.full_name.charAt(0).toUpperCase() : 'E';
            const pillClass = CYCLE_STAGE_COLOR_CLASS[cycle.stage] || 'blue';
            const row = `
                <tr onclick="openCycleModal(${cycle.id}, '${cycle.full_name}', '${cycle.position}', '${cycle.stage}', '${cycle.department}')">
                    <td>
                        <div class="user-cell">
                            <div class="avatar-sm blue" style="width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:#dbeafe; color:#1e40af; font-weight:bold;">
                                ${initial}
                            </div>
                            <span class="name">${cycle.full_name}</span>
                        </div>
                    </td>
                    <td>${cycle.position}</td>
                    <td><span class="status-pill ${pillClass}">${cycle.stage}</span></td>
                    <td class="text-muted">${cycle.department}</td>
                    <td>${cycle.days_on_board || 0} Days</td>
                    <td style="text-align: right;">
                        <button class="action-icon" onclick="event.stopPropagation(); openCycleModal(${cycle.id})">
                            <i class="ph ph-trash"></i>
                        </button>
                    </td>
                </tr>`;
            tableBody.innerHTML += row;
        });
    } catch (e) {
        console.error("Load employee cycle list failed:", e);
    }
}

async function dropCycle(ev) {
    ev.preventDefault();
    document.querySelectorAll('.kanban-col').forEach(col => col.classList.remove('drag-over'));

    const data = ev.dataTransfer.getData("text");
    if (!data.startsWith('ec')) return;

    const card = document.getElementById(data);
    const column = ev.target.closest('.kanban-col');
    if (!card || !column) return;

    const newStage = column.getAttribute('data-stage');
    const cycleId = data.replace('ec', '');

    const body = column.querySelector('.col-body');
    if (body) body.appendChild(card);

    try {
        // 1. Update cycle stage
        await fetch(`${CONFIG.API_BASE_URL}/employee_cycles/${cycleId}/stage`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stage: newStage })
        });

        // 2. Get cycle to find employee name
        const cycleRes = await fetch(`${CONFIG.API_BASE_URL}/get_employee_cycles`);
        const cycles = await cycleRes.json();
        const cycle = cycles.find(c => c.id == cycleId);

        if (cycle) {
            // 3. Find employee by name
            const empRes = await fetch(`${CONFIG.API_BASE_URL}/get_employees`);
            const employees = await empRes.json();
            const matchedEmp = employees.find(e => e.full_name === cycle.full_name);

            if (matchedEmp) {
                // 4. Use simple status-only endpoint
                await fetch(`${CONFIG.API_BASE_URL}/employees/${matchedEmp.id}/status`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: newStage })
                });
            }
        }

        await loadEmployeeCycles();
    } catch (e) {
        console.error("Cycle stage update failed:", e);
    }
}

function openCycleModal(id, name, position, stage, department) {
    // You can build a simple modal for this later
    // For now just a confirm to remove from cycle
    if (confirm(`Remove ${name} from Employee Cycle?`)) {
        fetch(`${CONFIG.API_BASE_URL}/employee_cycles/${id}`, { method: 'DELETE' })
            .then(() => loadEmployeeCycles());
    }
}