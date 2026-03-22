import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  const body = await req.json();
  const headers = {};
  req.headers.forEach((v, k) => { headers[k] = v; });
  
  console.log('BODY:', JSON.stringify(body));
  console.log('HEADERS:', JSON.stringify(headers));
  
  return Response.json({ body, headers });
});