import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CalendarDays, CreditCard, FileText, LogIn, LogOut, PieChart, Plus, Upload, Wallet } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Pie, PieChart as RPieChart, Cell, BarChart, Bar, Legend } from "recharts";

// --- Types
type User = {
  username: string;
  password: string;
  biometricEnabled?: boolean;
};

// A transaction extracted from manual entry or bank statement
type Txn = {
  id: string;
  user: string; // username
  date: string; // YYYY-MM-DD
  description: string;
  category: string; // Food/Shopping/Travel/Bills/etc
  amount: number; // positive value for outflow; income captured via salary
  account?: string; // bank or card
  meta?: Record<string, string>;
};

// An EMI/loan item
type EMI = {
  id: string;
  user: string;
  lender: string; // Bank/Card
  purpose: string; // e.g., Phone, Education loan, Credit Card
  monthlyEMI: number;
  dueDayOfMonth: number; // 1-28/30/31
  startDate: string; // YYYY-MM-DD
  endDate?: string; // optional
  status?: "active" | "closed";
};

// Storage helpers
const LS_KEYS = {
  users: "expmon.users",
  active: "expmon.active",
  salary: "expmon.salaryByMonth", // record: {"username|YYYY-MM": number}
  txns: "expmon.txns",
  emis: "expmon.emis",
} as const;

function save<T>(k: string, v: T) {
  localStorage.setItem(k, JSON.stringify(v));
}
function load<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Date helpers
function ym(d: string | Date) {
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = `${dt.getMonth() + 1}`.padStart(2, "0");
  return `${y}-${m}`;
}
function thisMonth() {
  return ym(new Date());
}
function formatINR(n: number) {
  return n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
}

// Simple keyword-based category guesser to mimic "AI parsing"
function guessCategory(desc: string) {
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

// Financial score (0-100) basic heuristic
function computeScore({ salary, expenses, emi }: { salary: number; expenses: number; emi: number }) {
  if (salary <= 0) return 0;
  const used = expenses + emi;
  const util = used / salary; // utilization
  let score = 100 - Math.min(100, util * 100);
  // penalties
  if (util > 1) score -= 20;
  if (emi / salary > 0.4) score -= 10; // heavy EMI load
  return Math.max(0, Math.min(100, Math.round(score)));
}

const categories = ["Food", "Travel", "Shopping", "Bills", "Entertainment", "Health", "Education", "Other"] as const;

export default function App() {
  // Auth
  const [users, setUsers] = useState<User[]>(() => load<User[]>(LS_KEYS.users, []));
  const [activeUser, setActiveUser] = useState<string | null>(() => load<string | null>(LS_KEYS.active, null));
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authForm, setAuthForm] = useState({ username: "", password: "", biometric: false });

  // Data
  const [salaryByMonth, setSalaryByMonth] = useState<Record<string, number>>(() => load(LS_KEYS.salary, {} as Record<string, number>));
  const [txns, setTxns] = useState<Txn[]>(() => load<Txn[]>(LS_KEYS.txns, []));
  const [emis, setEmis] = useState<EMI[]>(() => load<EMI[]>(LS_KEYS.emis, []));

  // UI state
  const [month, setMonth] = useState(thisMonth());
  const [uploadPwd, setUploadPwd] = useState("");
  const [uploadNote, setUploadNote] = useState<string>("");

  // Persist
  useEffect(() => save(LS_KEYS.users, users), [users]);
  useEffect(() => save(LS_KEYS.active, activeUser), [activeUser]);
  useEffect(() => save(LS_KEYS.salary, salaryByMonth), [salaryByMonth]);
  useEffect(() => save(LS_KEYS.txns, txns), [txns]);
  useEffect(() => save(LS_KEYS.emis, emis), [emis]);

  const userTxns = useMemo(() => txns.filter(t => t.user === activeUser), [txns, activeUser]);
  const userEmis = useMemo(() => emis.filter(e => e.user === activeUser && (e.status ?? "active") === "active"), [emis, activeUser]);

  const salaryKey = `${activeUser}|${month}`;
  const monthSalary = salaryByMonth[salaryKey] ?? 0;

  const monthTxns = useMemo(() => userTxns.filter(t => ym(t.date) === month), [userTxns, month]);
  const monthExpense = monthTxns.reduce((s, t) => s + t.amount, 0);
  const monthEmi = userEmis.reduce((s, e) => s + e.monthlyEMI, 0);
  const monthSavings = Math.max(0, monthSalary - (monthExpense + monthEmi));

  const score = computeScore({ salary: monthSalary, expenses: monthExpense, emi: monthEmi });

  const healthBadge = () => {
    const used = monthExpense + monthEmi;
    if (used > monthSalary && monthSalary > 0) return <Badge variant="destructive">Over Budget</Badge>;
    if (used <= monthSalary && monthSalary > 0) return <Badge className="bg-emerald-600 hover:bg-emerald-700">Healthy</Badge>;
    return <Badge>Setup needed</Badge>;
  };

  function signup() {
    const exists = users.some(u => u.username === authForm.username.trim());
    if (exists) return alert("Username already exists");
    const u: User = { username: authForm.username.trim(), password: authForm.password, biometricEnabled: authForm.biometric };
    setUsers([...users, u]);
    setActiveUser(u.username);
  }

  function login() {
    const u = users.find(u => u.username === authForm.username.trim() && u.password === authForm.password);
    if (!u) return alert("Invalid credentials");
    setActiveUser(u.username);
  }

  function logout() {
    setActiveUser(null);
  }

  function setSalary(amount: number, scope: "this" | "carryforward" | "range", range?: { from: string; to: string }) {
    const map = { ...salaryByMonth };
    if (!activeUser) return;
    if (scope === "this") {
      map[`${activeUser}|${month}`] = amount;
    } else if (scope === "carryforward") {
      // apply to this month and all future 12 months
      const start = new Date(month + "-01");
      for (let i = 0; i < 12; i++) {
        const d = new Date(start);
        d.setMonth(start.getMonth() + i);
        map[`${activeUser}|${ym(d)}`] = amount;
      }
    } else if (scope === "range" && range) {
      const from = new Date(range.from + "-01");
      const to = new Date(range.to + "-01");
      const cur = new Date(from);
      while (cur <= to) {
        map[`${activeUser}|${ym(cur)}`] = amount;
        cur.setMonth(cur.getMonth() + 1);
      }
    }
    setSalaryByMonth(map);
  }

  function addTxn(t: Omit<Txn, "id" | "user">) {
    if (!activeUser) return;
    setTxns(prev => [{ ...t, id: crypto.randomUUID(), user: activeUser }, ...prev]);
  }

  function addEmi(e: Omit<EMI, "id" | "user">) {
    if (!activeUser) return;
    setEmis(prev => [{ ...e, id: crypto.randomUUID(), user: activeUser, status: "active" }, ...prev]);
  }

  function handleCSVUpload(file: File, type: "bank" | "card") {
    // If password-protected hint (fake-check): prompt and note only; real decryption not in-browser.
    if (/protected|pwd|password/i.test(file.name) && !uploadPwd) {
      alert("This file appears protected. Enter the password in the dialog and re-upload.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        // Expect CSV header: date,description,amount,account(optional)
        const lines = text.split(/\r?\n/).filter(Boolean);
        const header = lines.shift()?.toLowerCase() ?? "";
        const idxDate = header.split(",").findIndex(h => h.includes("date"));
        const idxDesc = header.split(",").findIndex(h => h.includes("desc"));
        const idxAmt = header.split(",").findIndex(h => h.includes("amount"));
        const idxAcc = header.split(",").findIndex(h => h.includes("account"));
        const imported: Txn[] = [];
        for (const line of lines) {
          const cols = line.split(",");
          const dateRaw = cols[idxDate] || "";
          const date = new Date(dateRaw);
          const description = cols[idxDesc] || (type === "card" ? "Card TXN" : "Bank TXN");
          const amount = Math.abs(parseFloat(cols[idxAmt] || "0"));
          const account = cols[idxAcc] || (type === "card" ? "CreditCard" : "Bank");
          if (!isFinite(date.getTime()) || !amount) continue;
          imported.push({
            id: crypto.randomUUID(),
            user: activeUser || "",
            date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
            description,
            category: guessCategory(description),
            amount,
            account,
            meta: { source: type, note: uploadNote || "" },
          });
        }
        if (!imported.length) return alert("No rows detected. Make sure CSV has date, description, amount columns.");
        setTxns(prev => [...imported, ...prev]);
        setUploadNote("");
        setUploadPwd("");
        alert(`Imported ${imported.length} transactions.`);
      } catch (e) {
        console.error(e);
        alert("Failed to parse. Ensure it's a simple CSV (date,description,amount,account?)");
      }
    };
    reader.readAsText(file);
  }

  // Aggregations for charts & reports
  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    monthTxns.forEach(t => (map[t.category] = (map[t.category] || 0) + t.amount));
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [monthTxns]);

  const last12 = useMemo(() => {
    // Build last 12 months series
    const now = new Date(month + "-01");
    const arr: { m: string; salary: number; expenses: number; emi: number; savings: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(now.getMonth() - i);
      const key = `${activeUser}|${ym(d)}`;
      const s = salaryByMonth[key] || 0;
      const e = userTxns.filter(t => ym(t.date) === ym(d)).reduce((s, t) => s + t.amount, 0);
      const em = userEmis.reduce((s2, e2) => s2 + e2.monthlyEMI, 0); // assume constant for simplicity
      arr.push({ m: ym(d), salary: s, expenses: e, emi: em, savings: Math.max(0, s - (e + em)) });
    }
    return arr;
  }, [month, activeUser, salaryByMonth, userTxns, userEmis]);

  function downloadCsv() {
    // Simple export of current month txns
    const rows = [["date", "description", "category", "amount", "account"] as string[]]
      .concat(monthTxns.map(t => [t.date, t.description, t.category, String(t.amount), t.account || ""]))
      .map(r => r.map(x => (/,/.test(x) ? `"${x}"` : x)).join(","))
      .join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!activeUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-800 text-white p-4">
        <Card className="w-full max-w-md bg-zinc-900/60 backdrop-blur border-zinc-700">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold flex items-center gap-2">
              <Wallet className="h-6 w-6" /> Expense Monitor – Login/Signup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={authMode} onValueChange={v => setAuthMode(v as any)}>
              <TabsList className="grid grid-cols-2">
                <TabsTrigger value="login"><LogIn className="h-4 w-4 mr-1"/>Login</TabsTrigger>
                <TabsTrigger value="signup"><Plus className="h-4 w-4 mr-1"/>Signup</TabsTrigger>
              </TabsList>
              <TabsContent value="login" className="space-y-3 pt-4">
                <div>
                  <Label>Username</Label>
                  <Input value={authForm.username} onChange={e => setAuthForm({ ...authForm, username: e.target.value })} placeholder="e.g., murali" />
                </div>
                <div>
                  <Label>Password</Label>
                  <Input type="password" value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox id="bio" checked={authForm.biometric} onCheckedChange={v => setAuthForm({ ...authForm, biometric: Boolean(v) })} />
                    <Label htmlFor="bio">Use biometric (simulated)</Label>
                  </div>
                  <Button className="" onClick={login}><LogIn className="h-4 w-4 mr-2"/>Login</Button>
                </div>
              </TabsContent>
              <TabsContent value="signup" className="space-y-3 pt-4">
                <div>
                  <Label>Username</Label>
                  <Input value={authForm.username} onChange={e => setAuthForm({ ...authForm, username: e.target.value })} placeholder="choose a unique name" />
                </div>
                <div>
                  <Label>Password</Label>
                  <Input type="password" value={authForm.password} onChange={e => setAuthForm({ ...authForm, password: e.target.value })} />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="bio2" checked={authForm.biometric} onCheckedChange={v => setAuthForm({ ...authForm, biometric: Boolean(v) })} />
                  <Label htmlFor="bio2">Enable biometric (simulated)</Label>
                </div>
                <Button onClick={signup} className="w-full"><Plus className="h-4 w-4 mr-2"/>Create account</Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 p-4">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Wallet className="h-6 w-6" />
          <h1 className="text-xl font-semibold">Expense Monitor</h1>
          <Badge variant="secondary">User: {activeUser}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 18 }).map((_, i) => {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const k = ym(d);
                return <SelectItem key={k} value={k}>{k}</SelectItem>;
              })}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={logout}><LogOut className="h-4 w-4 mr-2"/>Logout</Button>
        </div>
      </header>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="grid grid-cols-5 max-w-3xl">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="loans">Loans & EMIs</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* DASHBOARD */}
        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid md:grid-cols-4 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Salary – {month}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="text-2xl font-bold">{formatINR(monthSalary)}</div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm"><Wallet className="h-4 w-4 mr-2"/>Set/Update</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Set salary amount</DialogTitle>
                    </DialogHeader>
                    <SalarySetter onSubmit={setSalary} defaultMonth={month} />
                    <DialogFooter>
                      <Button type="button" variant="ghost">Close</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Expenses</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatINR(monthExpense)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">EMIs</CardTitle></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatINR(monthEmi)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="text-sm">Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-2xl font-bold">Score: {score}</div>
                <div>{healthBadge()}</div>
                {monthSalary > 0 && (
                  <p className="text-sm text-zinc-600">Savings: <b>{formatINR(monthSavings)}</b></p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><PieChart className="h-5 w-5"/> Monthly Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              {categoryTotals.length ? (
                <ResponsiveContainer>
                  <RPieChart>
                    <Pie data={categoryTotals} dataKey="value" nameKey="name" outerRadius={100} label />
                    {/* no explicit colors per instructions; default palette */}
                  </RPieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-sm text-zinc-600">No expenses for this month yet.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5"/> Last 12 Months</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer>
                <AreaChart data={last12}>
                  <XAxis dataKey="m" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Area type="monotone" dataKey="salary" stroke="#8884d8" fillOpacity={0.2} />
                  <Area type="monotone" dataKey="expenses" stroke="#82ca9d" fillOpacity={0.2} />
                  <Area type="monotone" dataKey="emi" stroke="#ffc658" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* EXPENSES */}
        <TabsContent value="expenses" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="md:col-span-1">
              <CardHeader><CardTitle className="text-sm">Add Expense</CardTitle></CardHeader>
              <CardContent>
                <ExpenseForm onAdd={addTxn} activeMonth={month} />
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Upload className="h-4 w-4"/> Upload Statements</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Bank CSV (date,description,amount,account)</Label>
                    <Input type="file" accept=".csv" onChange={e => e.target.files && handleCSVUpload(e.target.files[0], "bank")} />
                  </div>
                  <div className="space-y-2">
                    <Label>Card CSV (date,description,amount,account)</Label>
                    <Input type="file" accept=".csv" onChange={e => e.target.files && handleCSVUpload(e.target.files[0], "card")} />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <Label>File password (if protected)</Label>
                    <Input placeholder="enter if needed" value={uploadPwd} onChange={e => setUploadPwd(e.target.value)} />
                  </div>
                  <div>
                    <Label>Note (stored in meta)</Label>
                    <Input placeholder="e.g., HDFC May 2025" value={uploadNote} onChange={e => setUploadNote(e.target.value)} />
                  </div>
                </div>
                <div className="text-sm text-zinc-600">Tip: You can set a date range later in Reports to analyze specific periods.</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-sm">Transactions – {month}</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={downloadCsv}><FileText className="h-4 w-4 mr-2"/>Export CSV</Button>
              </div>
            </CardHeader>
            <CardContent>
              <TxnTable rows={monthTxns} onDelete={(id) => setTxns(prev => prev.filter(t => t.id !== id))} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* LOANS & EMIs */}
        <TabsContent value="loans" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><CreditCard className="h-4 w-4"/> Add EMI</CardTitle></CardHeader>
              <CardContent>
                <EmiForm onAdd={addEmi} />
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="text-sm">Active EMIs</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead className="text-left text-zinc-600">
                    <tr>
                      <th className="py-2">Lender</th>
                      <th>Purpose</th>
                      <th>Monthly EMI</th>
                      <th>Due Day</th>
                      <th>Start</th>
                      <th>End</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {userEmis.map(e => (
                      <tr key={e.id} className="border-t">
                        <td className="py-2">{e.lender}</td>
                        <td>{e.purpose}</td>
                        <td>{formatINR(e.monthlyEMI)}</td>
                        <td>{e.dueDayOfMonth}</td>
                        <td>{e.startDate}</td>
                        <td>{e.endDate || "—"}</td>
                        <td className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setEmis(prev => prev.map(x => x.id === e.id ? { ...x, status: "closed" } : x))}>Close</Button>
                        </td>
                      </tr>
                    ))}
                    {!userEmis.length && (
                      <tr><td colSpan={7} className="py-4 text-zinc-500">No active EMIs.</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* REPORTS */}
        <TabsContent value="reports" className="space-y-4">
          <ReportSection txns={userTxns} emis={userEmis} salaryByMonth={salaryByMonth} activeUser={activeUser} />
        </TabsContent>

        {/* SETTINGS */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">About & Tips</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-zinc-700">
              <p>
                • This demo stores data locally in your browser (no backend). For your final project, we can
                switch to a real backend (PostgreSQL + Prisma + Next.js API) and add true biometric auth (WebAuthn).
              </p>
              <p>
                • Statement uploads currently support simple CSV. "AI parsing" is mocked with keyword-based categorization.
                We can integrate a real parser later.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SalarySetter({ onSubmit, defaultMonth }: { onSubmit: (amount: number, scope: "this" | "carryforward" | "range", range?: { from: string; to: string }) => void; defaultMonth: string; }) {
  const [amt, setAmt] = useState<string>("");
  const [scope, setScope] = useState<"this" | "carryforward" | "range">("this");
  const [from, setFrom] = useState(defaultMonth);
  const [to, setTo] = useState(defaultMonth);
  return (
    <div className="space-y-3">
      <div>
        <Label>Amount (₹)</Label>
        <Input inputMode="numeric" placeholder="e.g., 50000" value={amt} onChange={e => setAmt(e.target.value)} />
      </div>
      <div>
        <Label>Apply to</Label>
        <Select value={scope} onValueChange={v => setScope(v as any)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="this">This month only</SelectItem>
            <SelectItem value="carryforward">This and next 12 months</SelectItem>
            <SelectItem value="range">Custom month range</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {scope === "range" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>From (YYYY-MM)</Label>
            <Input value={from} onChange={e => setFrom(e.target.value)} placeholder="2025-01" />
          </div>
          <div>
            <Label>To (YYYY-MM)</Label>
            <Input value={to} onChange={e => setTo(e.target.value)} placeholder="2025-12" />
          </div>
        </div>
      )}
      <Button onClick={() => onSubmit(Number(amt || 0), scope, scope === "range" ? { from, to } : undefined)}>Save</Button>
    </div>
  );
}

function ExpenseForm({ onAdd, activeMonth }: { onAdd: (t: Omit<Txn, "id" | "user">) => void; activeMonth: string }) {
  const [date, setDate] = useState<string>(`${activeMonth}-15`);
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState<string>("Food");
  const [amt, setAmt] = useState<string>("");
  const [acct, setAcct] = useState<string>("");
  return (
    <div className="space-y-3">
      <div>
        <Label>Date</Label>
        <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div>
        <Label>Description</Label>
        <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g., Swiggy order" />
      </div>
      <div>
        <Label>Category</Label>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Amount (₹)</Label>
        <Input inputMode="numeric" value={amt} onChange={e => setAmt(e.target.value)} />
      </div>
      <div>
        <Label>Account (optional)</Label>
        <Input value={acct} onChange={e => setAcct(e.target.value)} placeholder="e.g., HDFC, SBI, Axis Card" />
      </div>
      <Button onClick={() => {
        const a = Number(amt || 0);
        if (!date || !desc || !a) return alert("Fill date, description, amount");
        onAdd({ date, description: desc, category: cat, amount: a, account: acct });
        setDesc(""); setAmt("");
      }}>Add</Button>
    </div>
  );
}

function TxnTable({ rows, onDelete }: { rows: Txn[]; onDelete: (id: string) => void }) {
  if (!rows.length) return <div className="text-sm text-zinc-600">No transactions this month.</div>;
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-zinc-600">
          <tr>
            <th className="py-2">Date</th>
            <th>Description</th>
            <th>Category</th>
            <th className="text-right">Amount</th>
            <th>Account</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-t">
              <td className="py-2">{r.date}</td>
              <td>{r.description}</td>
              <td><Badge variant="outline">{r.category}</Badge></td>
              <td className="text-right">{formatINR(r.amount)}</td>
              <td>{r.account || "—"}</td>
              <td className="text-right"><Button variant="ghost" size="sm" onClick={() => onDelete(r.id)}>Delete</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmiForm({ onAdd }: { onAdd: (e: Omit<EMI, "id" | "user">) => void }) {
  const [lender, setLender] = useState("");
  const [purpose, setPurpose] = useState("");
  const [emi, setEmi] = useState("");
  const [due, setDue] = useState("5");
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState("");
  return (
    <div className="space-y-3">
      <div>
        <Label>Lender</Label>
        <Input value={lender} onChange={e => setLender(e.target.value)} placeholder="e.g., HDFC Bank" />
      </div>
      <div>
        <Label>Purpose</Label>
        <Input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g., Phone, Credit Card" />
      </div>
      <div>
        <Label>Monthly EMI (₹)</Label>
        <Input value={emi} onChange={e => setEmi(e.target.value)} inputMode="numeric" />
      </div>
      <div>
        <Label>Due day of month</Label>
        <Input value={due} onChange={e => setDue(e.target.value)} inputMode="numeric" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Start Date</Label>
          <Input type="date" value={start} onChange={e => setStart(e.target.value)} />
        </div>
        <div>
          <Label>End Date (optional)</Label>
          <Input type="date" value={end} onChange={e => setEnd(e.target.value)} />
        </div>
      </div>
      <Button onClick={() => {
        const val = Number(emi || 0);
        if (!lender || !purpose || !val) return alert("Fill lender, purpose, EMI amount");
        onAdd({ lender, purpose, monthlyEMI: val, dueDayOfMonth: Number(due || 1), startDate: start, endDate: end || undefined, status: "active" });
        setLender(""); setPurpose(""); setEmi("");
      }}>Add EMI</Button>
    </div>
  );
}

function ReportSection({ txns, emis, salaryByMonth, activeUser }: { txns: Txn[]; emis: EMI[]; salaryByMonth: Record<string, number>; activeUser: string | null; }) {
  const [from, setFrom] = useState<string>(() => ym(new Date(new Date().setMonth(new Date().getMonth() - 5))));
  const [to, setTo] = useState<string>(() => ym(new Date()));

  const months: string[] = useMemo(() => {
    const res: string[] = [];
    const start = new Date(from + "-01");
    const end = new Date(to + "-01");
    const cur = new Date(start);
    while (cur <= end) {
      res.push(ym(cur));
      cur.setMonth(cur.getMonth() + 1);
    }
    return res;
  }, [from, to]);

  const rows = useMemo(() => months.map(m => {
    const s = salaryByMonth[`${activeUser}|${m}`] || 0;
    const e = txns.filter(t => ym(t.date) === m).reduce((acc, t) => acc + t.amount, 0);
    const emi = emis.reduce((acc, x) => acc + x.monthlyEMI, 0);
    const save = Math.max(0, s - (e + emi));
    return { m, s, e, emi, save };
  }), [months, salaryByMonth, txns, emis, activeUser]);

  const catAgg = useMemo(() => {
    const map: Record<string, number> = {};
    txns.filter(t => months.includes(ym(t.date))).forEach(t => map[t.category] = (map[t.category] || 0) + t.amount);
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [txns, months]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Select Range</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-4 gap-3">
          <div>
            <Label>From (YYYY-MM)</Label>
            <Input value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <Label>To (YYYY-MM)</Label>
            <Input value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="h-80">
          <CardHeader><CardTitle className="text-sm">Income vs Expenses vs EMI</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <BarChart data={rows}>
                <XAxis dataKey="m" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Bar dataKey="s" name="Salary" />
                <Bar dataKey="e" name="Expenses" />
                <Bar dataKey="emi" name="EMI" />
                <Bar dataKey="save" name="Savings" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="h-80">
          <CardHeader><CardTitle className="text-sm">Expense Breakdown by Category</CardTitle></CardHeader>
          <CardContent className="h-64">
            {catAgg.length ? (
              <ResponsiveContainer>
                <RPieChart>
                  <Pie data={catAgg} dataKey="value" nameKey="name" label />
                </RPieChart>
              </ResponsiveContainer>
            ) : <div className="text-sm text-zinc-600">No data in selected range.</div>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Tabular Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-zinc-600">
                <tr>
                  <th className="py-2">Month</th>
                  <th>Salary</th>
                  <th>Expenses</th>
                  <th>EMI</th>
                  <th>Savings</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.m} className="border-t">
                    <td className="py-2">{r.m}</td>
                    <td>{formatINR(r.s)}</td>
                    <td>{formatINR(r.e)}</td>
                    <td>{formatINR(r.emi)}</td>
                    <td>{formatINR(r.save)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
