import { APPOINTMENT_TOOLS, type AppointmentToolName } from "@/lib/appointment/tools"
import { logger } from "@/lib/logger"
import { z } from "zod"

export interface ToolCall {
  name: string
  arguments: string
}

export interface ToolResult {
  name: string
  result: any
  error?: string
}

function zodToJsonSchema(zodSchema: any): any {
  const shape = zodSchema?.shape
  if (!shape) return { type: "object", properties: {} }

  const properties: Record<string, any> = {}
  const required: string[] = []

  for (const [key, value] of Object.entries(shape)) {
    const field: any = value
    const fieldSchema: any = { type: "string" }

    const def = field?._def
    const typeName = def?.typeName

    if (typeName === "ZodString") {
      fieldSchema.type = "string"
    } else if (typeName === "ZodNumber") {
      fieldSchema.type = "number"
    } else if (typeName === "ZodBoolean") {
      fieldSchema.type = "boolean"
    } else if (typeName === "ZodArray") {
      fieldSchema.type = "array"
      if (field.element) {
        fieldSchema.items = zodToJsonSchema(field.element)
      }
    } else if (typeName === "ZodObject") {
      fieldSchema.type = "object"
      fieldSchema.properties = zodToJsonSchema(field).properties
    } else if (typeName === "ZodOptional") {
      return zodToJsonSchema(field.unwrap())
    } else if (typeName === "ZodNullable") {
      return zodToJsonSchema(field.unwrap())
    } else if (typeName === "ZodDefault") {
      return zodToJsonSchema(field.unwrap())
    }

    if (field.description) {
      fieldSchema.description = field.description
    }

    properties[key] = fieldSchema

    if (typeName !== "ZodOptional" && typeName !== "ZodNullable") {
      required.push(key)
    }
  }

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  }
}

export async function executeToolCall(
  toolCall: ToolCall,
  clinicId: string
): Promise<ToolResult> {
  const toolName = toolCall.name as AppointmentToolName
  // Relative (not "@/...") on purpose: this module is loaded in the
  // production launcher's in-process worker via tsx, where a dynamic
  // import() performs native ESM resolution and cannot resolve the
  // "@" tsconfig alias (production failure: "Cannot find package
  // '@/lib' imported from .../src/lib/ai/tools.ts"). Webpack resolves
  // relative dynamic imports identically, so builds are unaffected.
  const tool = (await import("../appointment/tools")).APPOINTMENT_TOOLS[toolName]

  if (!tool) {
    return {
      name: toolCall.name,
      result: null,
      error: `Unknown tool: ${toolName}`,
    }
  }

  try {
    let args: any
    try {
      args = JSON.parse(toolCall.arguments)
    } catch {
      return {
        name: toolName,
        result: null,
        error: "Invalid tool arguments",
      }
    }

    const result = await tool.execute({ ...args, clinicId })
    return { name: toolName, result }
  } catch (error: any) {
    logger.error(`Tool execution failed: ${toolName}`, { error: error.message })
    return {
      name: toolName,
      result: null,
      error: error.message || "Tool execution failed",
    }
  }
}

export async function buildToolDefinitions(): Promise<any[]> {
  // Relative path — see the comment on executeToolCall above.
  const { APPOINTMENT_TOOLS } = await import("../appointment/tools")
  return Object.values(APPOINTMENT_TOOLS).map(t => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: zodToJsonSchema(t.parameters),
    },
  }))
}

export function formatToolResultsForModel(results: ToolResult[]): string {
  return results.map(r => {
    if (r.error) {
      return `Tool ${r.name} failed: ${r.error}`
    }
    return `Tool ${r.name} result: ${JSON.stringify(r.result)}`
  }).join("\n")
}