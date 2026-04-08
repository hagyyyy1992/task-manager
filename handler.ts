import { getAllTasksRaw, saveAllTasks } from "./db.js";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface LambdaEvent {
  requestContext: { http: { method: string } };
  rawPath: string;
  body?: string;
  isBase64Encoded?: boolean;
}

export const handler = async (event: LambdaEvent) => {
  const method = event.requestContext.http.method;

  if (method === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    if (event.rawPath === "/api/tasks" && method === "GET") {
      const tasks = await getAllTasksRaw();
      return { statusCode: 200, headers, body: JSON.stringify(tasks) };
    }

    if (event.rawPath === "/api/tasks" && method === "PUT") {
      const raw = event.isBase64Encoded
        ? Buffer.from(event.body ?? "", "base64").toString()
        : (event.body ?? "[]");
      await saveAllTasks(JSON.parse(raw));
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 404, headers, body: "" };
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: String(e) }),
    };
  }
};
