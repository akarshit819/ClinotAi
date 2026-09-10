"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { PageHeader } from "@/components/ui/PageHeader"
import { EmptyState } from "@/components/ui/EmptyState"
import { Users, Loader2, Mail, Phone, Search, X, Download, ArrowUpDown, CalendarCheck, XCircle, PhoneCall } from "lucide-react"
import { formatDateTime } from "@/lib/utils"
import { apiFetch } from "@/lib/client-auth"

interface Lead {
  id: string
  email: string | null
  phone: string | null
  interestedIn: string | null
  source: string | null
  status: string
  createdAt: string
}

const statusColors: Record<string, "warning" | "success" | "primary" | "neutral" | "danger"> = {
  new: "warning",
  contacted: "primary",
  booked: "success",
  lost: "danger",
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<"date" | "status">("date")
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    apiFetch("/api/leads")
      .then((r) => r.json())
      .then(setLeads)
      .finally(() => setLoading(false))
  }, [])

  const updateStatus = async (id: string, status: string) => {
    await apiFetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    })
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)))
  }

  const filtered = leads
    .filter((l) => {
      const q = search.toLowerCase()
      return (
        l.email?.toLowerCase().includes(q) ||
        l.phone?.toLowerCase().includes(q) ||
        l.interestedIn?.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      if (sortBy === "date") {
        return sortAsc
          ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }
      return sortAsc ? a.status.localeCompare(b.status) : b.status.localeCompare(a.status)
    })

  const exportCSV = () => {
    const header = "Email,Phone,Interested In,Source,Status,Created\n"
    const rows = leads.map((l) =>
      `"${l.email || ""}","${l.phone || ""}","${(l.interestedIn || "").replace(/"/g, '""')}","${l.source || ""}","${l.status}","${l.createdAt}"`
    ).join("\n")
    const blob = new Blob([header + rows], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = "leads.csv"; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500 dark:text-primary-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description={`${leads.length} total lead${leads.length === 1 ? "" : "s"} captured`}
        actions={
          <Button size="sm" variant="secondary" onClick={exportCSV}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-400 dark:text-navy-500" />
          <input type="text" placeholder="Search leads..." value={search} onChange={(e) => setSearch(e.target.value)} className="input-field pl-9 pr-8" />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4 text-navy-400 dark:text-navy-500" /></button>}
        </div>
        <button onClick={() => { setSortBy(sortBy === "date" ? "status" : "date"); setSortAsc(!sortAsc) }} className="input-field w-auto flex items-center gap-2 text-sm dark:border-navy-600">
          <ArrowUpDown className="h-4 w-4" />
          Sort by {sortBy === "date" ? "Date" : "Status"} {sortAsc ? "↑" : "↓"}
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="No leads found" description={search ? "Try a different search term." : "Leads will appear here when visitors leave contact info."} />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((lead) => (
            <Card key={lead.id} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/30">
                  <Users className="h-5 w-5 text-amber-500" />
                </div>
                <Badge variant={statusColors[lead.status] || "neutral"}>{lead.status}</Badge>
              </div>
              <div className="space-y-2 mb-4">
                {lead.email && (
                  <div className="flex items-center gap-2 text-sm text-navy-600 dark:text-navy-300">
                    <Mail className="h-3.5 w-3.5 text-navy-400 dark:text-navy-500 shrink-0" />
                    <span className="truncate">{lead.email}</span>
                  </div>
                )}
                {lead.phone && (
                  <div className="flex items-center gap-2 text-sm text-navy-600 dark:text-navy-300">
                    <Phone className="h-3.5 w-3.5 text-navy-400 dark:text-navy-500 shrink-0" />
                    {lead.phone}
                  </div>
                )}
                {lead.interestedIn && (
                  <div className="text-xs text-navy-400 dark:text-navy-500">Interested in: {lead.interestedIn}</div>
                )}
                {lead.source && <Badge variant="neutral">{lead.source}</Badge>}
              </div>
              <div className="text-[10px] text-navy-400 dark:text-navy-500 mb-3">{formatDateTime(lead.createdAt)}</div>
              <div className="flex flex-wrap gap-1.5">
                {lead.status !== "contacted" && (
                  <button onClick={() => updateStatus(lead.id, "contacted")} className="text-[10px] px-2 py-1 rounded-lg bg-primary-50 text-primary-600 hover:bg-primary-100 font-medium">
                    <PhoneCall className="h-3 w-3 inline mr-1" />Contact
                  </button>
                )}
                {lead.status !== "booked" && (
                  <button onClick={() => updateStatus(lead.id, "booked")} className="text-[10px] px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-medium">
                    <CalendarCheck className="h-3 w-3 inline mr-1" />Booked
                  </button>
                )}
                {lead.status !== "lost" && (
                  <button onClick={() => updateStatus(lead.id, "lost")} className="text-[10px] px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-medium">
                    <XCircle className="h-3 w-3 inline mr-1" />Lost
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
