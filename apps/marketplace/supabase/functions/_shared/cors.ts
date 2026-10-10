export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

export function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const allowedOriginsStr = Deno.env.get("PRODUCT_IMPORT_ALLOWED_ORIGINS") || "";
  const allowedOrigins = allowedOriginsStr.split(",").map(o => o.trim()).filter(Boolean);
  
  let origin = allowedOrigins[0] || "*";
  
  if (requestOrigin) {
    if (allowedOrigins.includes(requestOrigin) || requestOrigin === "http://localhost:3000" || requestOrigin === "http://localhost:5173") {
      origin = requestOrigin;
    }
  }
  
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
  };
}
