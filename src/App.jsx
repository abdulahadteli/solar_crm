/**
 * UR Local Solar Sydney — Solar CRM
 * Built with React + plain CSS (no Tailwind required) + localStorage
 * Structured for future integration with Google Sheets, Airtable, Supabase, or Firebase
 *
 * Architecture note:
 *   All data access goes through the `storageAdapter` object at the top.
 *   To swap to a remote backend, replace the functions in that object only.
 *
 * SETUP: This file needs ONE companion file — App.css — placed in the same
 * folder (src/App.css). Copy that file's contents from the second artifact.
 * Then make sure src/main.jsx imports './App.css' or this file imports it
 * directly (it already does below).
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import "./App.css";

// ─────────────────────────────────────────────
// STORAGE ADAPTER — swap this for remote backend
// ─────────────────────────────────────────────
const storageAdapter = {
  getLeads: () => {
    try {
      return JSON.parse(localStorage.getItem("urlocalsolar_leads") || "[]");
    } catch {
      return [];
    }
  },
  saveLeads: (leads) => {
    localStorage.setItem("urlocalsolar_leads", JSON.stringify(leads));
  },
};

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const LEAD_STATUSES = [
  "New Lead",
  "Contacted",
  "Appointment Booked",
  "Proposal Sent",
  "Needs Follow Up",
  "Won / Accepted",
  "Lost / Not Proceeding",
  "Not Interested",
  "On Hold",
];

const STATUS_CLASS = {
  "New Lead": "badge-blue",
  "Contacted": "badge-purple",
  "Appointment Booked": "badge-amber",
  "Proposal Sent": "badge-indigo",
  "Needs Follow Up": "badge-orange",
  "Won / Accepted": "badge-green",
  "Lost / Not Proceeding": "badge-red",
  "Not Interested": "badge-gray",
  "On Hold": "badge-yellow",
};

const BLANK_LEAD = {
  id: null,
  name: "",
  address: "",
  email: "",
  phone: "",
  status: "New Lead",
  appointmentDate: "",
  systemProposed: "",
  appointmentNotes: "",
  costPrice: "",
  salePrice: "",
  followUpDate: "",
  followUpNotes: "",
  requiredAction: "",
  reasonLost: "",
  customerFeedback: "",
  depositPaid: false,
  installationStatus: "",
  nextAction: "",
  timeline: [],
  createdAt: null,
  updatedAt: null,
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const uid = () => `lead_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const fmt = (val) => {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
};

const fmtCurrency = (val) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 0 }).format(val || 0);

const fmtDate = (dateStr) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
};

const fmtDateTime = (dateStr) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return isNaN(d) ? "—" : d.toLocaleString("en-AU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const isToday = (dateStr) => {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const t = new Date();
  return d.toDateString() === t.toDateString();
};

const isOverdue = (dateStr) => {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date() && !isToday(dateStr);
};

const calcProfit = (sale, cost) => fmt(sale) - fmt(cost);
const calcMargin = (sale, cost) => {
  const s = fmt(sale);
  if (!s) return 0;
  return ((s - fmt(cost)) / s) * 100;
};

// Returns {start, end} Date objects for a given range type
const getDateRange = (rangeType, customFrom, customTo) => {
  const now = new Date();
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

  if (rangeType === "today") {
    return { start: startOfDay(now), end: endOfDay(now) };
  }
  if (rangeType === "week") {
    const start = startOfDay(now);
    const dayOfWeek = start.getDay(); // 0 = Sunday
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    start.setDate(start.getDate() - diffToMonday);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start, end: endOfDay(end) };
  }
  if (rangeType === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: startOfDay(start), end: endOfDay(end) };
  }
  if (rangeType === "custom") {
    if (!customFrom || !customTo) return null;
    return { start: startOfDay(new Date(customFrom)), end: endOfDay(new Date(customTo)) };
  }
  return null; // "all"
};

// CSV export
const toCSV = (leads) => {
  const headers = [
    "Name", "Address", "Email", "Phone", "Status",
    "Appointment Date", "System Proposed", "Cost Price ($)", "Sale Price ($)",
    "Gross Profit ($)", "Margin (%)", "Appointment Notes",
    "Follow Up Date", "Follow Up Notes", "Required Action",
    "Reason Lost", "Customer Feedback",
    "Deposit Paid", "Installation Status", "Next Action",
    "Created", "Updated",
  ];
  const rows = leads.map((l) => [
    l.name, l.address, l.email, l.phone, l.status,
    fmtDateTime(l.appointmentDate), l.systemProposed,
    fmt(l.costPrice), fmt(l.salePrice),
    calcProfit(l.salePrice, l.costPrice).toFixed(2),
    calcMargin(l.salePrice, l.costPrice).toFixed(1),
    l.appointmentNotes,
    fmtDate(l.followUpDate), l.followUpNotes, l.requiredAction,
    l.reasonLost, l.customerFeedback,
    l.depositPaid ? "Yes" : "No", l.installationStatus, l.nextAction,
    fmtDateTime(l.createdAt), fmtDateTime(l.updatedAt),
  ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`));
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
};

const downloadCSV = (content, filename) => {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const downloadSummaryCSV = (leads) => {
  const byStatus = LEAD_STATUSES.map((s) => ({
    status: s,
    count: leads.filter((l) => l.status === s).length,
  }));
  const won = leads.filter((l) => l.status === "Won / Accepted");
  const totalSale = leads.reduce((a, l) => a + fmt(l.salePrice), 0);
  const totalCost = leads.reduce((a, l) => a + fmt(l.costPrice), 0);
  const totalProfit = totalSale - totalCost;

  const lines = [
    ["UR Local Solar Sydney — CRM Summary Report"],
    [`Generated: ${new Date().toLocaleString("en-AU")}`],
    [],
    ["OVERVIEW"],
    ["Total Leads", leads.length],
    ["Appointments Booked", leads.filter((l) => l.appointmentDate).length],
    ["Proposals Sent", leads.filter((l) => l.status === "Proposal Sent").length],
    ["Won Deals", won.length],
    ["Lost Deals", leads.filter((l) => l.status === "Lost / Not Proceeding").length],
    [],
    ["FINANCIALS"],
    ["Total Proposed Sale Value", fmtCurrency(totalSale)],
    ["Total Cost Price", fmtCurrency(totalCost)],
    ["Estimated Gross Profit", fmtCurrency(totalProfit)],
    ["Overall Margin %", `${totalSale ? ((totalProfit / totalSale) * 100).toFixed(1) : 0}%`],
    [],
    ["LEADS BY STATUS"],
    ["Status", "Count"],
    ...byStatus.map((r) => [r.status, r.count]),
  ];

  const csv = lines.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadCSV(csv, `UR_Local_Solar_Summary_${new Date().toISOString().slice(0, 10)}.csv`);
};

// ─────────────────────────────────────────────
// SUBCOMPONENTS
// ─────────────────────────────────────────────
const StatCard = ({ label, value, sub, accent }) => (
  <div className={`stat-card ${accent ? "stat-card-accent" : ""}`}>
    <p className="stat-label">{label}</p>
    <p className={`stat-value ${accent ? "stat-value-accent" : ""}`}>{value}</p>
    {sub && <p className="stat-sub">{sub}</p>}
  </div>
);

const StatusBadge = ({ status }) => (
  <span className={`badge ${STATUS_CLASS[status] || "badge-gray"}`}>{status}</span>
);

const Field = ({ label, required, children }) => (
  <div className="field">
    <label className="field-label">
      {label} {required && <span className="required">*</span>}
    </label>
    {children}
  </div>
);

const Input = (props) => <input {...props} className={`input ${props.className || ""}`} />;
const Textarea = (props) => <textarea {...props} rows={props.rows || 3} className={`textarea ${props.className || ""}`} />;
const Select = ({ children, ...props }) => <select {...props} className={`select ${props.className || ""}`}>{children}</select>;

const Btn = ({ variant = "primary", children, className = "", ...props }) => (
  <button {...props} className={`btn btn-${variant} ${className}`}>
    {children}
  </button>
);

// ─────────────────────────────────────────────
// LEAD FORM MODAL
// ─────────────────────────────────────────────
const LeadFormModal = ({ initial, onSave, onClose }) => {
  const [form, setForm] = useState(() => ({ ...BLANK_LEAD, ...initial }));
  const [newNote, setNewNote] = useState("");
  const [errors, setErrors] = useState({});

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const profit = calcProfit(form.salePrice, form.costPrice);
  const margin = calcMargin(form.salePrice, form.costPrice);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Lead name is required";
    if (!form.status) e.status = "Status is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const now = new Date().toISOString();
    onSave({
      ...form,
      id: form.id || uid(),
      createdAt: form.createdAt || now,
      updatedAt: now,
    });
  };

  const addNote = () => {
    if (!newNote.trim()) return;
    const entry = { id: uid(), text: newNote.trim(), timestamp: new Date().toISOString() };
    set("timeline", [...(form.timeline || []), entry]);
    setNewNote("");
  };

  const isFollowUp = form.status === "Needs Follow Up";
  const isLost = form.status === "Lost / Not Proceeding";
  const isWon = form.status === "Won / Accepted";

  return (
    <div className="modal-overlay">
      <div className="modal modal-md">
        <div className="modal-header">
          <div>
            <p className="modal-eyebrow">UR Local Solar</p>
            <h2 className="modal-title">{form.id ? "Edit Lead" : "Add New Lead"}</h2>
          </div>
          <button onClick={onClose} className="modal-close">✕</button>
        </div>

        <div className="modal-body">
          <div className="grid-2">
            <Field label="Lead Name" required>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Sarah Johnson" />
              {errors.name && <p className="error-text">{errors.name}</p>}
            </Field>
            <Field label="Contact Number">
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="04xx xxx xxx" />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="email@example.com" />
            </Field>
            <Field label="Address">
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Sun St, Sydney NSW" />
            </Field>
          </div>

          <div className="grid-2">
            <Field label="Lead Status" required>
              <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
                {LEAD_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Appointment Date & Time">
              <Input type="datetime-local" value={form.appointmentDate} onChange={(e) => set("appointmentDate", e.target.value)} />
            </Field>
          </div>

          {isFollowUp && (
            <div className="panel panel-orange">
              <p className="panel-title panel-title-orange">📅 Follow-Up Details</p>
              <div className="grid-2">
                <Field label="Next Follow-Up Date">
                  <Input type="date" value={form.followUpDate} onChange={(e) => set("followUpDate", e.target.value)} />
                </Field>
                <Field label="Required Action">
                  <Input value={form.requiredAction} onChange={(e) => set("requiredAction", e.target.value)} placeholder="e.g. Call back to confirm quote" />
                </Field>
              </div>
              <Field label="Follow-Up Notes">
                <Textarea value={form.followUpNotes} onChange={(e) => set("followUpNotes", e.target.value)} placeholder="What needs to happen in this follow-up?" />
              </Field>
            </div>
          )}

          {isLost && (
            <div className="panel panel-red">
              <p className="panel-title panel-title-red">❌ Lost Deal Details</p>
              <Field label="Reason Lost">
                <Input value={form.reasonLost} onChange={(e) => set("reasonLost", e.target.value)} placeholder="e.g. Went with competitor, price too high" />
              </Field>
              <Field label="Customer Feedback / Reservations">
                <Textarea value={form.customerFeedback} onChange={(e) => set("customerFeedback", e.target.value)} placeholder="What did the customer say?" />
              </Field>
            </div>
          )}

          {isWon && (
            <div className="panel panel-green">
              <p className="panel-title panel-title-green">🏆 Won Deal Details</p>
              <div className="grid-2">
                <Field label="Deposit Paid?">
                  <div className="checkbox-row">
                    <input
                      type="checkbox"
                      id="depositPaid"
                      checked={form.depositPaid}
                      onChange={(e) => set("depositPaid", e.target.checked)}
                      className="checkbox"
                    />
                    <label htmlFor="depositPaid">Yes, deposit received</label>
                  </div>
                </Field>
                <Field label="Installation Status">
                  <Select value={form.installationStatus} onChange={(e) => set("installationStatus", e.target.value)}>
                    <option value="">Select...</option>
                    <option>Pending Scheduling</option>
                    <option>Scheduled</option>
                    <option>In Progress</option>
                    <option>Installed</option>
                    <option>Inspection Booked</option>
                    <option>Complete</option>
                  </Select>
                </Field>
              </div>
              <Field label="Next Action">
                <Input value={form.nextAction} onChange={(e) => set("nextAction", e.target.value)} placeholder="e.g. Book installation date" />
              </Field>
            </div>
          )}

          <div className="grid-2">
            <Field label="System Proposed">
              <Input value={form.systemProposed} onChange={(e) => set("systemProposed", e.target.value)} placeholder="e.g. 13.3kW + 10kWh Battery" />
            </Field>
            <div></div>
            <Field label="Cost Price (AUD)">
              <Input type="number" min="0" value={form.costPrice} onChange={(e) => set("costPrice", e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Sale Price Proposed (AUD)">
              <Input type="number" min="0" value={form.salePrice} onChange={(e) => set("salePrice", e.target.value)} placeholder="0.00" />
            </Field>
          </div>

          {(form.costPrice || form.salePrice) && (
            <div className={`profit-banner ${profit >= 0 ? "profit-positive" : "profit-negative"}`}>
              <span className="profit-label">Gross Profit</span>
              <div className="profit-value-wrap">
                <span className="profit-value">{fmtCurrency(profit)}</span>
                <span className="profit-margin">({margin.toFixed(1)}% margin)</span>
              </div>
            </div>
          )}

          <Field label="Appointment Notes">
            <Textarea value={form.appointmentNotes} onChange={(e) => set("appointmentNotes", e.target.value)} placeholder="Site details, roof type, shading, customer requirements..." />
          </Field>

          <div>
            <p className="section-title">📝 Notes Timeline</p>
            <div className="timeline-list">
              {(form.timeline || []).length === 0 && <p className="empty-note">No notes yet. Add one below.</p>}
              {(form.timeline || []).map((n) => (
                <div key={n.id} className="timeline-item">
                  <p className="timeline-time">{fmtDateTime(n.timestamp)}</p>
                  <p className="timeline-text">{n.text}</p>
                </div>
              ))}
            </div>
            <div className="add-note-row">
              <Input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a note..." onKeyDown={(e) => e.key === "Enter" && addNote()} />
              <Btn variant="secondary" onClick={addNote}>Add</Btn>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSave}>{form.id ? "💾 Save Changes" : "➕ Add Lead"}</Btn>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// DELETE CONFIRM
// ─────────────────────────────────────────────
const DeleteConfirm = ({ lead, onConfirm, onClose }) => (
  <div className="modal-overlay">
    <div className="modal modal-sm modal-center">
      <div className="confirm-icon">🗑️</div>
      <h3 className="confirm-title">Delete Lead?</h3>
      <p className="confirm-text">This will permanently delete <strong>{lead.name}</strong>. This cannot be undone.</p>
      <div className="confirm-actions">
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn variant="danger" onClick={onConfirm}>Delete</Btn>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────
// LEAD DETAIL MODAL
// ─────────────────────────────────────────────
const LeadDetailModal = ({ lead, onEdit, onClose }) => (
  <div className="modal-overlay">
    <div className="modal modal-md">
      <div className="modal-header">
        <div>
          <p className="modal-eyebrow">Lead Detail</p>
          <h2 className="modal-title">{lead.name}</h2>
        </div>
        <button onClick={onClose} className="modal-close">✕</button>
      </div>
      <div className="modal-body">
        <div className="badge-row">
          <StatusBadge status={lead.status} />
          {isToday(lead.appointmentDate) && <span className="tag tag-amber">📅 Appointment Today</span>}
          {isOverdue(lead.followUpDate) && <span className="tag tag-red">⚠️ Follow-Up Overdue</span>}
        </div>
        <div className="detail-grid">
          <div><p className="detail-label">Address</p><p className="detail-value">{lead.address || "—"}</p></div>
          <div><p className="detail-label">Email</p><p className="detail-value">{lead.email || "—"}</p></div>
          <div><p className="detail-label">Phone</p><p className="detail-value">{lead.phone || "—"}</p></div>
          <div><p className="detail-label">Appointment</p><p className="detail-value">{fmtDateTime(lead.appointmentDate)}</p></div>
          <div><p className="detail-label">System</p><p className="detail-value">{lead.systemProposed || "—"}</p></div>
          <div><p className="detail-label">Sale Price</p><p className="detail-value">{fmtCurrency(lead.salePrice)}</p></div>
          <div><p className="detail-label">Cost Price</p><p className="detail-value">{fmtCurrency(lead.costPrice)}</p></div>
          <div>
            <p className="detail-label">Gross Profit</p>
            <p className={`detail-value ${calcProfit(lead.salePrice, lead.costPrice) >= 0 ? "text-green" : "text-red"}`}>
              {fmtCurrency(calcProfit(lead.salePrice, lead.costPrice))} ({calcMargin(lead.salePrice, lead.costPrice).toFixed(1)}%)
            </p>
          </div>
        </div>
        {lead.appointmentNotes && (
          <div><p className="detail-label">Appointment Notes</p><p className="note-box">{lead.appointmentNotes}</p></div>
        )}
        {lead.status === "Needs Follow Up" && (
          <div className="panel panel-orange">
            <p className="panel-title panel-title-orange">Follow-Up</p>
            <p><span className="muted">Date:</span> {fmtDate(lead.followUpDate)}</p>
            <p><span className="muted">Action:</span> {lead.requiredAction || "—"}</p>
            <p><span className="muted">Notes:</span> {lead.followUpNotes || "—"}</p>
          </div>
        )}
        {lead.status === "Lost / Not Proceeding" && (
          <div className="panel panel-red">
            <p className="panel-title panel-title-red">Lost Reason</p>
            <p>{lead.reasonLost || "—"}</p>
            {lead.customerFeedback && <p className="italic muted">"{lead.customerFeedback}"</p>}
          </div>
        )}
        {lead.status === "Won / Accepted" && (
          <div className="panel panel-green">
            <p className="panel-title panel-title-green">Won Deal</p>
            <p><span className="muted">Deposit:</span> {lead.depositPaid ? "✅ Paid" : "❌ Not yet"}</p>
            <p><span className="muted">Installation:</span> {lead.installationStatus || "—"}</p>
            <p><span className="muted">Next Action:</span> {lead.nextAction || "—"}</p>
          </div>
        )}
        {(lead.timeline || []).length > 0 && (
          <div>
            <p className="detail-label">Notes Timeline</p>
            <div className="timeline-list">
              {lead.timeline.map((n) => (
                <div key={n.id} className="timeline-item">
                  <p className="timeline-time">{fmtDateTime(n.timestamp)}</p>
                  <p className="timeline-text">{n.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="modal-footer">
        <Btn variant="secondary" onClick={onClose}>Close</Btn>
        <Btn variant="primary" onClick={() => { onClose(); onEdit(lead); }}>✏️ Edit Lead</Btn>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────
// DASHBOARD VIEW
// ─────────────────────────────────────────────
const Dashboard = ({ leads, onAddLead, onViewLead }) => {
  const [rangeType, setRangeType] = useState("today"); // today | week | month | custom | all
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const total = leads.length;
  const apptBooked = leads.filter((l) => l.appointmentDate).length;
  const proposalSent = leads.filter((l) => l.status === "Proposal Sent").length;
  const won = leads.filter((l) => l.status === "Won / Accepted");
  const lost = leads.filter((l) => l.status === "Lost / Not Proceeding");
  const totalSale = leads.reduce((a, l) => a + fmt(l.salePrice), 0);
  const totalCost = leads.reduce((a, l) => a + fmt(l.costPrice), 0);
  const totalProfit = totalSale - totalCost;

  const now = new Date();
  const upcomingAppts = leads
    .filter((l) => l.appointmentDate && new Date(l.appointmentDate) >= now)
    .sort((a, b) => new Date(a.appointmentDate) - new Date(b.appointmentDate))
    .slice(0, 5);

  const overdueFollowUps = leads.filter((l) => l.status === "Needs Follow Up" && isOverdue(l.followUpDate));
  const upcomingFollowUps = leads
    .filter((l) => l.status === "Needs Follow Up" && l.followUpDate && !isOverdue(l.followUpDate))
    .sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate))
    .slice(0, 5);

  const byStatus = LEAD_STATUSES.map((s) => ({
    status: s,
    count: leads.filter((l) => l.status === s).length,
    pct: total ? Math.round((leads.filter((l) => l.status === s).length / total) * 100) : 0,
  }));

  // Appointments filtered by the selected date range
  const range = getDateRange(rangeType, customFrom, customTo);
  const apptsInRange = useMemo(() => {
    if (!range) return leads.filter((l) => l.appointmentDate);
    return leads
      .filter((l) => {
        if (!l.appointmentDate) return false;
        const d = new Date(l.appointmentDate);
        return d >= range.start && d <= range.end;
      })
      .sort((a, b) => new Date(a.appointmentDate) - new Date(b.appointmentDate));
  }, [leads, range]);

  const rangeLabel = {
    today: "Today",
    week: "This Week",
    month: "This Month",
    custom: customFrom && customTo ? `${fmtDate(customFrom)} – ${fmtDate(customTo)}` : "Custom Range",
    all: "All Time",
  }[rangeType];

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">{new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <Btn variant="primary" onClick={onAddLead}>☀️ Add Lead</Btn>
      </div>

      <div className="stat-grid">
        <StatCard label="Total Leads" value={total} />
        <StatCard label="Appointments" value={apptBooked} />
        <StatCard label="Proposals Sent" value={proposalSent} />
        <StatCard label="Won Deals" value={won.length} accent />
        <StatCard label="Lost Deals" value={lost.length} />
        <StatCard label="Total Sale Value" value={fmtCurrency(totalSale)} accent />
        <StatCard label="Total Cost Price" value={fmtCurrency(totalCost)} />
        <StatCard label="Est. Gross Profit" value={fmtCurrency(totalProfit)} accent sub={totalSale ? `${((totalProfit / totalSale) * 100).toFixed(1)}% margin` : ""} />
      </div>

      {overdueFollowUps.length > 0 && (
        <div className="alert-box">
          <p className="alert-title">⚠️ {overdueFollowUps.length} Overdue Follow-Up{overdueFollowUps.length > 1 ? "s" : ""}</p>
          <div className="alert-list">
            {overdueFollowUps.map((l) => (
              <div key={l.id} className="alert-item" onClick={() => onViewLead(l)}>
                <span className="alert-name">{l.name}</span>
                <span className="alert-date">{fmtDate(l.followUpDate)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NEW: Appointment Details by Date Range */}
      <div className="card">
        <div className="card-header-row">
          <h3 className="card-title">📅 Appointment Details — {rangeLabel}</h3>
          <span className="count-pill">{apptsInRange.length} appointment{apptsInRange.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="range-controls">
          <div className="range-presets">
            {[
              ["today", "Today"],
              ["week", "This Week"],
              ["month", "This Month"],
              ["all", "All"],
              ["custom", "Custom"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setRangeType(key)}
                className={`pill-btn ${rangeType === key ? "pill-btn-active" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
          {rangeType === "custom" && (
            <div className="custom-range-row">
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <span className="muted">to</span>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          )}
        </div>

        {apptsInRange.length === 0 ? (
          <p className="empty-note" style={{ padding: "1rem 0" }}>
            {rangeType === "custom" && (!customFrom || !customTo)
              ? "Select a from and to date to see appointments in that range."
              : "No appointments scheduled in this range."}
          </p>
        ) : (
          <div className="appt-table-wrap">
            <table className="appt-table">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Date &amp; Time</th>
                  <th>System</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {apptsInRange.map((l) => (
                  <tr key={l.id} onClick={() => onViewLead(l)} className={isToday(l.appointmentDate) ? "row-today" : ""}>
                    <td>
                      <p className="appt-name">{l.name}</p>
                      <p className="appt-sub">{l.phone || l.email || "—"}</p>
                    </td>
                    <td className="appt-datetime">
                      {isToday(l.appointmentDate) ? <span className="text-amber-strong">🌟 Today, {fmtDateTime(l.appointmentDate).split(",").slice(1).join(",")}</span> : fmtDateTime(l.appointmentDate)}
                    </td>
                    <td>{l.systemProposed || "—"}</td>
                    <td><StatusBadge status={l.status} /></td>
                    <td className="appt-notes">{l.appointmentNotes ? (l.appointmentNotes.length > 50 ? l.appointmentNotes.slice(0, 50) + "…" : l.appointmentNotes) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid-dashboard">
        <div className="card">
          <h3 className="card-title">Leads by Status</h3>
          <div className="status-bars">
            {byStatus.filter((s) => s.count > 0).map((s) => (
              <div key={s.status}>
                <div className="status-bar-label">
                  <span>{s.status}</span>
                  <span className="status-bar-count">{s.count}</span>
                </div>
                <div className="status-bar-track">
                  <div className="status-bar-fill" style={{ width: `${s.pct}%` }} />
                </div>
              </div>
            ))}
            {byStatus.every((s) => s.count === 0) && <p className="empty-note centered">No leads yet. Add your first lead!</p>}
          </div>
        </div>

        <div className="stack-gap">
          <div className="card">
            <h3 className="card-title">📅 Upcoming Appointments</h3>
            {upcomingAppts.length === 0 ? (
              <p className="empty-note">No upcoming appointments</p>
            ) : (
              <div className="mini-list">
                {upcomingAppts.map((l) => (
                  <div key={l.id} className={`mini-item ${isToday(l.appointmentDate) ? "mini-item-today" : ""}`} onClick={() => onViewLead(l)}>
                    <div>
                      <p className="mini-name">{l.name}</p>
                      <p className="mini-sub">{l.systemProposed || "—"}</p>
                    </div>
                    <span className={isToday(l.appointmentDate) ? "text-amber-strong" : "muted"}>
                      {isToday(l.appointmentDate) ? "🌟 Today" : fmtDateTime(l.appointmentDate)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="card-title">🔔 Upcoming Follow-Ups</h3>
            {upcomingFollowUps.length === 0 ? (
              <p className="empty-note">No upcoming follow-ups</p>
            ) : (
              <div className="mini-list">
                {upcomingFollowUps.map((l) => (
                  <div key={l.id} className="mini-item" onClick={() => onViewLead(l)}>
                    <div>
                      <p className="mini-name">{l.name}</p>
                      <p className="mini-sub">{l.requiredAction || "—"}</p>
                    </div>
                    <span className="text-orange-strong">{fmtDate(l.followUpDate)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// LEADS TABLE VIEW
// ─────────────────────────────────────────────
const LeadsTable = ({ leads, onAdd, onEdit, onView, onDelete }) => {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterWonLost, setFilterWonLost] = useState("All");
  const [sortField, setSortField] = useState("createdAt");
  const [sortDir, setSortDir] = useState("desc");

  const filtered = useMemo(() => {
    let rows = [...leads];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((l) =>
        [l.name, l.address, l.email, l.phone, l.systemProposed, l.status].some((v) => (v || "").toLowerCase().includes(q))
      );
    }
    if (filterStatus !== "All") rows = rows.filter((l) => l.status === filterStatus);
    if (filterWonLost === "Won") rows = rows.filter((l) => l.status === "Won / Accepted");
    if (filterWonLost === "Lost") rows = rows.filter((l) => l.status === "Lost / Not Proceeding");

    rows.sort((a, b) => {
      let va = a[sortField] ?? "";
      let vb = b[sortField] ?? "";
      if (sortField === "salePrice" || sortField === "costPrice") { va = fmt(va); vb = fmt(vb); }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [leads, search, filterStatus, filterWonLost, sortField, sortDir]);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortHdr = ({ field, children }) => (
    <th className="sort-hdr" onClick={() => toggleSort(field)}>
      {children} {sortField === field ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
    </th>
  );

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">All Leads</h1>
          <p className="page-subtitle">{filtered.length} of {leads.length} leads shown</p>
        </div>
        <div className="btn-row">
          <Btn variant="secondary" onClick={() => downloadCSV(toCSV(filtered), `UR_Local_Solar_Filtered_${new Date().toISOString().slice(0,10)}.csv`)}>⬇ Export Filtered CSV</Btn>
          <Btn variant="secondary" onClick={() => downloadCSV(toCSV(leads), `UR_Local_Solar_All_${new Date().toISOString().slice(0,10)}.csv`)}>⬇ Export All CSV</Btn>
          <Btn variant="primary" onClick={onAdd}>☀️ Add Lead</Btn>
        </div>
      </div>

      <div className="filter-bar">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search leads..." className="input filter-search" />
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setFilterWonLost("All"); }} className="select">
          <option value="All">All Statuses</option>
          {LEAD_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={filterWonLost} onChange={(e) => { setFilterWonLost(e.target.value); setFilterStatus("All"); }} className="select">
          <option value="All">Won &amp; Lost: All</option>
          <option value="Won">Won Only</option>
          <option value="Lost">Lost Only</option>
        </select>
        {(search || filterStatus !== "All" || filterWonLost !== "All") && (
          <Btn variant="ghost" onClick={() => { setSearch(""); setFilterStatus("All"); setFilterWonLost("All"); }}>✕ Clear</Btn>
        )}
      </div>

      <div className="card table-card">
        <div className="table-scroll">
          <table className="leads-table">
            <thead>
              <tr>
                <SortHdr field="name">Name</SortHdr>
                <SortHdr field="status">Status</SortHdr>
                <SortHdr field="appointmentDate">Appointment</SortHdr>
                <SortHdr field="systemProposed">System</SortHdr>
                <SortHdr field="salePrice">Sale Price</SortHdr>
                <th>Profit</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="empty-table-cell"><p className="empty-icon">☀️</p><p className="empty-title">No leads found</p><p className="empty-sub">Try adjusting your search or filters</p></td></tr>
              )}
              {filtered.map((l) => {
                const profit = calcProfit(l.salePrice, l.costPrice);
                const margin = calcMargin(l.salePrice, l.costPrice);
                const apptToday = isToday(l.appointmentDate);
                const followOverdue = l.status === "Needs Follow Up" && isOverdue(l.followUpDate);
                return (
                  <tr key={l.id} className={`${apptToday ? "row-today" : ""} ${followOverdue ? "row-overdue" : ""}`} onClick={() => onView(l)}>
                    <td><p className="cell-name">{l.name}</p><p className="cell-sub">{l.phone || l.email || "—"}</p></td>
                    <td><StatusBadge status={l.status} />{followOverdue && <span className="cell-overdue">⚠️ Overdue</span>}</td>
                    <td className="cell-nowrap">{apptToday ? <span className="text-amber-strong">🌟 Today</span> : fmtDateTime(l.appointmentDate)}</td>
                    <td>{l.systemProposed || "—"}</td>
                    <td className="cell-bold">{l.salePrice ? fmtCurrency(l.salePrice) : "—"}</td>
                    <td>{(l.salePrice || l.costPrice) ? <span className={profit >= 0 ? "text-green-strong" : "text-red-strong"}>{fmtCurrency(profit)} <span className="cell-pct">({margin.toFixed(0)}%)</span></span> : "—"}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="action-row">
                        <Btn variant="ghost" className="btn-icon" onClick={() => onEdit(l)}>✏️</Btn>
                        <Btn variant="ghost" className="btn-icon btn-icon-danger" onClick={() => onDelete(l)}>🗑</Btn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// REPORTS VIEW
// ─────────────────────────────────────────────
const Reports = ({ leads }) => {
  const won = leads.filter((l) => l.status === "Won / Accepted");
  const lost = leads.filter((l) => l.status === "Lost / Not Proceeding");
  const totalSale = leads.reduce((a, l) => a + fmt(l.salePrice), 0);
  const totalCost = leads.reduce((a, l) => a + fmt(l.costPrice), 0);
  const totalProfit = totalSale - totalCost;
  const wonSale = won.reduce((a, l) => a + fmt(l.salePrice), 0);

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports &amp; Export</h1>
          <p className="page-subtitle">Generate stakeholder-ready summaries</p>
        </div>
        <div className="btn-row">
          <Btn variant="secondary" onClick={() => downloadCSV(toCSV(leads), `UR_Local_Solar_All_${new Date().toISOString().slice(0,10)}.csv`)}>⬇ Export All Leads CSV</Btn>
          <Btn variant="success" onClick={() => downloadSummaryCSV(leads)}>📊 Export Summary Report</Btn>
        </div>
      </div>

      <div className="report-grid">
        <div className="card">
          <p className="report-eyebrow">Pipeline Overview</p>
          <div className="report-row"><span>Total Leads</span><span className="report-num">{leads.length}</span></div>
          <div className="report-row"><span>Appointments</span><span className="report-num">{leads.filter((l) => l.appointmentDate).length}</span></div>
          <div className="report-row"><span>Proposals Sent</span><span className="report-num">{leads.filter((l) => l.status === "Proposal Sent").length}</span></div>
          <div className="report-row"><span>On Hold</span><span className="report-num">{leads.filter((l) => l.status === "On Hold").length}</span></div>
        </div>
        <div className="card card-green">
          <p className="report-eyebrow eyebrow-green">Won Deals</p>
          <p className="report-big-num text-green-strong">{won.length}</p>
          <p className="report-sub-green">{fmtCurrency(wonSale)} in closed revenue</p>
          <div className="report-mini-list">
            {won.map((l) => <div key={l.id} className="report-mini-row"><span>{l.name}</span><span className="text-green-strong">{fmtCurrency(l.salePrice)}</span></div>)}
          </div>
        </div>
        <div className="card card-red">
          <p className="report-eyebrow eyebrow-red">Lost Deals</p>
          <p className="report-big-num text-red-strong">{lost.length}</p>
          <p className="report-sub-red">{fmtCurrency(lost.reduce((a, l) => a + fmt(l.salePrice), 0))} in lost potential</p>
          <div className="report-mini-list">
            {lost.map((l) => <div key={l.id} className="report-mini-text">{l.name}{l.reasonLost ? ` — ${l.reasonLost}` : ""}</div>)}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Financial Summary</h3>
        <div className="financial-grid">
          <div className="financial-cell"><p className="financial-label">Total Proposed Sale</p><p className="financial-value">{fmtCurrency(totalSale)}</p></div>
          <div className="financial-cell"><p className="financial-label">Total Cost Price</p><p className="financial-value financial-value-muted">{fmtCurrency(totalCost)}</p></div>
          <div className="financial-cell">
            <p className="financial-label">Est. Gross Profit</p>
            <p className={`financial-value ${totalProfit >= 0 ? "text-green-strong" : "text-red-strong"}`}>{fmtCurrency(totalProfit)}</p>
            <p className="financial-margin">{totalSale ? `${((totalProfit / totalSale) * 100).toFixed(1)}% margin` : ""}</p>
          </div>
        </div>
      </div>

      <div className="card table-card">
        <h3 className="card-title">Lead Status Breakdown</h3>
        <table className="status-table">
          <thead><tr><th>Status</th><th className="text-right">Count</th><th className="text-right">Sale Value</th><th className="text-right">Gross Profit</th></tr></thead>
          <tbody>
            {LEAD_STATUSES.map((s) => {
              const group = leads.filter((l) => l.status === s);
              if (!group.length) return null;
              const gSale = group.reduce((a, l) => a + fmt(l.salePrice), 0);
              const gCost = group.reduce((a, l) => a + fmt(l.costPrice), 0);
              const gProfit = gSale - gCost;
              return (
                <tr key={s}>
                  <td><StatusBadge status={s} /></td>
                  <td className="text-right cell-bold">{group.length}</td>
                  <td className="text-right">{gSale ? fmtCurrency(gSale) : "—"}</td>
                  <td className={`text-right cell-bold ${gProfit >= 0 ? "text-green-strong" : "text-red-strong"}`}>{gSale || gCost ? fmtCurrency(gProfit) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="roadmap-card">
        <p className="roadmap-eyebrow">Future Roadmap</p>
        <h3 className="roadmap-title">Turning this into a full CRM</h3>
        <div className="roadmap-grid">
          {[
            ["📊", "Google Sheets Integration", "Auto-sync leads to a shared Google Sheet for stakeholder visibility"],
            ["📧", "Email / SMS Templates", "Pre-built follow-up and proposal templates triggered by status changes"],
            ["🔔", "Automated Follow-Up Reminders", "Email or SMS alerts when a follow-up date is approaching"],
            ["📋", "Proposal Tracking", "Send and track proposal opens, views, and signatures"],
            ["👥", "Team Access & Role-Based Permissions", "Multi-user access with admin, sales, and installer roles"],
            ["🔧", "Installer / Job Status Tracking", "Separate installer view with job scheduling and sign-off"],
            ["📍", "Lead Source Tracking", "Track where leads come from — ads, referrals, website, walk-in"],
            ["📅", "Calendar Integration", "Sync appointments directly to Google Calendar or Outlook"],
            ["📱", "Mobile App", "Native iOS/Android app for field sales reps"],
            ["🤖", "AI Proposal Generator", "Auto-draft proposals based on lead data and system specs"],
          ].map(([icon, title, desc]) => (
            <div key={title} className="roadmap-item">
              <span className="roadmap-icon">{icon}</span>
              <div><p className="roadmap-item-title">{title}</p><p className="roadmap-item-desc">{desc}</p></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────
export default function App() {
  const [leads, setLeads] = useState(() => storageAdapter.getLeads());
  const [view, setView] = useState("dashboard");
  const [formOpen, setFormOpen] = useState(false);
  const [editLead, setEditLead] = useState(null);
  const [viewLead, setViewLead] = useState(null);
  const [deleteLead, setDeleteLead] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { storageAdapter.saveLeads(leads); }, [leads]);

  const saveLead = useCallback((lead) => {
    setLeads((prev) => {
      const exists = prev.find((l) => l.id === lead.id);
      return exists ? prev.map((l) => l.id === lead.id ? lead : l) : [...prev, lead];
    });
    setFormOpen(false);
    setEditLead(null);
  }, []);

  const handleDelete = useCallback(() => {
    if (!deleteLead) return;
    setLeads((prev) => prev.filter((l) => l.id !== deleteLead.id));
    setDeleteLead(null);
  }, [deleteLead]);

  const openAdd = () => { setEditLead(null); setFormOpen(true); };
  const openEdit = (lead) => { setEditLead(lead); setFormOpen(true); };

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "leads", label: "All Leads", icon: "📋" },
    { id: "reports", label: "Reports & Export", icon: "📈" },
  ];

  return (
    <div className="app-shell">
      <header className="mobile-header">
        <div className="mobile-brand">
          <span className="mobile-sun">☀️</span>
          <span className="mobile-brand-text">UR Local Solar<br /><span className="mobile-brand-sub">Sydney CRM</span></span>
        </div>
        <button onClick={() => setSidebarOpen((v) => !v)} className="mobile-menu-btn">☰</button>
      </header>

      <div className="layout">
        <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">☀️</div>
            <div><p className="sidebar-brand">UR Local Solar</p><p className="sidebar-brand-sub">Sydney CRM</p></div>
          </div>
          <nav className="sidebar-nav">
            {navItems.map((item) => (
              <button key={item.id} onClick={() => { setView(item.id); setSidebarOpen(false); }} className={`nav-btn ${view === item.id ? "nav-btn-active" : ""}`}>
                <span>{item.icon}</span>{item.label}
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            <p className="sidebar-count">{leads.length} lead{leads.length !== 1 ? "s" : ""} stored locally</p>
            <Btn variant="primary" className="sidebar-add-btn" onClick={() => { openAdd(); setSidebarOpen(false); }}>☀️ Add Lead</Btn>
          </div>
        </aside>

        {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

        <main className="main-content">
          {view === "dashboard" && <Dashboard leads={leads} onAddLead={openAdd} onViewLead={setViewLead} />}
          {view === "leads" && <LeadsTable leads={leads} onAdd={openAdd} onEdit={openEdit} onView={setViewLead} onDelete={setDeleteLead} />}
          {view === "reports" && <Reports leads={leads} />}
        </main>
      </div>

      {formOpen && <LeadFormModal initial={editLead || BLANK_LEAD} onSave={saveLead} onClose={() => { setFormOpen(false); setEditLead(null); }} />}
      {viewLead && <LeadDetailModal lead={viewLead} onEdit={openEdit} onClose={() => setViewLead(null)} />}
      {deleteLead && <DeleteConfirm lead={deleteLead} onConfirm={handleDelete} onClose={() => setDeleteLead(null)} />}
    </div>
  );
}
