const $ = (id) => document.getElementById(id);
let appData = { appliances: [] };
const money = n => Number(n || 0).toLocaleString("en-PH", {minimumFractionDigits:2, maximumFractionDigits:2});
const number = n => Number(n || 0).toLocaleString("en-PH", {minimumFractionDigits:2, maximumFractionDigits:2});
const icons = ["▣","▤","▱","◉","▥","⌂","▦"];
async function api(url, options={}) {
  const response = await fetch(url, {headers:{"Content-Type":"application/json"}, ...options});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 2600);
}
async function loadData() {
  appData = await api("/api/data");
  render();
}
function render() {
  const d = appData;
  $("totalKwh").textContent = number(d.total_kwh);
  $("totalCost").textContent = money(d.total_cost);
  $("budgetValue").textContent = money(d.budget);
  $("remainingValue").textContent = (d.remaining < 0 ? "-₱" : "₱") + money(Math.abs(d.remaining));
  const percent = d.budget > 0 ? d.total_cost / d.budget * 100 : 0;
  $("budgetProgress").style.width = Math.min(percent,100) + "%";
  $("budgetPercent").textContent = percent.toFixed(1) + "% used";
  $("budgetStatus").textContent = d.remaining >= 0 ? "Within your monthly budget" : "Over your monthly budget";
  $("budgetStatus").style.color = d.remaining >= 0 ? "#5b9138" : "#c24b3c";
  $("rateInput").value = d.rate;
  $("budgetInput").value = d.budget;
  $("applianceCount").textContent = `${d.count} appliance${d.count===1?"":"s"} registered`;
  $("tableCount").textContent = `Showing ${d.count} appliance${d.count===1?"":"s"}`;
  const rows = $("applianceRows");
  rows.innerHTML = "";
  d.appliances.forEach((a,i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><div class="device-cell"><span class="device-icon">${icons[i%icons.length]}</span>${escapeHtml(a.name)}</div></td>
      <td>${number(a.watts)} W</td><td>${number(a.hours)} hrs</td>
      <td><span class="usage-number">${number(a.monthly_kwh)} kWh</span></td>
      <td><span class="cost-number">₱${money(a.monthly_cost)}</span></td>
      <td><button class="action-btn edit-btn" title="Edit" data-id="${a.id}">✎</button><button class="action-btn delete-btn" title="Delete" data-id="${a.id}">×</button></td>`;
    rows.appendChild(tr);
  });
  rows.querySelectorAll(".edit-btn").forEach(b => b.addEventListener("click", () => editAppliance(Number(b.dataset.id))));
  rows.querySelectorAll(".delete-btn").forEach(b => b.addEventListener("click", () => removeAppliance(Number(b.dataset.id))));
  renderBars();
  renderWhatIfOptions();
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function renderBars() {
  const box = $("usageBars");
  box.innerHTML = "";
  const list = appData.appliances.slice(0,5);
  const max = Math.max(...list.map(a=>a.monthly_kwh),1);
  if (!list.length) { box.innerHTML = '<p class="muted">No appliances registered yet. Add your first appliance.</p>'; return; }
  list.forEach(a => {
    const row = document.createElement("div");
    row.className = "usage-row";
    row.innerHTML = `<span class="usage-name" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(2,a.monthly_kwh/max*100)}%"></div></div><span class="bar-value">${number(a.monthly_kwh)}</span>`;
    box.appendChild(row);
  });
}
function renderWhatIfOptions() {
  const select = $("whatIfAppliance");
  const old = select.value;
  select.innerHTML = "";
  appData.appliances.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.id; opt.textContent = a.name; select.appendChild(opt);
  });
  if ([...select.options].some(o=>o.value===old)) select.value=old;
  const selected = appData.appliances.find(a=>a.id===Number(select.value));
  $("whatIfHours").value = selected ? selected.hours : 4;
  $("hoursDisplay").textContent = $("whatIfHours").value;
}
function openModal(appliance=null) {
  $("applianceModal").classList.add("show");
  $("formError").textContent = "";
  $("applianceForm").reset();
  $("editId").value = appliance ? appliance.id : "";
  $("modalTitle").textContent = appliance ? "Edit appliance" : "Add appliance";
  $("submitAppliance").innerHTML = appliance ? "Update appliance <span>→</span>" : "Save appliance <span>→</span>";
  if (appliance) {
    $("applianceName").value = appliance.name;
    $("applianceWatts").value = appliance.watts;
    $("applianceHours").value = appliance.hours;
  }
}
function closeModal() { $("applianceModal").classList.remove("show"); }
function editAppliance(id) { const a=appData.appliances.find(x=>x.id===id); if(a) openModal(a); }
async function removeAppliance(id) {
  const a=appData.appliances.find(x=>x.id===id);
  if (!a || !confirm(`Delete ${a.name} from your appliance list?`)) return;
  try { appData=await api(`/api/appliances/${id}`,{method:"DELETE"}); render(); toast("Appliance deleted."); }
  catch(e){toast(e.message);}
}
$("openAdd").addEventListener("click",()=>openModal());
$("tableAdd").addEventListener("click",()=>openModal());
$("closeModal").addEventListener("click",closeModal);
$("cancelModal").addEventListener("click",closeModal);
$("applianceModal").addEventListener("click",e=>{if(e.target===$("applianceModal"))closeModal();});
$("applianceForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const payload={name:$("applianceName").value,watts:$("applianceWatts").value,hours:$("applianceHours").value};
  const id=$("editId").value;
  try {
    appData=await api(id?`/api/appliances/${id}`:"/api/appliances",{method:id?"PUT":"POST",body:JSON.stringify(payload)});
    closeModal();render();toast(id?"Appliance updated.":"Appliance added.");
  } catch(err){$("formError").textContent=err.message;}
});
$("saveSettings").addEventListener("click",async()=>{
  try {
    appData=await api("/api/settings",{method:"PUT",body:JSON.stringify({rate:$("rateInput").value,budget:$("budgetInput").value})});
    render();toast("Billing settings saved.");
  } catch(e){toast(e.message);}
});
$("whatIfHours").addEventListener("input",()=>{$("hoursDisplay").textContent=$("whatIfHours").value;});
$("whatIfAppliance").addEventListener("change",()=>{
  const a=appData.appliances.find(x=>x.id===Number($("whatIfAppliance").value));
  if(a){$("whatIfHours").value=a.hours;$("hoursDisplay").textContent=a.hours;}
});
$("runWhatIf").addEventListener("click",async()=>{
  if(!appData.appliances.length){toast("Add an appliance first.");return;}
  try {
    const result=await api("/api/what-if",{method:"POST",body:JSON.stringify({id:$("whatIfAppliance").value,hours:$("whatIfHours").value})});
    $("savingsAmount").textContent=(result.savings<0?"-₱":"₱")+money(Math.abs(result.savings));
    $("projectedCost").textContent="₱"+money(result.projected_cost);
    $("savingsDescription").textContent=result.savings>=0
      ? `Reducing ${result.appliance} to ${result.new_hours} hours/day may save this amount.`
      : `Increasing ${result.appliance} to ${result.new_hours} hours/day may add to your bill.`;
    toast("What-If estimate updated.");
  } catch(e){toast(e.message);}
});
$("mobileMenu").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
document.querySelectorAll(".nav-link").forEach(a=>a.addEventListener("click",()=>{$("sidebar").classList.remove("open");document.querySelectorAll(".nav-link").forEach(n=>n.classList.remove("active"));a.classList.add("active");}));
loadData().catch(e=>toast(e.message));

// Household profile: saved in this browser for this local workspace.
const accountModal = $("accountModal");
function applyHouseholdProfile() {
  const savedName = localStorage.getItem("wattwise_household_name") || "Household account";
  $("accountNameLabel").textContent = savedName;
  const initials = savedName.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0].toUpperCase()).join("") || "WW";
  $("accountAvatar").textContent = initials;
  $("householdName").value = savedName === "Household account" ? "" : savedName;
  $("topHouseholdName")?.replaceChildren(document.createTextNode(savedName));
}
function openAccount() {
  applyHouseholdProfile();
  accountModal.classList.add("show");
}
function closeAccount() { accountModal.classList.remove("show"); }
$("accountButton").addEventListener("click", openAccount);
$("closeAccount").addEventListener("click", closeAccount);
$("cancelAccount").addEventListener("click", closeAccount);
accountModal.addEventListener("click", event => { if (event.target === accountModal) closeAccount(); });
$("accountForm").addEventListener("submit", event => {
  event.preventDefault();
  const name = $("householdName").value.trim();
  if (!name) return;
  localStorage.setItem("wattwise_household_name", name);
  applyHouseholdProfile();
  closeAccount();
  toast("Household profile updated.");
});
$("workspaceLink").addEventListener("click", () => {
  document.querySelectorAll(".nav-link").forEach(link => link.classList.remove("active"));
  document.querySelector('.nav-link[href="#dashboard"]')?.classList.add("active");
  $("sidebar").classList.remove("open");
});
applyHouseholdProfile();


// Local data status panel: clearly distinguishes saved estimates from live hardware readings.
const dataModal = $("dataModal");
function openDataStatus(){ dataModal.classList.add("show"); }
function closeDataStatus(){ dataModal.classList.remove("show"); }
$("localDataButton").addEventListener("click", openDataStatus);
$("closeData").addEventListener("click", closeDataStatus);
$("closeDataBottom").addEventListener("click", closeDataStatus);
dataModal.addEventListener("click", event=>{if(event.target===dataModal)closeDataStatus();});
$("refreshData").addEventListener("click", async()=>{
  try {
    await loadData();
    closeDataStatus();
    toast("Dashboard data refreshed.");
  } catch(error) { toast(error.message); }
});
