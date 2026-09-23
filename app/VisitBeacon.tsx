// 🔴 THE TWO SUPABASE ADVISOR WARNINGS ABOUT anon EXECUTE ON track_visit ARE
// ACCEPTED, NOT OUTSTANDING. Moved here 2026-09-23 from app/api/v/route.ts,
// which was deleted as dead code; this file is the LIVE path and the place
// anyone chasing those warnings will actually look.
//
// This beacon calls /rest/v1/rpc/track_visit BROWSER-DIRECT with the public
// anon key. Migration lock_down_track_visit_rpc (2026-08-02) revoked anon
// EXECUTE and silently killed it: the .catch(){} below swallows every
// rejection, so page_visits recorded NOTHING for four days before anyone
// noticed. restore_anon_execute_on_track_visit (2026-08-06) put the grant
// back, deliberately, and it is still there.
//
// Do NOT "fix" those warnings without first moving this beacon onto a
// server-side relay. The function is safe to expose as it stands: SECURITY
// DEFINER with search_path pinned, rejects null and inputs over 512
// characters, and only increments a counter keyed on (path, day). The relay
// that was written for this and never wired up is in git history at
// app/api/v/route.ts; if it is ever adopted, SUPABASE_SERVICE_ROLE_KEY must be
// server-side only, never NEXT_PUBLIC_*.

// First-party page-view beacon. Emitted as a raw inline script in the
// server-rendered HTML so it runs on page load WITHOUT waiting for React
// hydration or a useEffect (which did not fire reliably in production), and
// re-fires on client-side navigations by hooking history.pushState + popstate.
// Writes straight to Supabase's track_visit RPC — the browser-direct path is
// proven to persist. Public anon URL + key (already shipped in the client
// bundle), so inlining is safe. No PII: path only.
//
// Owner opt-out: visiting any page with ?notrack=1 sets a localStorage flag so
// this browser is never counted; ?notrack=0 clears it. Standard approach for
// excluding your own visits (per-browser, per-device; incognito won't retain).
export default function VisitBeacon() {
  const js =
    '(function(){' +
    'try{var q=location.search||"";' +
    'if(q.indexOf("notrack=1")>-1){localStorage.setItem("con_no_track","1");}' +
    'else if(q.indexOf("notrack=0")>-1){localStorage.removeItem("con_no_track");}' +
    'if(localStorage.getItem("con_no_track")==="1")return;}catch(e){}' +
    'var U="https://nmprqkmymrdknffwnuur.supabase.co";' +
    'var K="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tcHJxa215bXJka25mZndudXVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDkzNDMsImV4cCI6MjA5ODc4NTM0M30.4RXU3mQ-Yl81ZqC2_a10aizKGu_87B4vt8OK5Pi_-sM";' +
    'function h(){try{fetch(U+"/rest/v1/rpc/track_visit",{method:"POST",headers:{"Content-Type":"application/json",apikey:K,Authorization:"Bearer "+K},body:JSON.stringify({p_path:String(location.pathname).slice(0,512)}),keepalive:true}).catch(function(){});}catch(e){}}' +
    'h();' +
    'var _p=history.pushState;history.pushState=function(){_p.apply(this,arguments);h();};' +
    'addEventListener("popstate",h);' +
    '})();';
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
