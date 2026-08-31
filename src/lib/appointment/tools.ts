import { z } from "zod"
import { findAvailableSlots, checkSlotAvailability, getNextAvailableSlots, findAvailableSlotsByRange, reserveSlot } from "./availability"
import { prisma } from "@/lib/db"
import { argon2id } from "hash-wasm"
import crypto from "crypto"

export const APPOINTMENT_TOOLS = {
  find_available_slots: {
    name: "find_available_slots",
    description: "Find available appointment slots for a given date range. Use this when patient asks about availability or wants to see open slots.",
    parameters: z.object({
      clinicId: z.string().describe("The clinic ID"),
      startDate: z.string().describe("Start date in ISO format (YYYY-MM-DD)"),
      endDate: z.string().describe("End date in ISO format (YYYY-MM-DD)"),
      providerId: z.string().optional().describe("Optional provider ID to filter by specific doctor"),
      durationMinutes: z.number().optional().default(30).describe("Appointment duration in minutes"),
    }),
    execute: async (args: any) => {
      const { clinicId, startDate, endDate, providerId, durationMinutes = 30 } = args
      const slots = await findAvailableSlotsByRange({
        clinicId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        providerId,
        durationMinutes,
      })
      const available = slots.filter(s => s.available)
      return {
        slots: available.map(s => ({
          startTime: s.startTime.toISOString(),
          endTime: s.endTime.toISOString(),
          providerId: s.providerId,
          providerName: s.providerName,
        })),
        count: available.length,
      }
    },
  },

  check_slot_availability: {
    name: "check_slot_availability",
    description: "Check if a specific time slot is available for booking. Use before attempting to book.",
    parameters: z.object({
      clinicId: z.string().describe("The clinic ID"),
      startTime: z.string().describe("Start time in ISO format"),
      endTime: z.string().describe("End time in ISO format"),
      providerId: z.string().describe("Provider/doctor ID"),
    }),
    execute: async (args: any) => {
      const { clinicId, startTime, endTime, providerId } = args
      const available = await checkSlotAvailability(
        args.clinicId,
        new Date(args.startTime),
        new Date(args.endTime),
        args.providerId
      )
      return { available }
    },
  },

  get_next_available_slots: {
    name: "get_next_available_slots",
    description: "Get the next few available appointment slots. Use when patient wants the earliest available appointment.",
    parameters: z.object({
      clinicId: z.string().describe("The clinic ID"),
      count: z.number().optional().default(5).describe("Number of slots to return"),
      providerId: z.string().optional().describe("Optional provider ID"),
      durationMinutes: z.number().optional().default(30).describe("Appointment duration in minutes"),
    }),
    execute: async (args: any) => {
      const slots = await getNextAvailableSlots(
        args.clinicId,
        args.count || 5,
        args.providerId,
        args.durationMinutes || 30
      )
      return {
        slots: slots.map(s => ({
          startTime: s.startTime.toISOString(),
          endTime: s.endTime.toISOString(),
          providerId: s.providerId,
          providerName: s.providerName,
        })),
        count: slots.length,
      }
    },
  },

  book_appointment: {
    name: "book_appointment",
    description: "Book an appointment slot. Use ONLY after confirming availability with check_slot_availability. Requires patient info and confirmed slot time. patientId is optional — if omitted the system will look up or create the patient by phone number automatically.",
    parameters: z.object({
      clinicId: z.string().describe("The clinic ID"),
      patientId: z.string().optional().describe("The patient ID (optional — system will resolve from phone if not provided)"),
      providerId: z.string().describe("Provider/doctor ID — obtain from find_available_slots or get_next_available_slots"),
      startTime: z.string().describe("Start time in ISO format"),
      endTime: z.string().describe("End time in ISO format"),
      reason: z.string().describe("Reason for appointment"),
      patientName: z.string().describe("Patient full name"),
      phone: z.string().describe("Patient phone number"),
      email: z.string().optional().describe("Patient email"),
    }),
    execute: async (args: any) => {
      const requiredFields = [
        { key: "clinicId", label: "Clinic ID" },
        { key: "providerId", label: "Provider/doctor ID" },
        { key: "startTime", label: "Start time (ISO format)" },
        { key: "endTime", label: "End time (ISO format)" },
        { key: "reason", label: "Reason for appointment" },
        { key: "patientName", label: "Patient full name" },
        { key: "phone", label: "Patient phone number" },
      ]

      const missing = requiredFields
        .filter((f) => !args[f.key] || (typeof args[f.key] === "string" && args[f.key].trim() === ""))
        .map((f) => f.label)

      if (missing.length > 0) {
        return {
          success: false,
          error: `Missing required fields: ${missing.join(", ")}. Please collect all required information before booking.`,
          missingFields: missing,
        }
      }

      // Resolve patientId: use provided value, or look up / create patient by phone
      let patientId: string = args.patientId || ""
      if (!patientId || patientId.trim() === "") {
        const existing = await prisma.patient.findFirst({
          where: { clinicId: args.clinicId, phone: args.phone },
          select: { id: true },
        })
        if (existing) {
          patientId = existing.id
        } else {
          const created = await prisma.patient.create({
            data: {
              clinicId: args.clinicId,
              name: args.patientName,
              phone: args.phone,
              email: args.email || null,
            },
          })
          patientId = created.id
        }
      }

      const appointment = await reserveSlot(
        args.clinicId,
        new Date(args.startTime),
        new Date(args.endTime),
        args.providerId,
        patientId,
        args.reason,
        args.patientName,
        args.phone,
        args.email
      )
      return {
        success: true,
        appointmentId: appointment.id,
        confirmation: `Appointment confirmed for ${new Date(args.startTime).toLocaleString()} with Dr. ${args.providerName || "provider"}.`,
      }
    },
  },

  reschedule_appointment: {
    name: "reschedule_appointment",
    description: "Reschedule an existing appointment to a new time slot.",
    parameters: z.object({
      appointmentId: z.string().describe("The appointment ID to reschedule"),
      newStartTime: z.string().describe("New start time in ISO format"),
      newEndTime: z.string().describe("New end time in ISO format"),
      newProviderId: z.string().optional().describe("Optional new provider ID"),
    }),
    execute: async (args: any) => {
      const updated = await prisma.appointment.update({
        where: { id: args.appointmentId },
        data: {
          preferredDate: args.newStartTime.split("T")[0],
          preferredTime: args.newStartTime.split("T")[1].substring(0, 5),
          doctor: args.newProviderId,
        },
      })
      return {
        success: true,
        appointmentId: updated.id,
        confirmation: `Appointment rescheduled to ${new Date(args.newStartTime).toLocaleString()}.`,
      }
    },
  },

  cancel_appointment: {
    name: "cancel_appointment",
    description: "Cancel an existing appointment.",
    parameters: z.object({
      appointmentId: z.string().describe("The appointment ID to cancel"),
      reason: z.string().optional().describe("Reason for cancellation"),
    }),
    execute: async (args: any) => {
      const updated = await prisma.appointment.update({
        where: { id: args.appointmentId },
        data: { status: "cancelled", notes: args.reason || "Cancelled by patient" },
      })
      return {
        success: true,
        appointmentId: updated.id,
        confirmation: "Your appointment has been cancelled.",
      }
    },
  },

  get_appointment_details: {
    name: "get_appointment_details",
    description: "Get details of an existing appointment.",
    parameters: z.object({
      appointmentId: z.string().describe("The appointment ID"),
    }),
    execute: async (args: any) => {
      const appointment = await prisma.appointment.findUnique({
        where: { id: args.appointmentId },
        include: {
          patient: { select: { name: true, phone: true, email: true } },
        },
      })
      if (!appointment) {
        return { error: "Appointment not found" }
      }
      return {
        id: appointment.id,
        patientName: appointment.patientName,
        phone: appointment.phone,
        email: appointment.email,
        reason: appointment.reason,
        preferredDate: appointment.preferredDate,
        preferredTime: appointment.preferredTime,
        status: appointment.status,
        isEmergency: appointment.isEmergency,
        doctor: appointment.doctor,
      }
    },
  },

  get_patient_appointments: {
    name: "get_patient_appointments",
    description: "Get all appointments for a patient.",
    parameters: z.object({
      patientId: z.string().describe("The patient ID"),
      clinicId: z.string().describe("The clinic ID"),
      status: z.string().optional().describe("Filter by status"),
    }),
    execute: async (args: any) => {
      const appointments = await prisma.appointment.findMany({
        where: {
          patientId: args.patientId,
          clinicId: args.clinicId,
          ...(args.status ? { status: args.status } : {}),
        },
        orderBy: { createdAt: "desc" },
      })
      return {
        appointments: appointments.map(a => ({
          id: a.id,
          preferredDate: a.preferredDate,
          preferredTime: a.preferredTime,
          reason: a.reason,
          status: a.status,
          isEmergency: a.isEmergency,
          doctor: a.doctor,
        })),
      }
    },
  },
}

export type AppointmentToolName = keyof typeof APPOINTMENT_TOOLS
export const APPOINTMENT_TOOL_DEFINITIONS = Object.values(APPOINTMENT_TOOLS).map(t => ({
  name: t.name,
  description: t.description,
  parameters: t.parameters,
}))