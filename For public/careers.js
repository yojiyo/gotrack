const modal = document.getElementById('applicationModal');
const backdrop = document.getElementById('modalBackdrop');
const panel = document.getElementById('modalPanel');
const successModal = document.getElementById('successModal');
const successBackdrop = document.getElementById('successBackdrop');
const successPanel = document.getElementById('successPanel');

let allJobs = [];

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
    loadCareersPageJobs();
    loadDepartments();
});

function openModal(title) {
    document.getElementById('modalJobTitle').innerText = title;
    const salaryEl = document.getElementById('modalSalary');
    if (salaryEl) salaryEl.style.display = 'none';

    goToStep(1);
    document.getElementById('wizardForm').reset();

    modal.classList.remove('hidden');
    setTimeout(() => {
        backdrop.classList.remove('opacity-0');
        panel.classList.remove('opacity-0', 'translate-y-4', 'scale-95');
        panel.classList.add('opacity-100', 'translate-y-0', 'scale-100');
    }, 10);
}

function closeModal() {
    backdrop.classList.add('opacity-0');
    panel.classList.add('opacity-0', 'translate-y-4', 'scale-95');
    panel.classList.remove('opacity-100', 'translate-y-0', 'scale-100');
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
}

function nextStep(stepNumber) {
    const currentStepNum = stepNumber - 1;
    const currentStepEl = document.getElementById('step' + currentStepNum);
    const errorBox = document.getElementById('error-step' + currentStepNum);

    if (currentStepEl) {
        const requiredInputs = currentStepEl.querySelectorAll('input[required], textarea[required]');
        let stepIsValid = true;

        requiredInputs.forEach(input => {
            if ((input.type === 'text' || input.type === 'email' || input.type === 'tel' || input.type === 'url') && !input.value.trim()) {
                stepIsValid = false;
                input.classList.add('border-red-500');
            } else if (input.type === 'file' && input.files.length === 0) {
                stepIsValid = false;
                const container = input.closest('.file-upload-container');
                if (container) container.classList.add('border-red-500');
            } else if (input.type === 'radio') {
                const name = input.getAttribute('name');
                const checked = currentStepEl.querySelector(`input[name="${name}"]:checked`);
                if (!checked) stepIsValid = false;
            } else {
                input.classList.remove('border-red-500');
                const container = input.closest('.file-upload-container');
                if (container) container.classList.remove('border-red-500');
            }
        });

        if (!stepIsValid) {
            if (errorBox) errorBox.classList.remove('hidden');
            return;
        }
        if (errorBox) errorBox.classList.add('hidden');
    }
    goToStep(stepNumber);
}

function goToStep(stepNumber) {
    document.querySelectorAll('.wizard-step').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById('step' + stepNumber);
    if (target) {
        target.classList.remove('hidden');
        updateIndicators(stepNumber);
    }
}

function updateIndicators(activeStep) {
    const items = document.querySelectorAll('.step-item');
    items.forEach((item, index) => {
        const circle = item.querySelector('div');
        const stepNum = index + 1;
        if (stepNum === activeStep) {
            item.className = 'step-item flex items-center gap-3 text-primary font-bold transition-all';
            circle.className = 'w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm ring-4 ring-blue-100';
            circle.innerText = stepNum;
        } else if (stepNum < activeStep) {
            item.className = 'step-item flex items-center gap-3 text-green-600 font-medium transition-all';
            circle.className = 'w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-sm';
            circle.innerHTML = '<i class="ph-bold ph-check"></i>';
        } else {
            item.className = 'step-item flex items-center gap-3 text-slate-400 transition-all';
            circle.className = 'w-8 h-8 rounded-full border-2 border-slate-200 flex items-center justify-center text-sm';
            circle.innerText = stepNum;
        }
    });
}

function handleFile(input) {
    if (!input.files[0]) return;
    const fileName = input.files[0].name;
    document.getElementById('uploadText').innerHTML = `
        <div class="text-green-500 font-bold flex items-center justify-center gap-2">
            <i class="ph-fill ph-check-circle text-xl"></i> File Selected
        </div>
        <p class="text-xs text-slate-500 mt-1 truncate max-w-[200px] mx-auto">${fileName}</p>
    `;
}

function toggleAddressField(value) {
    const addressField = document.getElementById('addressField');
    const addressInput = document.getElementById('homeAddress');
    if (value === 'yes') {
        addressField.classList.remove('hidden');
        addressInput.setAttribute('required', 'true');
    } else {
        addressField.classList.add('hidden');
        addressInput.removeAttribute('required');
        addressInput.value = '';
    }
}

async function submitApplication(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalContent = btn.innerHTML;

    try {
        const formData = new FormData();

        // Combine names
        const fName = document.getElementById('firstName').value;
        const lName = document.getElementById('lastName').value;

        // Append all fields to FormData
        formData.append('name', `${fName} ${lName}`);
        formData.append('email', document.getElementById('email').value);
        formData.append('role', document.getElementById('modalJobTitle').innerText);
        formData.append('phone', document.getElementById('phone').value);
        formData.append('linkedin', document.getElementById('linkedin').value);
        formData.append('portfolio', document.getElementById('portfolio').value);
        formData.append('notes', document.getElementById('applicationNotes').value || "Applied via Careers Page");

        const locationValue = document.querySelector('input[name="location"]:checked')?.value;
        const homeAddress = document.getElementById('homeAddress').value;
        formData.append('location', locationValue === 'yes' ? homeAddress : 'N/A');

        // Append the PDF file
        const resumeFile = document.getElementById('resume').files[0];
        formData.append('resume', resumeFile);

        btn.innerHTML = `<i class="ph-bold ph-spinner animate-spin"></i> Submitting...`;
        btn.disabled = true;

        const response = await fetch(`${CONFIG.API_BASE_URL}/submit-application`, {
            method: 'POST',
            body: formData // Sending as FormData, not JSON
        });

        if (response.ok) {
            closeModal();
            setTimeout(() => {
                openSuccessModal();
                e.target.reset();
            }, 300);
        } else {
            alert("Failed to submit. Check the console.");
        }
    } catch (err) {
        console.error("Submission failed:", err);
    } finally {
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
}

function openSuccessModal() {
    successModal.classList.remove('hidden');
    setTimeout(() => {
        successBackdrop.classList.remove('opacity-0');
        successPanel.classList.remove('opacity-0', 'scale-90');
        successPanel.classList.add('opacity-100', 'scale-100');
    }, 10);
}

function closeSuccessModal() {
    successBackdrop.classList.add('opacity-0');
    successPanel.classList.remove('opacity-100', 'scale-100');
    successPanel.classList.add('opacity-0', 'scale-90');
    setTimeout(() => { successModal.classList.add('hidden'); }, 300);
}

async function loadCareersPageJobs() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/get_jobs`);
        const data = await response.json();
        allJobs = data.jobs.filter(job => job.status === 'Open');
        renderJobCards(allJobs);
    } catch (error) {
        console.error("Error loading jobs:", error);
    }
}

function renderJobCards(jobs) {
    const container = document.getElementById('dynamic-jobs-container');
    if (!container) return; // Guard clause
    container.innerHTML = '';

    jobs.forEach(job => {
        let icon = 'ph-code';
        let colorClass = 'bg-green-50 text-green-600';
        const dept = (job.department || "").toLowerCase();

        if (dept.includes('design') || dept.includes('product')) {
            icon = 'ph-paint-brush';
            colorClass = 'bg-purple-50 text-purple-600';
        } else if (dept.includes('marketing')) {
            icon = 'ph-megaphone';
            colorClass = 'bg-orange-50 text-orange-600';
        }

        const card = `
            <div class="bg-white p-8 rounded-3xl shadow-card hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
                <div class="flex justify-between items-start mb-6">
                    <div class="w-12 h-12 rounded-2xl ${colorClass} flex items-center justify-center">
                        <i class="ph-bold ${icon} text-xl"></i>
                    </div>
                    <span class="px-3 py-1 ${colorClass} text-xs font-bold rounded-full uppercase tracking-wider">${job.department}</span>
                </div>
                <h3 class="text-xl font-bold text-dark mb-4 group-hover:text-primary transition-colors">${job.title}</h3>
                <div class="space-y-3 mb-8">
                    <div class="flex items-center gap-2 text-sm text-subtle">
                        <i class="ph-bold ph-map-pin"></i> ${job.location}
                    </div>
                    <div class="flex items-center gap-2 text-sm text-subtle">
                        <i class="ph-bold ph-clock"></i> Full-time
                    </div>
                </div>
                ${job.status === 'Open'
                ? `<button onclick="openModal('${job.title}')" class="w-full bg-dark hover:bg-primary text-white font-bold py-3.5 rounded-xl transition-colors shadow-lg shadow-slate-900/10">Apply Now</button>`
                : `<button disabled class="w-full bg-slate-100 text-slate-400 font-bold py-3.5 rounded-xl cursor-not-allowed flex items-center justify-center gap-2"><i class="ph ph-lock-simple"></i> Position Filled</button>`
            }
            </div>
        `;
        container.innerHTML += card;
    });
}

async function loadDepartments() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/get_departments`);
        const departments = await response.json();
        const filterContainer = document.getElementById('department-filters');
        if (!filterContainer) return;

        // Clear except "All" button
        filterContainer.querySelectorAll('.dept-btn:not(:first-child)').forEach(el => el.remove());

        departments.forEach(dept => {
            const btn = document.createElement('button');
            btn.className = "dept-btn px-4 py-2 rounded-lg bg-transparent text-subtle hover:text-slate-900 text-sm font-medium transition-all";
            btn.textContent = dept;
            btn.onclick = () => filterByDept(dept, btn);
            filterContainer.appendChild(btn);
        });
    } catch (error) {
        console.error("Error loading departments:", error);
    }
}

function filterByDept(dept, activeBtn) {
    document.querySelectorAll('.dept-btn').forEach(btn => {
        btn.classList.remove('bg-slate-100', 'text-slate-900', 'font-semibold');
        btn.classList.add('bg-transparent', 'text-subtle', 'font-medium');
    });

    const targetBtn = activeBtn || document.querySelector('.dept-btn');
    if (targetBtn) {
        targetBtn.classList.add('bg-slate-100', 'text-slate-900', 'font-semibold');
        targetBtn.classList.remove('bg-transparent', 'text-subtle', 'font-medium');
    }

    const filtered = (dept === 'All') ? allJobs : allJobs.filter(job => job.department === dept && job.status === 'Open');
    renderJobCards(filtered);
}