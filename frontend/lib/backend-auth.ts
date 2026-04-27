const BACKEND_TOKEN_KEY = "agile_backend_token";

export function getBackendApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:8080";
}

export function getBackendToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(BACKEND_TOKEN_KEY);
}

export function setBackendToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(BACKEND_TOKEN_KEY, token);
}

export function clearBackendToken(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(BACKEND_TOKEN_KEY);
}

type BackendLoginSuccess = {
  token: string;
  user: {
    id: string;
    role: "admin" | "teacher" | "student";
    studentId: string;
    name: string | null;
    mustChangePassword: boolean;
  };
};

export type BackendLoginResult = {
  token: string;
  user: BackendLoginSuccess["user"];
};

export async function loginBackend(studentId: string, password: string): Promise<BackendLoginResult | null> {
  const response = await fetch(`${getBackendApiBaseUrl()}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ studentId, password }),
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as BackendLoginSuccess;
  if (!json.token) {
    return null;
  }

  return {
    token: json.token,
    user: json.user,
  };
}
