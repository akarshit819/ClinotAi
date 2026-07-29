"use client"

import { useState, useEffect } from "react"
import { Card, CardHeader, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { BookOpen, Loader2, Search, X, Plus, Eye, Globe, Trash2, Edit3 } from "lucide-react"
import { formatDateTime } from "@/lib/utils"

interface KbItem {
  id: string
  question: string
  answer: string
  category: string | null
  source: string | null
  createdAt: string
}

export default function KnowledgePage() {
  const [items, setItems] = useState<KbItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ question: "", answer: "", category: "" })
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ question: "", answer: "", category: "" })

  useEffect(() => {
    fetch("/api/knowledge")
      .then((r) => r.json())
      .then(setItems)
      .finally(() => setLoading(false))
  }, [])

  const categories = Array.from(new Set(items.map((i) => i.category).filter(Boolean)))

  const filtered = items.filter((i) => {
    const q = search.toLowerCase()
    return (
      (i.question.toLowerCase().includes(q) || i.answer.toLowerCase().includes(q)) &&
      (categoryFilter === "all" || i.category === categoryFilter)
    )
  })

  const saveEdit = async (id: string) => {
    await fetch("/api/knowledge", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...editForm }),
    })
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...editForm } : i)))
    setEditingId(null)
  }

  const deleteItem = async (id: string) => {
    await fetch("/api/knowledge", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  const addItem = async () => {
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    })
    if (res.ok) {
      const newItem = await res.json()
      setItems((prev) => [newItem, ...prev])
      setAddForm({ question: "", answer: "", category: "" })
      setShowAdd(false)
    }
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 dark:text-navy-100">Knowledge Base</h1>
          <p className="text-sm text-navy-400 dark:text-navy-400 mt-1">{items.length} entries</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="h-4 w-4" /> Add Entry
        </Button>
      </div>

      {showAdd && (
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-navy-900 dark:text-navy-100">New Entry</h2></CardHeader>
          <CardContent className="space-y-3">
            <input type="text" placeholder="Question" value={addForm.question} onChange={(e) => setAddForm({ ...addForm, question: e.target.value })} className="input-field" />
            <textarea placeholder="Answer" value={addForm.answer} onChange={(e) => setAddForm({ ...addForm, answer: e.target.value })} className="input-field min-h-[100px]" />
            <input type="text" placeholder="Category (optional)" value={addForm.category} onChange={(e) => setAddForm({ ...addForm, category: e.target.value })} className="input-field" />
            <div className="flex gap-2">
              <Button onClick={addItem} disabled={!addForm.question || !addForm.answer}>Save</Button>
              <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-400 dark:text-navy-500" />
          <input type="text" placeholder="Search knowledge base..." value={search} onChange={(e) => setSearch(e.target.value)} className="input-field pl-9 pr-8" />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4 text-navy-400 dark:text-navy-500" /></button>}
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="input-field w-auto">
          <option value="all">All Categories</option>
          {categories.map((c) => <option key={c} value={c!}>{c}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
          <BookOpen className="h-12 w-12 mx-auto mb-3 text-navy-300 dark:text-navy-600" />
          <p className="text-navy-500 dark:text-navy-400 font-medium">No entries found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <Card key={item.id}>
              <CardContent className="pt-5">
                {editingId === item.id ? (
                  <div className="space-y-3">
                    <input type="text" value={editForm.question} onChange={(e) => setEditForm({ ...editForm, question: e.target.value })} className="input-field" />
                    <textarea value={editForm.answer} onChange={(e) => setEditForm({ ...editForm, answer: e.target.value })} className="input-field min-h-[80px]" />
                    <input type="text" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} className="input-field" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEdit(item.id)}>Save</Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-navy-900 dark:text-navy-100 mb-1">{item.question}</div>
                        <div className="text-xs text-navy-500 dark:text-navy-400 line-clamp-2">{item.answer}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => { setEditingId(item.id); setEditForm({ question: item.question, answer: item.answer, category: item.category || "" }) }} className="p-1.5 hover:bg-navy-50 dark:hover:bg-navy-750 rounded-lg"><Edit3 className="h-3.5 w-3.5 text-navy-400 dark:text-navy-500" /></button>
                        <button onClick={() => deleteItem(item.id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"><Trash2 className="h-3.5 w-3.5 text-red-400" /></button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.category && <Badge variant="primary">{item.category}</Badge>}
                      {item.source && <Badge variant="neutral">{item.source}</Badge>}
                      <span className="text-[10px] text-navy-400 dark:text-navy-500">{formatDateTime(item.createdAt)}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
