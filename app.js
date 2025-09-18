const LS_KEYS = {
  users: "expmon.users",
  active: "expmon.active",
  salary: "expmon.salaryByMonth",
  txns: "expmon.txns",
  emis: "expmon.emis",
};

const categories = [
  "Food",
  "Travel",
  "Shopping",
  "Bills",
  "Entertainment",
  "Health",
  "Education",
  "Other",
];

function ym(input) {
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${y}-${m}`;
}

function thisMonth() {
  return ym(new Date());
}

function load(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.warn("Failed to load", key, err);
    return fallback;
  }
}

function save(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("Failed to save", key, err);
  }
}

function formatINR(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function guessCategory(desc = "") {
  const d = desc.toLowerCase();
  if (/(swiggy|zomato|restaurant|hotel|food|cafe)/.test(d)) return "Food";
  if (/(uber|ola|metro|bus|fuel|petrol|diesel|train)/.test(d)) return "Travel";
  if (/(amazon|flipkart|myntra|shopping|store|mart)/.test(d)) return "Shopping";
  if (/(rent|electricity|water|gas|phone|mobile|internet|wifi|recharge|dth)/.test(d)) return "Bills";
  if (/(emi|loan|credit card|repayment)/.test(d)) return "EMI";
  if (/(movie|bookmyshow|entertainment|netflix|spotify|disney)/.test(d)) return "Entertainment";
  if (/(medicine|pharmacy|hospital|clinic)/.test(d)) return "Health";
  return "Other";
}

function computeScore({ salary, expenses, emi }) {
  const safeSalary = Number(salary || 0);
  const used = Number(expenses || 0) + Number(emi || 0);
  if (!safeSalary) return 0;
  const utilisation = used / safeSalary;
  let score = 100 - Math.min(100, utilisation * 100);
  if (utilisation > 1) score -= 20;
  if ((emi || 0) / safeSalary > 0.4) score -= 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function createState() {
  const users = load(LS_KEYS.users, []);
  const activeUser = load(LS_KEYS.active, null);
  const month = thisMonth();
  return {
    users,
    activeUser,
    month,
    activeTab: "dashboard",
    authMode: "login",
    uploadNote: "",
    uploadPassword: "",
    salaryForm: {
      amount: "",
      scope: "this",
      from: month,
      to: month,
    },
    expenseForm: {
      date: `${month}-15`,
      description: "",
      category: categories[0],
      amount: "",
      account: "",
    },
    emiForm: {
      lender: "",
      purpose: "",
      monthlyEMI: "",
      dueDayOfMonth: "5",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: "",
    },
    reportForm: {
      from: ym(new Date(new Date().setMonth(new Date().getMonth() - 5))),
      to: ym(new Date()),
    },
    txns: load(LS_KEYS.txns, []),
    emis: load(LS_KEYS.emis, []),
    salaryByMonth: load(LS_KEYS.salary, {}),
  };
}

const state = createState();

function persist() {
  save(LS_KEYS.users, state.users);
  save(LS_KEYS.active, state.activeUser);
  save(LS_KEYS.txns, state.txns);
  save(LS_KEYS.emis, state.emis);
  save(LS_KEYS.salary, state.salaryByMonth);
}

function updateMonth(newMonth) {
  state.month = newMonth;
  state.salaryForm.from = newMonth;
  state.salaryForm.to = newMonth;
  state.expenseForm.date = `${newMonth}-15`;
  render();
}

function setTab(tab) {
  state.activeTab = tab;
  render();
}

function setAuthMode(mode) {
  state.authMode = mode;
  render();
}

function signup(formData) {
  const username = formData.get("username").trim();
  const password = formData.get("password");
  const biometric = formData.get("biometric") === "on";
  if (!username || !password) {
    alert("Username and password are required.");
    return;
  }
  if (state.users.some(u => u.username === username)) {
    alert("Username already exists.");
    return;
  }
  const newUser = { username, password, biometricEnabled: biometric };
  state.users.push(newUser);
  state.activeUser = username;
  persist();
  render();
}

function login(formData) {
  const username = formData.get("username").trim();
  const password = formData.get("password");
  const user = state.users.find(u => u.username === username && u.password === password);
  if (!user) {
    alert("Invalid credentials.");
    return;
  }
  state.activeUser = user.username;
  persist();
  render();
}

function logout() {
  state.activeUser = null;
  state.activeTab = "dashboard";
  persist();
  render();
}

function ensureActiveUser() {
  if (!state.activeUser) {
    alert("Please login first.");
    return false;
  }
  return true;
}

function setSalary(amount, scope, range) {
  if (!ensureActiveUser()) return;
  const numericAmount = Number(amount || 0);
  if (!numericAmount) {
    alert("Enter a valid salary amount.");
    return;
  }
  const map = { ...state.salaryByMonth };
  const baseMonth = state.month;
  const apply = monthKey => {
    map[`${state.activeUser}|${monthKey}`] = numericAmount;
  };
  if (scope === "this") {
    apply(baseMonth);
  } else if (scope === "carryforward") {
    const start = new Date(`${baseMonth}-01`);
    for (let i = 0; i < 12; i += 1) {
      const d = new Date(start);
      d.setMonth(start.getMonth() + i);
      apply(ym(d));
    }
  } else if (scope === "range" && range) {
    const from = new Date(`${range.from}-01`);
    const to = new Date(`${range.to}-01`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      alert("Enter a valid month range.");
      return;
    }
    const cursor = new Date(from);
    while (cursor <= to) {
      apply(ym(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  state.salaryByMonth = map;
  state.salaryForm.amount = "";
  persist();
  render();
}

function addTxn(payload) {
  if (!ensureActiveUser()) return;
  const amount = Number(payload.amount || 0);
  if (!payload.date || !payload.description || !amount) {
    alert("Please fill date, description and amount.");
    return;
  }
  const txn = {
    id: crypto.randomUUID(),
    user: state.activeUser,
    date: payload.date,
    description: payload.description,
    category: payload.category || guessCategory(payload.description),
    amount,
    account: payload.account || "",
    meta: payload.meta || {},
  };
  state.txns = [txn, ...state.txns];
  state.expenseForm.description = "";
  state.expenseForm.amount = "";
  state.expenseForm.account = "";
  persist();
  render();
}

function deleteTxn(id) {
  state.txns = state.txns.filter(txn => txn.id !== id);
  persist();
  render();
}

function addEmi(payload) {
  if (!ensureActiveUser()) return;
  const amount = Number(payload.monthlyEMI || 0);
  if (!payload.lender || !payload.purpose || !amount) {
    alert("Fill lender, purpose and EMI amount.");
    return;
  }
  const emi = {
    id: crypto.randomUUID(),
    user: state.activeUser,
    lender: payload.lender,
    purpose: payload.purpose,
    monthlyEMI: amount,
    dueDayOfMonth: Number(payload.dueDayOfMonth || 1),
    startDate: payload.startDate,
    endDate: payload.endDate || "",
    status: "active",
  };
  state.emis = [emi, ...state.emis];
  state.emiForm = {
    lender: "",
    purpose: "",
    monthlyEMI: "",
    dueDayOfMonth: "5",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
  };
  persist();
  render();
}

function closeEmi(id) {
  state.emis = state.emis.map(emi => (emi.id === id ? { ...emi, status: "closed" } : emi));
  persist();
  render();
}

function activeUserTxns() {
  return state.txns.filter(txn => txn.user === state.activeUser);
}

function activeUserEmis(includeClosed = false) {
  return state.emis.filter(emi => emi.user === state.activeUser && (includeClosed || (emi.status || "active") === "active"));
}

function monthOptions(limit = 18) {
  const options = [];
  const now = new Date();
  for (let i = 0; i < limit; i += 1) {
    const d = new Date(now);
    d.setMonth(now.getMonth() - i);
    options.push(ym(d));
  }
  return options;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines.shift().split(",").map(h => h.trim().toLowerCase());
  const idxDate = headers.findIndex(h => h.includes("date"));
  const idxDesc = headers.findIndex(h => h.includes("desc"));
  const idxAmt = headers.findIndex(h => h.includes("amount"));
  const idxAcc = headers.findIndex(h => h.includes("account"));
  if (idxDate === -1 || idxDesc === -1 || idxAmt === -1) {
    return [];
  }
  return lines
    .map(line => {
      const cols = line.split(",").map(c => c.trim());
      const date = new Date(cols[idxDate]);
      const amount = Math.abs(parseFloat(cols[idxAmt] || "0"));
      if (Number.isNaN(date.getTime()) || !amount) return null;
      return {
        date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
        description: cols[idxDesc] || "Imported transaction",
        category: guessCategory(cols[idxDesc] || ""),
        amount,
        account: idxAcc >= 0 ? cols[idxAcc] : "",
      };
    })
    .filter(Boolean);
}

function handleUpload(file, type) {
  if (!file) return;
  if (/(protected|password|secured)/i.test(file.name) && !state.uploadPassword) {
    alert("This file appears to be password protected. Please enter the password hint before uploading.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result);
      const rows = parseCsv(text);
      if (!rows.length) {
        alert("No transactions found. Ensure the CSV has date, description and amount columns.");
        return;
      }
      rows.forEach(row => {
        addTxn({
          ...row,
          meta: { source: type, note: state.uploadNote || "" },
        });
      });
      state.uploadNote = "";
      state.uploadPassword = "";
      render();
      alert(`Imported ${rows.length} transactions.`);
    } catch (err) {
      console.error(err);
      alert("Failed to read file. Please upload a simple CSV file.");
    }
  };
  reader.readAsText(file);
}

function downloadCurrentCsv() {
  const txns = monthTransactions();
  const rows = [["date", "description", "category", "amount", "account"]]
    .concat(txns.map(txn => [txn.date, txn.description, txn.category, txn.amount, txn.account || ""]))
    .map(row => row.map(value => (/,/.test(String(value)) ? `"${value}"` : value)).join(","))
    .join("\n");
  const blob = new Blob([rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `expenses_${state.month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function monthTransactions() {
  return activeUserTxns().filter(txn => ym(txn.date) === state.month);
}

function computeDashboardData() {
  const salaryKey = `${state.activeUser}|${state.month}`;
  const salary = state.salaryByMonth[salaryKey] || 0;
  const txns = monthTransactions();
  const expenses = txns.reduce((sum, txn) => sum + Number(txn.amount || 0), 0);
  const emis = activeUserEmis().reduce((sum, emi) => sum + Number(emi.monthlyEMI || 0), 0);
  const savings = Math.max(0, salary - (expenses + emis));
  const score = computeScore({ salary, expenses, emi: emis });
  let status = {
    label: "Set up income",
    className: "warn",
  };
  if (salary > 0) {
    if (expenses + emis > salary) {
      status = { label: "Over budget", className: "bad" };
    } else if (expenses + emis > salary * 0.85) {
      status = { label: "Watch spending", className: "warn" };
    } else {
      status = { label: "Healthy", className: "good" };
    }
  }
  const tip = (() => {
    if (!salary) return "Add your monthly salary to unlock personalised guidance.";
    if (expenses + emis > salary) return "Spending exceeds your income. Review big-ticket expenses and consider deferring non-essential purchases.";
    if (emis > salary * 0.4) return "EMI load is high. Explore refinancing or pre-payments to reduce long-term interest.";
    if (savings < salary * 0.2) return "Try moving a fixed amount to savings at the start of every month.";
    return "Great job! Maintain an emergency fund and invest the surplus smartly.";
  })();
  return { salary, expenses, emis, savings, score, status, tip };
}

function computeCategoryTotals(txns) {
  const map = new Map();
  txns.forEach(txn => {
    const current = map.get(txn.category) || 0;
    map.set(txn.category, current + Number(txn.amount || 0));
  });
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}

function lastTwelveMonths() {
  const series = [];
  const base = new Date(`${state.month}-01`);
  for (let i = 11; i >= 0; i -= 1) {
    const cursor = new Date(base);
    cursor.setMonth(base.getMonth() - i);
    const key = ym(cursor);
    const salary = state.salaryByMonth[`${state.activeUser}|${key}`] || 0;
    const expenses = activeUserTxns()
      .filter(txn => ym(txn.date) === key)
      .reduce((sum, txn) => sum + Number(txn.amount || 0), 0);
    const emis = activeUserEmis().reduce((sum, emi) => sum + Number(emi.monthlyEMI || 0), 0);
    const savings = Math.max(0, salary - (expenses + emis));
    series.push({ key, salary, expenses, emis, savings });
  }
  return series;
}

function computeReportRows() {
  const { from, to } = state.reportForm;
  const fromDate = new Date(`${from}-01`);
  const toDate = new Date(`${to}-01`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    return [];
  }
  const months = [];
  const cursor = new Date(fromDate);
  while (cursor <= toDate) {
    months.push(ym(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months.map(monthKey => {
    const salary = state.salaryByMonth[`${state.activeUser}|${monthKey}`] || 0;
    const expenses = activeUserTxns()
      .filter(txn => ym(txn.date) === monthKey)
      .reduce((sum, txn) => sum + Number(txn.amount || 0), 0);
    const emis = activeUserEmis(true)
      .filter(emi => {
        const start = new Date(emi.startDate);
        const end = emi.endDate ? new Date(emi.endDate) : null;
        const current = new Date(`${monthKey}-01`);
        if (Number.isNaN(start.getTime())) return true;
        if (end && Number.isNaN(end.getTime())) return true;
        if (end) {
          return current >= start && current <= end;
        }
        return current >= start;
      })
      .reduce((sum, emi) => sum + Number(emi.monthlyEMI || 0), 0);
    const savings = Math.max(0, salary - (expenses + emis));
    return { month: monthKey, salary, expenses, emis, savings };
  });
}

function aggregateCategoriesInRange(months) {
  const map = new Map();
  activeUserTxns()
    .filter(txn => months.includes(ym(txn.date)))
    .forEach(txn => {
      const val = map.get(txn.category) || 0;
      map.set(txn.category, val + Number(txn.amount || 0));
    });
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}

function renderAuth() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <section class="app-shell">
      <div class="card auth-card">
        <h1 style="font-size:1.8rem;margin-bottom:8px;">Expense Monitor</h1>
        <p class="muted" style="margin-bottom:24px;">Plan, monitor and optimise your monthly finances.</p>
        <div class="auth-toggle">
          <button type="button" class="${state.authMode === "login" ? "active" : "secondary"}" data-auth="login">Login</button>
          <button type="button" class="${state.authMode === "signup" ? "active" : "secondary"}" data-auth="signup">Signup</button>
        </div>
        <form id="auth-form" class="form">
          <div class="form-row">
            <label>Username
              <input name="username" placeholder="e.g., murali" required />
            </label>
          </div>
          <div class="form-row">
            <label>Password
              <input type="password" name="password" required />
            </label>
          </div>
          <div class="form-row" style="align-items:center;display:flex;gap:8px;">
            <input type="checkbox" id="biometric" name="biometric" />
            <label for="biometric" class="muted" style="margin:0;">Enable biometric login (simulated)</label>
          </div>
          <button type="submit">${state.authMode === "login" ? "Login" : "Create account"}</button>
        </form>
      </div>
    </section>
  `;
  app.querySelectorAll("[data-auth]").forEach(button => {
    button.addEventListener("click", () => {
      setAuthMode(button.dataset.auth);
    });
  });
  const form = document.getElementById("auth-form");
  form.addEventListener("submit", event => {
    event.preventDefault();
    const formData = new FormData(form);
    if (state.authMode === "login") {
      login(formData);
    } else {
      signup(formData);
    }
  });
}

function renderDashboard(section) {
  const { salary, expenses, emis, savings, score, status, tip } = computeDashboardData();
  const txns = monthTransactions();
  const categoryTotals = computeCategoryTotals(txns);
  const annual = lastTwelveMonths();
  const totalSalaryYear = annual.reduce((sum, item) => sum + item.salary, 0);
  const totalExpensesYear = annual.reduce((sum, item) => sum + item.expenses, 0);
  const totalEmiYear = annual.reduce((sum, item) => sum + item.emis, 0);
  const totalSavingsYear = annual.reduce((sum, item) => sum + item.savings, 0);

  section.innerHTML = `
    <div class="grid two">
      <div class="card stat">
        <h3>Salary (${state.month})</h3>
        <div class="value">${formatINR(salary)}</div>
        <form id="salary-form" class="form">
          <div class="form-row">
            <label>Amount (₹)
              <input name="amount" value="${state.salaryForm.amount}" placeholder="50000" />
            </label>
          </div>
          <div class="form-row">
            <label>Apply to
              <select name="scope">
                <option value="this" ${state.salaryForm.scope === "this" ? "selected" : ""}>This month</option>
                <option value="carryforward" ${state.salaryForm.scope === "carryforward" ? "selected" : ""}>Carry forward (12 months)</option>
                <option value="range" ${state.salaryForm.scope === "range" ? "selected" : ""}>Custom range</option>
              </select>
            </label>
          </div>
          ${state.salaryForm.scope === "range" ? `
            <div class="form-row two">
              <label>From (YYYY-MM)
                <input name="from" value="${state.salaryForm.from}" />
              </label>
              <label>To (YYYY-MM)
                <input name="to" value="${state.salaryForm.to}" />
              </label>
            </div>
          ` : ""}
          <button type="submit">Save salary</button>
        </form>
      </div>
      <div class="grid">
        <div class="card stat">
          <h3>Expenses</h3>
          <div class="value">${formatINR(expenses)}</div>
          <span class="muted">${txns.length} transactions this month.</span>
        </div>
        <div class="card stat">
          <h3>EMIs</h3>
          <div class="value">${formatINR(emis)}</div>
          <span class="muted">${activeUserEmis().length} active commitments.</span>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>Financial Health</h3>
      <div class="form-row two" style="align-items:center;">
        <div>
          <div class="status-chip ${status.className}">${status.label}</div>
          <p class="muted" style="margin-top:12px;">Savings: <strong>${formatINR(savings)}</strong></p>
        </div>
        <div>
          <p class="muted" style="margin-bottom:6px;">Score: <strong>${score}</strong> / 100</p>
          <div class="score-bar"><span style="width:${score}%"></span></div>
        </div>
      </div>
      <p class="tip" style="margin-top:16px;">${tip}</p>
    </div>

    <div class="card">
      <h3>Monthly Breakdown</h3>
      ${categoryTotals.length ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Amount</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              ${categoryTotals
                .map(item => {
                  const share = expenses ? ((item.value / expenses) * 100).toFixed(1) : "0.0";
                  return `<tr><td>${item.name}</td><td>${formatINR(item.value)}</td><td>${share}%</td></tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      ` : '<p class="muted">Add expenses to view category insights.</p>'}
    </div>

    <div class="card">
      <h3>Rolling 12 Month Summary</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Total Salary</td><td>${formatINR(totalSalaryYear)}</td></tr>
            <tr><td>Total Expenses</td><td>${formatINR(totalExpensesYear)}</td></tr>
            <tr><td>Total EMIs</td><td>${formatINR(totalEmiYear)}</td></tr>
            <tr><td>Savings</td><td>${formatINR(totalSavingsYear)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  const salaryForm = section.querySelector("#salary-form");
  salaryForm.scope = state.salaryForm.scope;
  salaryForm.addEventListener("change", event => {
    if (event.target.name === "scope") {
      state.salaryForm.scope = event.target.value;
      render();
    } else if (event.target.name === "from") {
      state.salaryForm.from = event.target.value;
    } else if (event.target.name === "to") {
      state.salaryForm.to = event.target.value;
    } else if (event.target.name === "amount") {
      state.salaryForm.amount = event.target.value;
    }
  });
  salaryForm.addEventListener("submit", event => {
    event.preventDefault();
    const formData = new FormData(salaryForm);
    const amount = formData.get("amount");
    const scope = formData.get("scope");
    if (scope === "range") {
      setSalary(amount, scope, { from: formData.get("from"), to: formData.get("to") });
    } else {
      setSalary(amount, scope);
    }
  });
}

function renderExpenses(section) {
  const txns = monthTransactions();
  section.innerHTML = `
    <div class="card">
      <h3>Add expense</h3>
      <form id="expense-form">
        <div class="form-row two">
          <label>Date
            <input type="date" name="date" value="${state.expenseForm.date}" required />
          </label>
          <label>Category
            <select name="category">
              ${categories.map(cat => `<option value="${cat}" ${state.expenseForm.category === cat ? "selected" : ""}>${cat}</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="form-row two">
          <label>Description
            <input name="description" placeholder="Swiggy dinner" value="${state.expenseForm.description}" required />
          </label>
          <label>Amount (₹)
            <input name="amount" inputmode="decimal" value="${state.expenseForm.amount}" required />
          </label>
        </div>
        <div class="form-row two">
          <label>Account (optional)
            <input name="account" value="${state.expenseForm.account}" placeholder="HDFC Credit" />
          </label>
        </div>
        <button type="submit">Add expense</button>
      </form>
    </div>
    <div class="card">
      <h3>Upload statement</h3>
      <p class="muted">Upload CSV exported from your bank. Password protected files require entering the password hint.</p>
      <form id="upload-form">
        <div class="form-row two">
          <label>Password hint
            <input name="password" value="${state.uploadPassword}" placeholder="Leave blank if not protected" />
          </label>
          <label>Note for this upload
            <input name="note" value="${state.uploadNote}" placeholder="e.g., SBI Jan statement" />
          </label>
        </div>
        <div class="form-row">
          <label>File
            <input type="file" name="file" accept=".csv" />
          </label>
        </div>
        <div class="form-row two">
          <button type="button" id="upload-bank" class="secondary">Upload bank CSV</button>
          <button type="button" id="upload-card" class="secondary">Upload card CSV</button>
        </div>
      </form>
    </div>
    <div class="card">
      <div class="header" style="margin-bottom:16px;">
        <h3>Transactions for ${state.month}</h3>
        <button type="button" id="download-csv" class="secondary">Download CSV</button>
      </div>
      ${txns.length ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Account</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${txns
                .map(
                  txn => `
                    <tr>
                      <td>${txn.date}</td>
                      <td>${txn.description}</td>
                      <td><span class="tag">${txn.category}</span></td>
                      <td>${formatINR(txn.amount)}</td>
                      <td>${txn.account || "—"}</td>
                      <td><button type="button" class="danger" data-delete="${txn.id}">Delete</button></td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      ` : '<p class="muted">No expenses recorded yet.</p>'}
    </div>
  `;

  const expenseForm = section.querySelector("#expense-form");
  expenseForm.addEventListener("change", event => {
    state.expenseForm[event.target.name] = event.target.value;
  });
  expenseForm.addEventListener("submit", event => {
    event.preventDefault();
    const formData = new FormData(expenseForm);
    addTxn({
      date: formData.get("date"),
      description: formData.get("description"),
      category: formData.get("category"),
      amount: formData.get("amount"),
      account: formData.get("account"),
    });
  });

  section.querySelectorAll("[data-delete]").forEach(button => {
    button.addEventListener("click", () => deleteTxn(button.dataset.delete));
  });

  section.querySelector("#download-csv").addEventListener("click", downloadCurrentCsv);

  const uploadForm = section.querySelector("#upload-form");
  uploadForm.addEventListener("change", event => {
    if (event.target.name === "password") {
      state.uploadPassword = event.target.value;
    }
    if (event.target.name === "note") {
      state.uploadNote = event.target.value;
    }
  });
  const fileInput = uploadForm.querySelector("input[name='file']");
  uploadForm.querySelector("#upload-bank").addEventListener("click", () => {
    handleUpload(fileInput.files[0], "bank");
  });
  uploadForm.querySelector("#upload-card").addEventListener("click", () => {
    handleUpload(fileInput.files[0], "card");
  });
}

function renderLoans(section) {
  const emis = activeUserEmis();
  section.innerHTML = `
    <div class="card">
      <h3>Add EMI / Loan</h3>
      <form id="emi-form">
        <div class="form-row two">
          <label>Lender
            <input name="lender" value="${state.emiForm.lender}" placeholder="HDFC Bank" required />
          </label>
          <label>Purpose
            <input name="purpose" value="${state.emiForm.purpose}" placeholder="Education loan" required />
          </label>
        </div>
        <div class="form-row two">
          <label>Monthly EMI (₹)
            <input name="monthlyEMI" value="${state.emiForm.monthlyEMI}" inputmode="decimal" required />
          </label>
          <label>Due day of month
            <input name="dueDayOfMonth" value="${state.emiForm.dueDayOfMonth}" inputmode="numeric" />
          </label>
        </div>
        <div class="form-row two">
          <label>Start date
            <input type="date" name="startDate" value="${state.emiForm.startDate}" />
          </label>
          <label>End date (optional)
            <input type="date" name="endDate" value="${state.emiForm.endDate}" />
          </label>
        </div>
        <button type="submit">Add EMI</button>
      </form>
    </div>
    <div class="card">
      <h3>Active EMIs</h3>
      ${emis.length ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Lender</th>
                <th>Purpose</th>
                <th>Monthly EMI</th>
                <th>Due day</th>
                <th>Start</th>
                <th>End</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${emis
                .map(
                  emi => `
                    <tr>
                      <td>${emi.lender}</td>
                      <td>${emi.purpose}</td>
                      <td>${formatINR(emi.monthlyEMI)}</td>
                      <td>${emi.dueDayOfMonth}</td>
                      <td>${emi.startDate}</td>
                      <td>${emi.endDate || "—"}</td>
                      <td><button type="button" class="secondary" data-close="${emi.id}">Mark as closed</button></td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      ` : '<p class="muted">No active EMIs. Add one to start tracking repayment schedules.</p>'}
    </div>
  `;

  const emiForm = section.querySelector("#emi-form");
  emiForm.addEventListener("change", event => {
    state.emiForm[event.target.name] = event.target.value;
  });
  emiForm.addEventListener("submit", event => {
    event.preventDefault();
    const formData = new FormData(emiForm);
    addEmi({
      lender: formData.get("lender"),
      purpose: formData.get("purpose"),
      monthlyEMI: formData.get("monthlyEMI"),
      dueDayOfMonth: formData.get("dueDayOfMonth"),
      startDate: formData.get("startDate"),
      endDate: formData.get("endDate"),
    });
  });

  section.querySelectorAll("[data-close]").forEach(button => {
    button.addEventListener("click", () => closeEmi(button.dataset.close));
  });
}

function renderReports(section) {
  const rows = computeReportRows();
  const months = rows.map(row => row.month);
  const categoryTotals = aggregateCategoriesInRange(months);
  section.innerHTML = `
    <div class="card">
      <h3>Custom range</h3>
      <form id="report-form">
        <div class="form-row two">
          <label>From (YYYY-MM)
            <input name="from" value="${state.reportForm.from}" />
          </label>
          <label>To (YYYY-MM)
            <input name="to" value="${state.reportForm.to}" />
          </label>
        </div>
        <button type="submit">Update range</button>
      </form>
    </div>
    <div class="card">
      <h3>Income vs Expenses vs EMI</h3>
      ${rows.length ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Salary</th>
                <th>Expenses</th>
                <th>EMI</th>
                <th>Savings</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(row => `
                  <tr>
                    <td>${row.month}</td>
                    <td>${formatINR(row.salary)}</td>
                    <td>${formatINR(row.expenses)}</td>
                    <td>${formatINR(row.emis)}</td>
                    <td>${formatINR(row.savings)}</td>
                  </tr>
                `)
                .join("")}
            </tbody>
          </table>
        </div>
      ` : '<p class="muted">Select a valid month range to view the report.</p>'}
    </div>
    <div class="card">
      <h3>Expense breakdown</h3>
      ${categoryTotals.length ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${categoryTotals
                .map(item => `<tr><td>${item.name}</td><td>${formatINR(item.value)}</td></tr>`)
                .join("")}
            </tbody>
          </table>
        </div>
      ` : '<p class="muted">No spending within the selected range.</p>'}
    </div>
  `;

  const reportForm = section.querySelector("#report-form");
  reportForm.addEventListener("change", event => {
    state.reportForm[event.target.name] = event.target.value;
  });
  reportForm.addEventListener("submit", event => {
    event.preventDefault();
    render();
  });
}

function renderSettings(section) {
  const user = state.users.find(u => u.username === state.activeUser);
  section.innerHTML = `
    <div class="card">
      <h3>Profile</h3>
      <p class="muted">Username: <strong>${user?.username || ""}</strong></p>
      <p class="muted">Biometric login: ${user?.biometricEnabled ? "Enabled" : "Disabled"}</p>
    </div>
    <div class="card">
      <h3>Tips for next steps</h3>
      <ul class="muted" style="line-height:1.6;">
        <li>Connect a backend (e.g., Node.js + PostgreSQL) to persist data securely.</li>
        <li>Integrate WebAuthn for real biometric authentication.</li>
        <li>Add chart libraries like Chart.js for richer visualisations.</li>
        <li>Export reports directly to Excel or Power BI for stakeholder reviews.</li>
      </ul>
    </div>
  `;
}

function renderAppShell() {
  const app = document.getElementById("app");
  const activeTab = state.activeTab;
  const tabs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "expenses", label: "Expenses" },
    { id: "loans", label: "Loans & EMIs" },
    { id: "reports", label: "Reports" },
    { id: "settings", label: "Settings" },
  ];
  app.innerHTML = `
    <section class="app-shell">
      <div class="header">
        <div class="title-group">
          <h1 style="font-size:2rem;margin:0;">Expense Monitor</h1>
          <span class="badge">${state.activeUser}</span>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
          <select id="month-select">
            ${monthOptions()
              .map(option => `<option value="${option}" ${state.month === option ? "selected" : ""}>${option}</option>`)
              .join("")}
          </select>
          <button type="button" id="logout">Logout</button>
        </div>
      </div>
      <nav class="tab-bar">
        ${tabs
          .map(tab => `<button type="button" data-tab="${tab.id}" class="${activeTab === tab.id ? "active" : ""}">${tab.label}</button>`)
          .join("")}
      </nav>
      <section id="tab-content"></section>
    </section>
  `;

  document.getElementById("month-select").addEventListener("change", event => {
    updateMonth(event.target.value);
  });
  document.getElementById("logout").addEventListener("click", logout);
  app.querySelectorAll("[data-tab]").forEach(button => {
    button.addEventListener("click", () => setTab(button.dataset.tab));
  });

  const tabContent = document.getElementById("tab-content");
  if (activeTab === "dashboard") {
    renderDashboard(tabContent);
  } else if (activeTab === "expenses") {
    renderExpenses(tabContent);
  } else if (activeTab === "loans") {
    renderLoans(tabContent);
  } else if (activeTab === "reports") {
    renderReports(tabContent);
  } else if (activeTab === "settings") {
    renderSettings(tabContent);
  }
}

function render() {
  if (!state.activeUser) {
    renderAuth();
  } else {
    renderAppShell();
  }
  persist();
}

render();
