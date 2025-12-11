import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Get API base URL from environment or use relative path
// For Firebase Hosting, set VITE_API_URL to your backend URL (e.g., https://your-backend.onrender.com)
// If not set, uses relative URLs (works when backend and frontend are on same domain)
const getApiBaseUrl = (): string => {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) {
    // Remove trailing slash if present
    return apiUrl.replace(/\/$/, "");
  }
  // Use relative URLs (same origin)
  return "";
};

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // If url is already absolute, use it as-is; otherwise prepend API base URL
  const fullUrl = url.startsWith("http") ? url : `${getApiBaseUrl()}${url}`;
  
  const res = await fetch(fullUrl, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    // If url is already absolute, use it as-is; otherwise prepend API base URL
    const fullUrl = url.startsWith("http") ? url : `${getApiBaseUrl()}${url}`;
    
    const res = await fetch(fullUrl, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
