/**
 * The header name the dashboard unlock token travels on.
 *
 * Its own module because both sides need it and only one side may be bundled.
 * The client interceptor has to know which header to set; the signing module
 * that reads SESSION_SECRET must never reach a browser. When the constant lived
 * alongside the signing code, importing it from a `'use client'` file pulled
 * that whole module into the client graph, and its top-level secret check threw
 * on render - `process.env.SESSION_SECRET` is undefined in the browser by
 * design, so the guard meant to protect the server took the dashboard down.
 *
 * A string with no imports and no environment access is safe in either graph.
 * Keep it that way: nothing else belongs in this file.
 */
export const UNLOCK_HEADER = 'x-dashboard-unlock';
