import { redirect } from "next/navigation"

export default function LeadsRedirect() {
  redirect("/dashboard/patients")
}
