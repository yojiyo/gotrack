/* schedule.js - Final Version: Date Picker + Mark as Done */

let currentStartDate = new Date();
currentStartDate.setHours(0, 0, 0, 0);

const workHours = [];
for (let h = 0; h <= 23; h++) {
    const hour = h.toString().padStart(2, '0');
    workHours.push(`${hour}:00`);
    workHours.push(`${hour}:30`);
}

let dbEvents = [];
let currentCandidateName = "";
let currentCandidateRole = "";
let currentCandidateId = null;
let currentCandidateEmail = "";
let targetSlotData = null;
let isReschedule = false;
let zoomLinkMap = {};

// --- COLOR PALETTE ---
function getColorForCandidate(name) {
    if (!name) return { bg: '#e2e8f0', text: '#475569', border: '#94a3b8' };
    const colors = [
        { bg: '#dbeafe', text: '#1e40af', border: '#2563eb' }, // Blue
        { bg: '#fce7f3', text: '#9d174d', border: '#db2777' }, // Pink
        { bg: '#dcfce7', text: '#166534', border: '#16a34a' }, // Green
        { bg: '#fef3c7', text: '#92400e', border: '#d97706' }, // Amber
        { bg: '#e0e7ff', text: '#3730a3', border: '#4f46e5' }, // Indigo
        { bg: '#f3e8ff', text: '#6b21a8', border: '#9333ea' }, // Purple
        { bg: '#ffedd5', text: '#9a3412', border: '#ea580c' }, // Orange
        { bg: '#ccfbf1', text: '#115e59', border: '#0d9488' }, // Teal
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) { hash = name.charCodeAt(i) + ((hash << 5) - hash); }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadSchedules();
    await initUnscheduledList();
    renderCalendar();

    document.getElementById('prevWeekBtn').addEventListener('click', () => changeWeek(-7));
    document.getElementById('nextWeekBtn').addEventListener('click', () => changeWeek(7));

    // Scroll calendar body to 8:00 AM on load
    setTimeout(() => {
        const calBody = document.getElementById('calBody');
        const slot8am = calBody.querySelector('[data-time="07:30"]');
        if (slot8am && calBody) {
            calBody.scrollTop = slot8am.offsetTop;
        }
    }, 100);
});

// --- 1. DATA LOADING ---
async function loadSchedules() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/get_schedules`);
        const schedules = await response.json();
        dbEvents = [];

        schedules.forEach(item => {
            if (item.status === 'Interviewed') return;

            if (item.date && item.date !== "To be scheduled" && item.date !== "Not Set" && item.time && item.time !== "TBD" && item.response_status !== 'Cancelled') {
                dbEvents.push({
                    id: item.id,
                    candidate: item.candidate_name,
                    role: item.role,
                    date: item.date,
                    time: item.time,
                    duration: item.duration || 60,
                    status: item.status || "confirmed",
                    response_status: item.response_status || "Pending",
                    zoom_link: item.zoom_link || null
                });
                zoomLinkMap[item.candidate_name] = item.zoom_link || null;
            }
        });
    } catch (e) { console.error("Load schedules error:", e); }
}

async function initUnscheduledList() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/get_schedules`);
        const schedules = await response.json();
        const listEl = document.getElementById('unscheduledList');
        const badgeEl = document.getElementById('countBadge');
        listEl.innerHTML = '';

        // Filter: Only show candidates who have NO date set AND are not 'Done'
        let unscheduled = schedules.filter(s =>
            s.candidate_name &&
            s.status !== 'Done' &&
            s.status !== 'Interviewed' &&
            s.status !== 'Hired' &&
            s.status !== 'Offer' &&
            s.status !== 'Rejected' &&
            (!s.date || s.date === "To be scheduled" || s.date === "Not Set" || s.date === "TBD")
        );

        if (unscheduled.length > 0) {
            unscheduled.forEach(can => {
                const initials = can.candidate_name.charAt(0).toUpperCase();
                const color = getColorForCandidate(can.candidate_name);
                console.log("Candidate data found:", can);
                listEl.innerHTML += `
                    <div class="drag-card" draggable="true" 
                        data-id="${can.id}" 
                        data-name="${can.candidate_name}" 
                        data-role="${can.role}"
                        data-email="${can.email || 'N/A'}" 
                        ondragstart="handleDragStart(event)">
                      <div class="dc-left">
                        <div class="dc-avatar" style="background:${color.bg}; color:${color.text}; border:1px solid ${color.bg}">${initials}</div>
                        <div class="dc-info">
                          <strong>${can.candidate_name}</strong>
                          <span>${can.role}</span>
                        </div>
                      </div>
                      <i class="ph ph-dots-six-vertical drag-handle"></i>
                    </div>`;
            });
            badgeEl.textContent = unscheduled.length;
        } else {
            listEl.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8; font-size:13px;">No candidates to schedule</div>';
            badgeEl.textContent = "0";
        }
    } catch (e) { console.error("Unscheduled list error:", e); }
}

// --- 2. RENDER CALENDAR ---
function renderCalendar() {
    const bodyEl = document.getElementById('calBody');
    const labelEl = document.getElementById('currentWeekLabel');

    const weekDates = [];
    let loopDate = new Date(currentStartDate);
    const day = loopDate.getDay();
    const diff = loopDate.getDate() - day + (day === 0 ? -6 : 1);
    loopDate.setDate(diff);

    for (let i = 0; i < 5; i++) {
        weekDates.push(new Date(loopDate));
        loopDate.setDate(loopDate.getDate() + 1);
    }

    const startStr = weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = weekDates[4].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    labelEl.textContent = `${startStr} - ${endStr}`;

    let html = '<div class="header-row"><div></div>';

    const getLocalISO = (d) => {
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().split('T')[0];
    };

    weekDates.forEach(dateObj => {
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
        const dateNum = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const dateIso = getLocalISO(dateObj);
        const todayIso = getLocalISO(new Date());

        const isToday = (dateIso === todayIso);
        html += `<div class="day-col ${isToday ? 'active' : ''}">${dayName}, ${dateNum}</div>`;
    });
    html += '</div>';

    workHours.forEach(time => {
        html += `<div class="time-row"><div class="time-label">${time}</div>`;
        weekDates.forEach(dateObj => {
            const dateIso = getLocalISO(dateObj);
            const slotId = `slot-${dateIso}-${time}`;
            html += `<div class="slot" id="${slotId}" data-date="${dateIso}" data-time="${time}"></div>`;
        });
        html += `</div>`;
    });

    bodyEl.innerHTML = html;
    setupDropZones();
    renderEvents();
}

function getResponseBadge(response_status) {
    const map = {
        'Pending': { label: '⏳ Pending', bg: '#fef9c3', color: '#ca8a04' },
        'Confirmed': { label: '✅ Confirmed', bg: '#dcfce7', color: '#16a34a' },
        'Declined': { label: '❌ Declined', bg: '#fee2e2', color: '#dc2626' },
        'Reschedule Requested': { label: '🔄 Reschedule Requested', bg: '#ffedd5', color: '#d97706' }
    };
    const badge = map[response_status] || map['Pending'];
    return `<div style="margin-top:4px; display:inline-block; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:700; background:${badge.bg}; color:${badge.color};">${badge.label}</div>`;
}

function snapToSlot(time) {
    const [h, m] = time.split(':').map(Number);
    const snapped = m < 30 ? '00' : '30';
    return `${h.toString().padStart(2, '0')}:${snapped}`;
}

function renderEvents() {
    dbEvents.forEach(event => {
        const snappedTime = snapToSlot(event.time);
        const slotId = `slot-${event.date}-${snappedTime}`;
        const slotEl = document.getElementById(slotId);

        if (slotEl) {
            const heightMultiplier = event.duration / 30;
            const heightPercent = (heightMultiplier * 100) - 5;
            const isDone = event.response_status === 'Done';
            const color = isDone
                ? { bg: '#f1f5f9', text: '#94a3b8', border: '#cbd5e1' }
                : getColorForCandidate(event.candidate);
            const responseBadge = isDone
                ? `<div style="margin-top:4px; display:inline-block; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:700; background:#dcfce7; color:#16a34a;">✅ Done</div>`
                : getResponseBadge(event.response_status);

                slotEl.innerHTML = `
                <div class="event-card" 
                     draggable="false" 
                     style="height: ${heightPercent}%; background:${color.bg}; border-left: 3px solid ${color.border}; color:${color.text};"
                     onclick="openViewModal('${event.candidate}', '${event.role}', '${event.date}', '${event.time}', '${event.duration}', '${event.response_status}')"
                  <strong>${event.candidate}</strong>
                  <span>${event.duration} min • ${event.role}</span>
                  <div class="zoom-link" style="color:${color.text}; opacity:0.8;"><i class="ph ph-video-camera"></i> Zoom</div>
                  ${responseBadge}
                </div>
             `;
        }
    });
}

// --- 3. DRAG & DROP ---
function handleDragStart(e) {
    const card = e.currentTarget;
    currentCandidateName = card.getAttribute('data-name');
    currentCandidateRole = card.getAttribute('data-role');
    currentCandidateId = card.getAttribute('data-id');

    // Grabbing the email from the attribute we just added above
    currentCandidateEmail = card.getAttribute('data-email');

    console.log("Picked up candidate:", currentCandidateName, "Email:", currentCandidateEmail);
    e.dataTransfer.setData("text", "newCand");
}

function setupDropZones() {
    document.querySelectorAll('.slot').forEach(slot => {
        slot.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!slot.hasChildNodes()) slot.classList.add('drag-over');
        });
        slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));

        slot.addEventListener('drop', (e) => {
            e.preventDefault();
            slot.classList.remove('drag-over');

            targetSlotData = {
                date: slot.getAttribute('data-date'),
                time: slot.getAttribute('data-time')
            };
            openEditModal(currentCandidateName, currentCandidateRole, targetSlotData.date, targetSlotData.time);
        });
    });
}

// --- 4. MODALS ---
const modal = document.getElementById('bookingModal');
const modalContent = document.querySelector('#bookingModal .modal-content');
const loadingModal = document.getElementById('loadingModal');
const successModal = document.getElementById('successModal');

function closeModal() { modal.classList.remove('show'); }
function closeSuccessModal() { successModal.classList.remove('show'); }

// EDIT MODAL (Date + Time)
function openEditModal(name, role, date, time) {
    targetSlotData = { date: date, time: time };
    const safeDate = date || new Date().toISOString().split('T')[0];
    const color = getColorForCandidate(name);

    modalContent.innerHTML = `
        <div class="modal-header" style="display:flex; justify-content:space-between; margin-bottom:20px;">
            <h3 style="margin:0; font-size:18px;">Schedule Interview</h3>
            <button onclick="closeModal()" style="border:none; background:none; cursor:pointer;"><i class="ph ph-x"></i></button>
        </div>
        
        <div class="candidate-summary" style="background:${color.bg}; padding:12px; border-radius:8px; display:flex; gap:12px; align-items:center; margin-bottom:20px;">
            <div style="width:40px; height:40px; background:white; color:${color.text}; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700;">${name.charAt(0)}</div>
            <div>
                <h4 style="margin:0; font-size:14px; color:${color.text};">${name}</h4>
                <p style="margin:0; font-size:12px; color:${color.text}; opacity:0.8;">${role}</p>
            </div>
        </div>

        <div style="margin-bottom:16px;">
            <label style="display:block; font-size:12px; font-weight:600; color:#64748b; margin-bottom:6px;">Date</label>
            <input type="date" id="editDateInput" value="${safeDate}" 
                   style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:8px; outline:none; font-family:inherit; color:#1e293b;">
        </div>

        <div style="display:flex; gap:16px; margin-bottom:20px;">
            <div style="flex:1;">
                <label style="display:block; font-size:12px; font-weight:600; color:#64748b; margin-bottom:6px;">Start Time</label>
                <input type="time" id="editTimeInput" value="${time}" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:8px; outline:none; font-family:inherit;">
            </div>
            <div style="flex:1;">
                <label style="display:block; font-size:12px; font-weight:600; color:#64748b; margin-bottom:6px;">Duration</label>
                <select id="durationInput" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:8px; outline:none;">
                    <option value="30">30 Minutes</option>
                    <option value="45">45 Minutes</option>
                    <option value="60" selected>1 Hour</option>
                </select>
            </div>
        </div>

        <div style="font-size:13px; color:#2563eb; display:flex; align-items:center; gap:6px;">
            <i class="ph ph-video-camera"></i> Zoom Meeting (Auto-generated)
        </div>

        <div style="margin-top:24px; display:flex; justify-content:flex-end; gap:10px; padding-top:16px; border-top:1px solid #f1f5f9;">
            <button onclick="closeModal()" class="btn-text" style="padding:10px 16px; border:1px solid #e2e8f0; background:white; border-radius:6px; cursor:pointer;">Cancel</button>
            <button onclick="confirmBooking()" class="btn-primary" style="padding:10px 16px; border:none; background:#2563eb; color:white; border-radius:6px; cursor:pointer;">Schedule & Send Invite</button>
        </div>
    `;
    modal.classList.add('show');
}

// VIEW MODAL (Details + Mark as Done)
function openViewModal(name, role, date, time, duration, response_status = 'Pending') {
    const zoom_link = zoomLinkMap[name] || null;
    console.log("zoomLinkMap:", zoomLinkMap);        
    console.log("zoom_link for", name, ":", zoom_link); 
    const color = getColorForCandidate(name);

    modalContent.innerHTML = `
        <div class="modal-header" style="display:flex; justify-content:space-between; margin-bottom:20px;">
            <h3 style="margin:0; font-size:18px;">Interview Details</h3>
            <button onclick="closeModal()" style="border:none; background:none; cursor:pointer;"><i class="ph ph-x"></i></button>
        </div>

        <div class="candidate-summary" style="background:${color.bg}; padding:12px; border-radius:8px; display:flex; gap:12px; align-items:center; margin-bottom:20px;">
            <div style="width:40px; height:40px; background:white; color:${color.text}; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700;">${name.charAt(0)}</div>
            <div>
                <h4 style="margin:0; font-size:14px; color:${color.text};">${name}</h4>
                <p style="margin:0; font-size:12px; color:${color.text}; opacity:0.8;">${role}</p>
            </div>
        </div>

        <div style="background:#f8fafc; padding:20px; border-radius:12px; margin-bottom:20px; border:1px solid #e2e8f0;">
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:14px;">
                <span style="color:#64748b;">Date</span> <strong>${date}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:14px;">
                <span style="color:#64748b;">Time</span> <strong>${time}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:14px;">
                <span style="color:#64748b;">Duration</span> <strong>${duration} min</strong>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:14px; padding-top:8px; border-top:1px solid #e2e8f0; margin-top:8px;">
        <span style="color:#64748b;">Zoom Link</span>
        <span>${zoom_link
            ? `<a href="${zoom_link}" target="_blank" style="color:#2563eb; font-weight:600; font-size:13px; display:flex; align-items:center; gap:4px;"><i class="ph ph-video-camera"></i> Join Meeting</a>`
            : `<span style="color:#94a3b8; font-size:13px;">Not generated yet</span>`
        }</span>
    </div>
            <div style="display:flex; justify-content:space-between; font-size:14px; padding-top:8px; border-top:1px solid #e2e8f0; margin-top:8px;">
                <span style="color:#64748b;">Candidate Response</span>
                <span>${getResponseBadge(response_status)}</span>
            </div>
        </div>

        <div style="display:flex; justify-content:space-between; gap:10px; margin-top:24px; padding-top:16px; border-top:1px solid #f1f5f9;">
            <button onclick="cancelInterview('${name}')" style="color:#ef4444; background:none; border:none; font-weight:600; cursor:pointer; font-size:14px;">
                Cancel
            </button>

            <div style="display:flex; gap:8px;">
                 <button onclick="rescheduleInterview('${name}', '${role}', '${date}', '${time}')" style="background:white; color:#2563eb; border:1px solid #2563eb; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:600; font-size:13px;">
                    Reschedule
                </button>
                
                <button onclick="markAsDone('${name}')" style="background:#16a34a; color:white; border:none; padding:8px 16px; border-radius:6px; cursor:pointer; font-weight:600; font-size:13px; display:flex; align-items:center; gap:6px;">
                    <i class="ph-bold ph-check"></i> Mark as Done
                </button>
            </div>
        </div>
    `;
    modal.classList.add('show');
}

// --- 5. ACTIONS ---

async function confirmBooking() {
    const duration = document.getElementById('durationInput').value;
    const finalTime = document.getElementById('editTimeInput').value;
    const finalDate = document.getElementById('editDateInput').value;

    const payload = {
        name: currentCandidateName,
        role: currentCandidateRole,
        date: finalDate,
        time: finalTime,
        duration: parseInt(duration)
    };

    closeModal();
    loadingModal.classList.add('show');

    try {
        // 1. Save to Database
        const response = await fetch(`${CONFIG.API_BASE_URL}/schedules/auto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            // --- DEBUG LOGS START ---
            console.log("Database updated successfully!");
            console.log("Sending email to:", currentCandidateEmail);
            // --- DEBUG LOGS END ---

            // 2. Send Email Invite
            // 2. Send Email — different endpoint for reschedule vs new invite
            const emailEndpoint = isReschedule
                ? '/schedule/send-reschedule'
                : '/schedule/send-invite';

            const emailResponse = await fetch(`${CONFIG.API_BASE_URL}${emailEndpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: currentCandidateEmail,
                    name: currentCandidateName,
                    date: finalDate,
                    time: finalTime,
                    role: currentCandidateRole
                })
            });

            const emailStatus = await emailResponse.json();
            console.log("Email backend response:", emailStatus);

            // Reset reschedule flag
            isReschedule = false;

            await loadSchedules();
            await initUnscheduledList();
            renderCalendar();

            loadingModal.classList.remove('show');
            successModal.classList.add('show');
            currentCandidateName = "";
        } else {
            loadingModal.classList.remove('show');
            alert("Error scheduling interview");
        }
    } catch (e) {
        console.error("Booking error:", e);
        loadingModal.classList.remove('show');
    }
}

async function markAsDone(name) {
    if (!confirm(`Mark interview with ${name} as completed?`)) return;

    try {
        // Update schedule response_status to "Done" in DB
        const schedulesRes = await fetch(`${CONFIG.API_BASE_URL}/get_schedules`);
        const schedules = await schedulesRes.json();
        const match = schedules.find(s => s.candidate_name === name);

        if (match) {
            await fetch(`${CONFIG.API_BASE_URL}/schedules/${match.id}/mark-done`, {
                method: 'PATCH'
            });
        }

        closeModal();
        await loadSchedules();
        renderCalendar();
    } catch (e) { console.error("Mark Done error:", e); }
}

async function cancelInterview(name) {
    if (!confirm(`Cancel interview for ${name}?`)) return;

    try {
        // Get candidate email from schedules
        const schedulesRes = await fetch(`${CONFIG.API_BASE_URL}/get_schedules`);
        const schedules = await schedulesRes.json();
        const match = schedules.find(s => s.candidate_name === name);
        const email = match?.email || null;
        const role = match?.role || "";
        const date = match?.date || "";
        const time = match?.time || "";

        const response = await fetch(`${CONFIG.API_BASE_URL}/schedules/unschedule/${encodeURIComponent(name)}`, {
            method: 'PATCH'
        });

        if (response.ok) {
            // Send cancellation email
            if (email && email !== "N/A") {
                await fetch(`${CONFIG.API_BASE_URL}/schedule/send-cancel`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, name, role, date, time })
                });
            }

            closeModal();
            await loadSchedules();
            await initUnscheduledList();
            renderCalendar();
        }
    } catch (e) { console.error("Cancel error:", e); }
}

async function rescheduleInterview(name, role, date, time) {
    currentCandidateName = name;
    currentCandidateRole = role;
    isReschedule = true;

    try {
        const schedulesRes = await fetch(`${CONFIG.API_BASE_URL}/get_schedules`);
        const schedules = await schedulesRes.json();
        const match = schedules.find(s => s.candidate_name === name);
        currentCandidateEmail = match?.email || "N/A";
    } catch (e) {
        console.error("Could not fetch email for reschedule:", e);
    }

    openEditModal(name, role, date, time);
}

function changeWeek(days) {
    currentStartDate.setDate(currentStartDate.getDate() + days);
    renderCalendar();
}

function allowDropUnscheduled(ev) { ev.preventDefault(); }
function dropToUnscheduled(ev) { ev.preventDefault(); }