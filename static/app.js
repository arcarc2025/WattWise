
const $ = id => document.getElementById(id);

let appData = { appliances: [] };
let currentUser = null;

const money = n => Number(n || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const number = money;
const icons = ["▣", "▤", "▱", "◉", "▥", "⌂", "▦"];

async function api(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    let data = {};

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (response.status === 401) {
        window.location.href = "/login";
        throw new Error("Your session has expired. Please log in again.");
    }

    if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
    }

    return data;
}

function toast(message) {
    const element = $("toast");
    if (!element) return;

    element.textContent = message;
    element.classList.add("show");

    setTimeout(() => {
        element.classList.remove("show");
    }, 2600);
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[ch]);
}

function initials(name) {
    return String(name || "WattWise")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part[0] || "")
        .join("")
        .toUpperCase();
}


// =====================================
// AUTHENTICATION
// =====================================

async function checkAuthentication() {
    const result = await api("/api/me");

    if (!result.authenticated || !result.user) {
        window.location.href = "/login";
        return false;
    }

    currentUser = result.user;

    setupAccount();
    return true;
}


// =====================================
// ACCOUNT PROFILE
// =====================================

function setupAccount() {
    if (!currentUser) return;

    const fullName = currentUser.full_name || "WattWise User";
    const householdName = currentUser.household_name || "My Household";
    const email = currentUser.email || "No email available";

    if ($("accountNameLabel")) {
        $("accountNameLabel").textContent = householdName;
    }

    if ($("accountAvatar")) {
        $("accountAvatar").textContent = initials(householdName);
    }

    if ($("accountButton")) {
        $("accountButton").title = email;
    }

    if ($("accountDetails")) {
        $("accountDetails").innerHTML = `
            <div class="account-info-card">
                <span class="account-info-icon">👤</span>
                <div>
                    <strong>${escapeHtml(fullName)}</strong>
                    <small>Account holder</small>
                </div>
            </div>

            <div class="account-info-card">
                <span class="account-info-icon">✉</span>
                <div>
                    <strong>Email address</strong>
                    <small>${escapeHtml(email)}</small>
                </div>
            </div>

            <div class="account-info-card">
                <span class="account-info-icon">⌂</span>
                <div>
                    <strong>${escapeHtml(householdName)}</strong>
                    <small>Your registered household</small>
                </div>
            </div>

            <div class="account-info-card">
                <span class="account-info-icon">ϟ</span>
                <div>
                    <strong>Personal WattWise workspace</strong>
                    <small>Your appliance records and billing settings belong to your account.</small>
                </div>
            </div>

            <button
                type="button"
                id="logoutButton"
                style="
                    width:100%;
                    margin-top:18px;
                    padding:13px;
                    border:0;
                    border-radius:9px;
                    background:#c24b3c;
                    color:white;
                    font-weight:700;
                    cursor:pointer;
                    font-family:inherit;
                "
            >
                Log Out
            </button>
        `;

        $("logoutButton").addEventListener("click", logout);
    }

    // The current backend does not provide a profile-update endpoint.
    // Hide the old local-only profile form.
    if ($("accountForm")) {
        $("accountForm").style.display = "none";
    }
}

async function logout() {
    if (!confirm("Are you sure you want to log out?")) return;

    try {
        await api("/api/logout", {
            method: "POST"
        });

        window.location.href = "/login";
    } catch (error) {
        toast(error.message);
    }
}


// =====================================
// MODAL CONTROLS
// =====================================

function openAccountModal() {
    if ($("accountModal")) {
        $("accountModal").classList.add("show");
    }
}

function closeAccountModal() {
    if ($("accountModal")) {
        $("accountModal").classList.remove("show");
    }
}

function openDataModal() {
    if ($("dataModal")) {
        $("dataModal").classList.add("show");
    }
}

function closeDataModal() {
    if ($("dataModal")) {
        $("dataModal").classList.remove("show");
    }
}


// =====================================
// LOAD HOUSEHOLD DATA
// =====================================

async function loadData() {
    const authenticated = await checkAuthentication();

    if (!authenticated) return;

    appData = await api("/api/data");

    render();
}


// =====================================
// DASHBOARD RENDERING
// =====================================

function render() {
    const d = appData;

    if (!d) return;

    const appliances = Array.isArray(d.appliances)
        ? d.appliances
        : [];

    const totalKwh = Number(d.total_kwh || 0);
    const totalCost = Number(d.total_cost || 0);
    const budget = Number(d.budget || 0);
    const remaining = Number(d.remaining || 0);

    if ($("totalKwh")) {
        $("totalKwh").textContent = number(totalKwh);
    }

    if ($("totalCost")) {
        $("totalCost").textContent = money(totalCost);
    }

    if ($("budgetValue")) {
        $("budgetValue").textContent = money(budget);
    }

    if ($("remainingValue")) {
        $("remainingValue").textContent =
            (remaining < 0 ? "-₱" : "₱") +
            money(Math.abs(remaining));
    }

    const percent = budget > 0
        ? totalCost / budget * 100
        : 0;

    if ($("budgetProgress")) {
        $("budgetProgress").style.width =
            Math.min(percent, 100) + "%";
    }

    if ($("budgetPercent")) {
        $("budgetPercent").textContent =
            percent.toFixed(1) + "% used";
    }

    if ($("budgetStatus")) {
        $("budgetStatus").textContent =
            remaining >= 0
                ? "Within your monthly budget"
                : "Over your monthly budget";

        $("budgetStatus").style.color =
            remaining >= 0 ? "#5b9138" : "#c24b3c";
    }

    if ($("rateInput")) {
        $("rateInput").value = d.rate ?? 0;
    }

    if ($("budgetInput")) {
        $("budgetInput").value = budget;
    }

    const count = appliances.length;

    if ($("applianceCount")) {
        $("applianceCount").textContent =
            `${count} appliance${count === 1 ? "" : "s"} registered`;
    }

    if ($("tableCount")) {
        $("tableCount").textContent =
            `Showing ${count} appliance${count === 1 ? "" : "s"}`;
    }

    const rows = $("applianceRows");

    if (rows) {
        rows.innerHTML = "";

        appliances.forEach((a, i) => {
            const tr = document.createElement("tr");

            tr.innerHTML = `
                <td>
                    <div class="device-cell">
                        <span class="device-icon">${icons[i % icons.length]}</span>
                        ${escapeHtml(a.name)}
                    </div>
                </td>

                <td>${number(a.watts)} W</td>

                <td>${number(a.hours)} hrs</td>

                <td>
                    <span class="usage-number">
                        ${number(a.monthly_kwh)} kWh
                    </span>
                </td>

                <td>
                    <span class="cost-number">
                        ₱${money(a.monthly_cost)}
                    </span>
                </td>

                <td>
                    <button
                        class="action-btn edit-btn"
                        title="Edit"
                        data-id="${Number(a.id)}"
                    >✎</button>

                    <button
                        class="action-btn delete-btn"
                        title="Delete"
                        data-id="${Number(a.id)}"
                    >×</button>
                </td>
            `;

            rows.appendChild(tr);
        });

        rows.querySelectorAll(".edit-btn").forEach(button => {
            button.addEventListener("click", () => {
                editAppliance(Number(button.dataset.id));
            });
        });

        rows.querySelectorAll(".delete-btn").forEach(button => {
            button.addEventListener("click", () => {
                removeAppliance(Number(button.dataset.id));
            });
        });
    }

    renderBars();
    renderWhatIfOptions();
}


// =====================================
// USAGE BARS
// =====================================

function renderBars() {
    const box = $("usageBars");

    if (!box) return;

    box.innerHTML = "";

    const list = [...appData.appliances]
        .sort((a, b) => Number(b.monthly_kwh) - Number(a.monthly_kwh))
        .slice(0, 5);

    const max = Math.max(
        ...list.map(a => Number(a.monthly_kwh || 0)),
        1
    );

    if (!list.length) {
        box.innerHTML = `
            <p class="muted">
                No appliances registered yet.
                Add your first appliance.
            </p>
        `;
        return;
    }

    list.forEach(a => {
        const row = document.createElement("div");
        row.className = "usage-row";

        const percentage = Math.max(
            2,
            Number(a.monthly_kwh || 0) / max * 100
        );

        row.innerHTML = `
            <span class="usage-name" title="${escapeHtml(a.name)}">
                ${escapeHtml(a.name)}
            </span>

            <div class="bar-track">
                <div class="bar-fill" style="width:${percentage}%"></div>
            </div>

            <span class="bar-value">
                ${number(a.monthly_kwh)}
            </span>
        `;

        box.appendChild(row);
    });
}


// =====================================
// WHAT-IF ANALYSIS
// =====================================

function renderWhatIfOptions() {
    const select = $("whatIfAppliance");

    if (!select) return;

    const old = select.value;

    select.innerHTML = "";

    appData.appliances.forEach(a => {
        const option = document.createElement("option");

        option.value = a.id;
        option.textContent = a.name;

        select.appendChild(option);
    });

    if ([...select.options].some(o => o.value === old)) {
        select.value = old;
    }

    const selected = appData.appliances.find(
        a => a.id === Number(select.value)
    );

    if ($("whatIfHours")) {
        $("whatIfHours").value = selected ? selected.hours : 4;
    }

    if ($("hoursDisplay")) {
        $("hoursDisplay").textContent =
            $("whatIfHours")?.value || 4;
    }
}


// =====================================
// APPLIANCE MODAL
// =====================================

function openModal(appliance = null) {
    $("applianceModal")?.classList.add("show");

    if ($("formError")) {
        $("formError").textContent = "";
    }

    $("applianceForm")?.reset();

    if ($("editId")) {
        $("editId").value = appliance ? appliance.id : "";
    }

    if ($("modalTitle")) {
        $("modalTitle").textContent =
            appliance ? "Edit appliance" : "Add appliance";
    }

    if ($("submitAppliance")) {
        $("submitAppliance").innerHTML =
            appliance
                ? "Update appliance <span>→</span>"
                : "Save appliance <span>→</span>";
    }

    if (appliance) {
        $("applianceName").value = appliance.name;
        $("applianceWatts").value = appliance.watts;
        $("applianceHours").value = appliance.hours;
    }
}

function closeModal() {
    $("applianceModal")?.classList.remove("show");
}

function editAppliance(id) {
    const appliance = appData.appliances.find(
        a => Number(a.id) === Number(id)
    );

    if (appliance) {
        openModal(appliance);
    }
}

async function removeAppliance(id) {
    const appliance = appData.appliances.find(
        a => Number(a.id) === Number(id)
    );

    if (!appliance) return;

    if (!confirm(`Delete ${appliance.name} from your appliance list?`)) {
        return;
    }

    try {
        appData = await api(`/api/appliances/${id}`, {
            method: "DELETE"
        });

        render();
        toast("Appliance deleted.");
    } catch (error) {
        toast(error.message);
    }
}


// =====================================
// APPLIANCE EVENTS
// =====================================

$("openAdd")?.addEventListener("click", () => openModal());

$("tableAdd")?.addEventListener("click", () => openModal());

$("closeModal")?.addEventListener("click", closeModal);

$("cancelModal")?.addEventListener("click", closeModal);

$("applianceModal")?.addEventListener("click", event => {
    if (event.target === $("applianceModal")) {
        closeModal();
    }
});

$("applianceForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    const payload = {
        name: $("applianceName").value.trim(),
        watts: $("applianceWatts").value,
        hours: $("applianceHours").value
    };

    const id = $("editId").value;

    try {
        appData = await api(
            id ? `/api/appliances/${id}` : "/api/appliances",
            {
                method: id ? "PUT" : "POST",
                body: JSON.stringify(payload)
            }
        );

        closeModal();
        render();

        toast(id ? "Appliance updated." : "Appliance added.");

    } catch (error) {
        if ($("formError")) {
            $("formError").textContent = error.message;
        }
    }
});


// =====================================
// BILLING SETTINGS
// =====================================

$("saveSettings")?.addEventListener("click", async () => {
    try {
        appData = await api("/api/settings", {
            method: "PUT",
            body: JSON.stringify({
                rate: $("rateInput").value,
                budget: $("budgetInput").value
            })
        });

        render();
        toast("Billing settings saved.");

    } catch (error) {
        toast(error.message);
    }
});


// =====================================
// WHAT-IF EVENTS
// =====================================

$("whatIfHours")?.addEventListener("input", () => {
    $("hoursDisplay").textContent = $("whatIfHours").value;
});

$("whatIfAppliance")?.addEventListener("change", () => {
    const appliance = appData.appliances.find(
        a => Number(a.id) === Number($("whatIfAppliance").value)
    );

    if (appliance) {
        $("whatIfHours").value = appliance.hours;
        $("hoursDisplay").textContent = appliance.hours;
    }
});

$("runWhatIf")?.addEventListener("click", async () => {
    if (!appData.appliances.length) {
        toast("Add an appliance first.");
        return;
    }

    try {
        const result = await api("/api/what-if", {
            method: "POST",
            body: JSON.stringify({
                id: $("whatIfAppliance").value,
                hours: $("whatIfHours").value
            })
        });

        $("savingsAmount").textContent =
            (result.savings < 0 ? "-₱" : "₱") +
            money(Math.abs(result.savings));

        $("projectedCost").textContent =
            "₱" + money(result.projected_cost);

        $("savingsDescription").textContent =
            result.savings >= 0
                ? `Reducing ${result.appliance} to ${result.new_hours} hours/day may save this amount.`
                : `Increasing ${result.appliance} to ${result.new_hours} hours/day may add to your bill.`;

        toast("What-If estimate updated.");

    } catch (error) {
        toast(error.message);
    }
});


// =====================================
// ACCOUNT MODAL EVENTS
// =====================================

$("accountButton")?.addEventListener("click", openAccountModal);

$("closeAccount")?.addEventListener("click", closeAccountModal);

$("cancelAccount")?.addEventListener("click", closeAccountModal);

$("accountModal")?.addEventListener("click", event => {
    if (event.target === $("accountModal")) {
        closeAccountModal();
    }
});


// =====================================
// DATA STATUS MODAL EVENTS
// =====================================

$("localDataButton")?.addEventListener("click", openDataModal);

$("closeData")?.addEventListener("click", closeDataModal);

$("closeDataBottom")?.addEventListener("click", closeDataModal);

$("dataModal")?.addEventListener("click", event => {
    if (event.target === $("dataModal")) {
        closeDataModal();
    }
});

$("refreshData")?.addEventListener("click", async () => {
    try {
        await loadData();
        closeDataModal();
        toast("Dashboard data refreshed.");
    } catch (error) {
        toast(error.message);
    }
});


// =====================================
// MOBILE MENU
// =====================================

$("mobileMenu")?.addEventListener("click", () => {
    $("sidebar")?.classList.toggle("open");
});

document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", () => {
        $("sidebar")?.classList.remove("open");

        document.querySelectorAll(".nav-link").forEach(item => {
            item.classList.remove("active");
        });

        link.classList.add("active");
    });
});


// =====================================
// START WATTWISE
// =====================================

loadData().catch(error => {
    console.error("WattWise initialization error:", error);
    toast(error.message);
});
