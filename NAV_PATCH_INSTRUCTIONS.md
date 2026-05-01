# Nav Bar Patch: Add "Last Update" date

## 1. In app/page.tsx - Add getMeta to imports

Find this line:
```
} from "@/lib/data";
```

Change the import block to also include `getMeta`:
```
  getMeta,
} from "@/lib/data";
```

## 2. In app/page.tsx - Call getMeta() at the top of the component

Find where the component function starts (the main export default function), and add this near the top alongside other data fetches:
```tsx
const meta = getMeta();
```

## 3. In app/page.tsx - Add date to nav bar

Find the nav element that contains "METRO POWER RANKINGS". Right after that div/span, add:
```tsx
{meta.lastUpdate && (
  <span className="text-xs text-[var(--text-muted)] ml-4">
    Last Update: {meta.lastUpdate}
  </span>
)}
```

## 4. Copy lib-data.ts to lib/data.ts

```powershell
Copy-Item "lib-data.ts" "lib\data.ts"
```
